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
import { App3D } from './App3D'
import { CardManager } from './managers/card/CardManager'
import type { CardStateCallback, CardScanRule } from './managers/card/types'
import { createOrbitControls } from './controls/OrbitControls'
import {
  applyLiveDataToApp,
  loadModelObjects,
  removeObjects,
  upsertObjects,
  type ObjectIndex,
  type LiveDataConfig,
  type LiveDataObject,
} from './scene'
import { ScenePicker } from './interaction/picker'
import { registerComponentHandlers, disposeComponentHandlers } from './managers'

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
   */
  interactive?: boolean
  /**
   * 场景预设名称，数据缺 scene/camera/lights 时回落到预设配置。
   * 内置预设: 'dark'（默认）| 'outdoor' | 'industrial' | 'studio'；
   * 也可通过 registerScenePreset() 注册自定义预设。
   */
  preset?: string
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
  /** 编辑态拾取器（仅 interactive:true 时存在；embed.vue 设 onPick 回传 SCENE_PICK） */
  picker?: ScenePicker
  /** 聚焦到某物体（仅 interactive:true；SCENE_FLY_TO 用） */
  flyTo?: (targetId: string) => void
  /** 切换主题（仅 interactive:true；SCENE_THEME 用） */
  setTheme?: (mode: 'light' | 'dark') => void
  /** 复位相机到初始视角（仅 interactive:true；SCENE_RESET_CAMERA 用） */
  resetCamera?: () => void
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
 */
export async function createScene3D(
  canvas: HTMLCanvasElement,
  data: LiveDataConfig,
  options: Scene3DOptions = {},
): Promise<Scene3DHandle> {
  const { cardRules, controls: controlsOpts, enableShadows = true, interactive = false, preset } = options
  const container = options.container ?? canvas.parentElement ?? document.body

  // URL 参数优先于 options.debug
  const debug = readDebugFromURL() || options.debug || false

  // 0. 注册业务 handler（幂等：重复调用不会重复注册，只是覆盖）
  registerComponentHandlers()

  // 1. 3D 引擎
  const app = new App3D({ canvas, enableShadows, antialias: true, debug })

  // 2. 应用数据（环境 + 物体全量建；内部 app.setCamera 替换相机、含 PMREM 环境），拿到 id→Object3D 索引供 update 用
  const width = canvas.clientWidth || container.clientWidth || 1
  const height = canvas.clientHeight || container.clientHeight || 1
  const objectIndex: ObjectIndex = applyLiveDataToApp(app, data, {
    viewSize: { width, height },
    preset,
  })

  // 3. OrbitControls（相机替换之后再创建）
  const controls = createOrbitControls(app.camera, canvas, controlsOpts)

  // 5. 卡片系统（CSS2D）—— 一步式构造
  const cardManager = new CardManager({ container, camera: app.camera, canvas })

  // 6. 按业务规则扫描场景、注册卡片（实例方法，组件自动注册到 cardManager.registry）
  cardManager.scanAndRegisterCards(app.scene, cardRules ?? [])

  // 7. 接入 App3D 自有渲染循环（update → WebGL render → CSS2D post-render）
  app.addUpdateCallback(() => controls.update())
  app.addPostRenderCallback(() => cardManager.render(app.scene, app.camera))
  app.start() // App3D 内部接管 RAF + window resize（含相机 aspect/正交重算）

  // 8. CSS2D 层尺寸随容器变化（App3D 只管 WebGL canvas 与相机）
  const resizeObserver = new ResizeObserver(() => {
    cardManager.resize(container.offsetWidth, container.offsetHeight)
  })
  resizeObserver.observe(container)

  // 9. 异步加载外部模型（占位节点已在 applyLiveDataToApp 中创建）
  loadModelObjects(objectIndex, data.objects).catch((err) => {
    console.error('[createScene3D] 模型加载失败:', err)
  })

  // 10. 收集 3d-components 的 IUpdatable 组件（如 HeatMesh 需要每帧 update）
  const updatables: THREE.Object3D[] = []
  app.scene.traverse((obj) => {
    if (obj.userData?.__updatable) updatables.push(obj)
  })
  if (updatables.length > 0) {
    let lastTime = performance.now()
    app.addUpdateCallback(() => {
      const now = performance.now()
      const delta = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      for (const obj of updatables) {
        ;(obj as unknown as { update?: (d: number) => void }).update?.(delta)
      }
    })
  }

  // 11. 编辑态拾取器（仅 interactive:true）
  let picker: ScenePicker | undefined
  let flyTo: ((targetId: string) => void) | undefined
  let setTheme: ((mode: 'light' | 'dark') => void) | undefined
  let resetCamera: (() => void) | undefined
  if (interactive) {
    const initialPosition = app.camera.position.clone()
    const lookAt = data.camera?.lookAt
    const initialTarget =
      Array.isArray(lookAt) && lookAt.length >= 3
        ? new THREE.Vector3(Number(lookAt[0]), Number(lookAt[1]), Number(lookAt[2]))
        : controls.target.clone()

    picker = new ScenePicker(app.scene, app.camera, canvas)
    app.addUpdateCallback(() => picker!.update())

    flyTo = (targetId: string) => {
      let target: THREE.Object3D | null = null
      app.scene.traverse((o) => {
        if (!target && o.userData?.__id === targetId) target = o
      })
      if (!target) return
      const box = new THREE.Box3().setFromObject(target)
      const center = new THREE.Vector3()
      const size = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z)
      const dist = maxDim * 2.2 + 1
      controls.target.copy(center)
      const dir = new THREE.Vector3().subVectors(app.camera.position, controls.target)
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.8, 1)
      dir.normalize()
      app.camera.position.copy(center).addScaledVector(dir, dist)
      controls.update()
    }

    setTheme = (mode: 'light' | 'dark') => {
      app.scene.background = new THREE.Color(mode === 'dark' ? '#1a1a2e' : '#c9ccd6')
    }

    resetCamera = () => {
      app.camera.position.copy(initialPosition)
      controls.target.copy(initialTarget)
      app.camera.lookAt(initialTarget)
      controls.update()
    }
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
        changed.push(...removeObjects(app.scene, objectIndex, patch.objects.remove))
      }
      if (patch.objects?.upsert?.length) {
        changed.push(...upsertObjects(app.scene, objectIndex, patch.objects.upsert))
      }
      cardManager.refreshCards(app.scene, cardRules ?? [], changed)
    },
    setDebug(mode: boolean): void {
      app.setDebug(mode)
    },
    picker,
    flyTo,
    setTheme,
    resetCamera,
    dispose(): void {
      if (disposed) return
      disposed = true
      picker?.dispose()
      resizeObserver.disconnect()
      controls.dispose()
      cardManager.dispose()
      disposeComponentHandlers()
      app.dispose()
    },
  }
}
