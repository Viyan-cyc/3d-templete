/**
 * ============================================================
 *  src/3d/index.ts — 3D 模块统一入口
 *
 *  【主入口】createScene3D(canvas, { data, cardRules })
 *    业务方传 live-data JSON + 卡片命名扫描规则即可驱动整个场景。
 *    引擎循环 / PMREM 环境 / OrbitControls / 相机生命周期 /
 *    CSS2D 卡片层 / resize / dispose 全部内置，业务方无需感知 3D 实现。
 *
 *  业务方典型用法（Scene3D.vue）：
 *  ```ts
 *  import { createScene3D, CardHost, cardComponentRegistry } from '@/3d'
 *  import { cardRules } from '@/cards/sceneCardRules'
 *
 *  // cardRules 每条已声明 type + component + 扫描规则，组件会自动注册，无需手动 register
 *  const handle = await createScene3D(canvas, { cardRules })
 *  handle.onCardState((states) => { cardStates.value = states })
 *  onUnmounted(() => handle.dispose())
 *  ```
 *
 *  【次选路径】initScene() —— SceneData + 内置 Shelf/Solar 组件，
 *  降级保留，新场景建议用上面的 createScene3D。
 * ============================================================
 */

import { App3D } from './App3D'
import { MainScene } from './scenes/MainScene'
import { CardManager } from './cards/CardManager'
import type { SceneData } from './types'

// ============================================================
// 主入口（live-data 驱动）
// ============================================================

export { createScene3D } from './createScene3D'
export type {
  Scene3DOptions,
  Scene3DHandle,
  SceneUpdatePatch,
  OrbitControlsInstance,
} from './createScene3D'

// ---- 卡片系统（业务方注册 Vue 卡片组件 + 提供扫描规则）----
export { CardHost, cardComponentRegistry } from './cards'
export { scanAndRegisterCards } from './utils/sceneCards'
export type {
  CardScanRule,
  CardScanGroup,
  CardAnchorSpec,
} from './utils/sceneCards'
export type { CardState, CardDef } from './cards'

// ---- live-data 数据格式（正统数据结构）----
export { loadLiveDataConfig, applyLiveDataToApp, loadGlbObjects, loadModelObjects } from './utils/liveDataLoader'
export type {
  LiveDataConfig,
  LiveDataCamera,
  LiveDataLight,
  LiveDataObject,
  LiveDataGeometry,
  LiveDataMaterial,
  ApplyLiveDataOptions,
} from './utils/liveDataLoader'

// ---- 3d-components 桥（resolver 链最高优先级，阶段1 起）----
export { hasComponent, resolveComponent, createComponentObject, initLibraryBridge, listComponents } from './library/library-bridge'

// ---- 模型加载 provider 链（asset/http/hunyuan，阶段1 起）----
export { loadModel, assetProvider, httpProvider, providers as modelProviders, disposeModelCache } from './loaders/ModelLoader'
export type { ModelProvider, LoadOpts } from './loaders/ModelLoader'
export { hunyuanProvider, normalizeKey } from './loaders/hunyuan-provider'

// ---- postMessage 桥（embed↔octoapp，阶段0 起）----
export { bindPostMessageHost, postToParent, patchHandlerFromHandle } from './bridge/postMessage-host'
export type {
  PostMessageHostHandlers,
  SceneHostMessage,
  SceneEmbedMessage,
} from './bridge/postMessage-host'

// ---- 编辑态拾取（interactive 模式，阶段3 起）----
export { ScenePicker } from './interaction/picker'
export type { PickInfo } from './interaction/picker'

// ============================================================
// 次选路径：SceneData + 内置组件（降级保留）
// ============================================================

export { App3D } from './App3D'
export { DebugOverlay } from './debug'
export { MainScene } from './scenes/MainScene'
export { CardManager } from './cards'
export { ComponentRegistry } from './components'
export { Shelf, SolarPanel } from './components'
export { AssetLoader, getAssetLoader } from './loaders/AssetLoader'
export type { App3DOptions } from './App3D'
export type { DebugOverlayOptions } from './debug'
export type { MainSceneOptions } from './scenes/MainScene'
export type { ShelfOptions, ShelfCellCoord, SolarPanelOptions } from './components'
export type { SceneData, SceneConfig, ModelDef, LightDef } from './types'

export interface SceneAPI {
  app: App3D
  mainScene: MainScene
  cardManager: CardManager
  dispose: () => void
}

/**
 * 初始化 SceneData 驱动的 3D 场景（次选路径，配 MainScene + 内置组件）。
 * 新场景建议用 createScene3D。
 *
 * @param canvas    调用方 Vue 组件的 <canvas ref>
 * @param data      SceneData（JSON 解析结果），留空则显示默认 demo
 * @param container 卡片 CSS2D 层的挂载容器（默认取 canvas 的父节点）
 * @param debug     是否显示调试辅助，默认 true
 */
export function initScene(
  canvas: HTMLCanvasElement,
  data?: SceneData,
  container?: HTMLElement,
  debug: boolean = true,
): SceneAPI {
  const app = new App3D({
    canvas,
    config: data?.config,
    enableShadows: data?.config?.enableShadows ?? true,
    antialias: true,
  })

  const cardManager = new CardManager()
  const cssContainer = container ?? canvas.parentElement ?? document.body
  cardManager.attach(cssContainer, app.camera, canvas)

  app.addPostRenderCallback(() => {
    cardManager.render(app.scene, app.camera)
  })

  const resizeObserver = new ResizeObserver(() => {
    cardManager.resize(cssContainer.clientWidth, cssContainer.clientHeight)
  })
  resizeObserver.observe(cssContainer)

  const mainScene = new MainScene({ app, data, cardManager, debug })

  app.addUpdateCallback(() => mainScene.update())
  app.start()

  return {
    app,
    mainScene,
    cardManager,
    dispose: () => {
      resizeObserver.disconnect()
      mainScene.dispose()
      cardManager.dispose()
      app.dispose()
    },
  }
}
