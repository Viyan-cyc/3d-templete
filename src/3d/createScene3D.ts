/**
 * ============================================================
 *  createScene3D — 3D 模块唯一对外主入口
 *
 *  业务方只需：
 *    const data = await fetch('/api/scene').then(r => r.json())  // 数据由业务方请求
 *    const handle = createScene3D(canvas, data, { cardRules })
 *    handle.onCardState(states => cardStates.value = states)
 *
 *    // 之后按 id 增删改物体（移动的 AGV、变色的状态、动态增删实体…）
 *    handle.update({ objects: { upsert: [...], remove: [...] } })
 *
 *    onUnmounted(() => handle.dispose())
 *
 *  引擎循环 / PMREM 环境 / OrbitControls / 相机生命周期 /
 *  CSS2D 卡片层 / resize / dispose 全部在这里封装，业务方无需感知。
 *
 *  Debug 模式：
 *    URL 添加 ?debug=true 开启 HUD 面板（calls、triangles、FPS 等）
 *    也可通过 handle.setDebug() 运行时切换
 * ============================================================
 */

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { App3D } from './App3D'
import { CardManager } from './cards/CardManager'
import type { CardStateCallback } from './cards/CardManager'
import { createOrbitControls } from './controls/OrbitControls'
import {
  applyLiveDataToApp,
  loadModelObjects,
  type LiveDataConfig,
  type LiveDataObject,
} from './utils/liveDataLoader'
import { scanAndRegisterCards, type CardScanRule } from './utils/sceneCards'
import {
  refreshCards,
  removeObjects,
  upsertObjects,
  type ObjectIndex,
} from './utils/sceneUpdate'

export interface Scene3DControlsOptions {
  minDistance?: number
  maxDistance?: number
  maxPolarAngle?: number
  target?: { x: number; y: number; z: number }
}

export interface Scene3DOptions {
  /** 卡片命名扫描规则（业务方提供，决定哪些物体挂卡片） */
  cardRules?: CardScanRule[]
  /** 卡片 CSS2D 层挂载容器，默认 canvas.parentElement */
  container?: HTMLElement
  /**
   * 调试模式：
   * - false（默认）：关闭
   * - true：显示 HUD 面板（calls、triangles、FPS 等）
   *
   * 也可通过 URL 参数 ?debug=true 开启，URL 参数优先级更高
   */
  debug?: boolean
  /** OrbitControls 配置 */
  controls?: Scene3DControlsOptions
  /** 是否启用阴影，默认 true */
  enableShadows?: boolean
  /**
   * 是否为交互预览态（供 octoapp iframe 嵌入）：
   * - false（默认，生产/交付）：不挂 postMessage 桥、不挂 ScenePicker
   * - true（预览/编辑）：由 embed.vue 调用方设 true，桥与 picker 在 embed 侧挂载
   *
   * 阶段0 仅作字段透传占位；ScenePicker / pick / flyTo / setTheme 的实际分支在阶段3 补。
   */
  interactive?: boolean
}

/** 物体级增量更新补丁 */
export interface SceneUpdatePatch {
  objects?: {
    /** 按 id 增/改（id 已存在则就地补丁，保留身份；不存在则创建并挂父） */
    upsert?: LiveDataObject[]
    /** 按 id 删除 */
    remove?: string[]
  }
}

export interface Scene3DHandle {
  app: App3D
  cardManager: CardManager
  /** OrbitControls 实例，用于编程式控制相机（target / zoom / fit-to-object 等） */
  controls: OrbitControlsInstance
  /** 订阅卡片状态变化，喂给 <CardHost :cards> */
  onCardState(cb: CardStateCallback): () => void
  /** 物体级增量更新（按 id 增删改），自动同步受影响的卡片 */
  update(patch: SceneUpdatePatch): void
  /** 运行时切换调试模式：true 显示 HUD，false 关闭 */
  setDebug(mode: boolean): void
  /** 销毁：释放 GPU/DOM/事件资源 */
  dispose(): void
}

/** OrbitControls 实例类型（便于外部声明变量类型时引用） */
export type OrbitControlsInstance = ReturnType<typeof createOrbitControls>

/** 从 URL 查询参数读取 debug 开关 */
function readDebugFromURL(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const val = params.get('debug')
  return val === 'true' || val === '1'
}

/**
 * 初始化一个完整的 live-data 驱动 3D 场景。
 *
 * @param canvas  调用方的 <canvas>
 * @param data    场景数据（LiveDataConfig，由业务方请求后传入）
 * @param options 其它选项（卡片规则、控制器、调试等）
 *
 * 内部顺序（关键）：数据应用 → 替换相机 → 再创建控制器与卡片层，
 * 确保它们绑定的是最终相机（正交/透视）。
 * GLB 模型异步加载，在同步场景构建完成后自动填充到占位节点。
 */
export async function createScene3D(
  canvas: HTMLCanvasElement,
  data: LiveDataConfig,
  options: Scene3DOptions = {},
): Promise<Scene3DHandle> {
  const { cardRules, controls: controlsOpts, enableShadows = true } = options
  const container = options.container ?? canvas.parentElement ?? document.body

  // URL 参数优先于 options.debug
  const debug = readDebugFromURL() || options.debug || false

  // 1. 3D 引擎
  const app = new App3D({ canvas, enableShadows, antialias: true, debug })

  // 2. 应用数据（内部 app.setCamera 替换相机），拿到 id→Object3D 索引供 update 用
  const width = canvas.clientWidth || container.clientWidth || 1
  const height = canvas.clientHeight || container.clientHeight || 1
  const objectIndex: ObjectIndex = applyLiveDataToApp(app, data, {
    viewSize: { width, height },
  })

  // 3. IBL 环境光（PMREM）—— physical 材质必需；按 config.scene.environment 驱动
  applyEnvironment(app, data)

  // 4. OrbitControls（相机替换之后再创建）
  const controls = createOrbitControls(app.camera, canvas, controlsOpts)

  // 5. 卡片系统（CSS2D）—— 相机替换之后再 attach
  const cardManager = new CardManager()
  cardManager.attach(container, app.camera, canvas)

  // 6. 按业务规则扫描场景、注册卡片
  scanAndRegisterCards(app.scene, cardManager, cardRules ?? [])

  // 7. 接入 App3D 自有渲染循环（update → WebGL render → CSS2D post-render）
  app.addUpdateCallback(() => controls.update())
  app.addPostRenderCallback(() => cardManager.render(app.scene, app.camera))
  app.start() // App3D 内部接管 RAF + window resize（含相机 aspect/正交重算）

  // 8. CSS2D 层尺寸随容器变化（App3D 只管 WebGL canvas 与相机）
  const resizeObserver = new ResizeObserver(() => {
    cardManager.resize(container.clientWidth, container.clientHeight)
  })
  resizeObserver.observe(container)

  // 9. 异步加载外部模型（占位节点已在 applyLiveDataToApp 中创建）
  //     走 ModelLoader provider 链（asset/http/hunyuan）；渲染循环已启动，模型加载完成后自动出现
  loadModelObjects(objectIndex, data.objects).catch((err) => {
    console.error('[createScene3D] 模型加载失败:', err)
  })

  // 10. 收集 3d-components 的 IUpdatable 组件（如 HeatMesh 需要每帧 update）
  //     applyLiveDataToApp 已在 userData.__updatable 标记，这里注册到渲染循环
  const updatables: THREE.Object3D[] = []
  app.scene.traverse((obj) => {
    if (obj.userData?.__updatable) updatables.push(obj)
  })
  if (updatables.length > 0) {
    let lastTime = performance.now()
    app.addUpdateCallback(() => {
      const now = performance.now()
      const delta = Math.min((now - lastTime) / 1000, 0.1) // 秒，封顶 100ms（对齐 IUpdatable 约定）
      lastTime = now
      for (const obj of updatables) {
        ;(obj as unknown as { update?: (d: number) => void }).update?.(delta)
      }
    })
  }

  let disposed = false

  return {
    app,
    cardManager,
    controls,
    onCardState: (cb) => cardManager.onStateChange(cb),
    update(patch: SceneUpdatePatch): void {
      const changed: string[] = []
      if (patch.objects?.remove?.length) {
        changed.push(...removeObjects(objectIndex, patch.objects.remove))
      }
      if (patch.objects?.upsert?.length) {
        changed.push(...upsertObjects(app.scene, objectIndex, patch.objects.upsert))
      }
      refreshCards(app.scene, cardManager, cardRules ?? [], changed)
    },
    setDebug(mode: boolean): void {
      app.setDebug(mode)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      resizeObserver.disconnect()
      controls.dispose()
      cardManager.dispose()
      app.dispose()
    },
  }
}

/** 根据 live-data 的 scene.environment 配置建立 PMREM 环境光 */
function applyEnvironment(app: App3D, config: LiveDataConfig): void {
  const env = config.scene.environment
  const pmrem = new THREE.PMREMGenerator(app.renderer)
  // 默认用 RoomEnvironment 作为 IBL；强度由 config 控制
  const intensity = env?.intensity
  app.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  if (intensity !== undefined) {
    app.scene.environmentIntensity = intensity
  }
  pmrem.dispose()
}
