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
 * ============================================================
 */

import { App3D } from './App3D'

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

// ---- 卡片系统（Vue UI 层）----
export { CardHost } from './cards'
export type { CardDef, CardState } from './cards'

// ---- 管理器 ----
export { CardManager, cardComponentRegistry } from './managers/card'
export type { CardStateCallback } from './managers/card'
export { ComponentManager, componentManager, registerComponentHandlers } from './managers/component'
export type { ComponentHandler, ComponentContext } from './managers/component'

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

// ---- 模型资产 + 加载 + 混元生成 ----
export { modelRegistry, resolveModelSrc } from './models/registry'
export { loadModel, assetProvider, httpProvider, providers as modelProviders, disposeModelCache } from './models/loader'
export type { ModelProvider, LoadOpts } from './models/loader'
export { hunyuanProvider, normalizeKey } from './models/hunyuan'

// ---- 编辑态拾取（interactive 模式，阶段3 起）----
export { ScenePicker } from './interaction/picker'
export type { PickInfo } from './interaction/picker'

// ---- 3D 组件：构建器 + 注册表 + 缓存 ----
export { ComponentRegistry, AssetPool, Shelf, SolarPanel, registerAllBuilders } from './components'
export type { ComponentCtor, ComponentBuilder, ShelfOptions, ShelfCellCoord, SolarPanelOptions } from './components'

// ---- 基础设施 ----
export { App3D } from './App3D'
export { DebugOverlay } from './debug'
export { AssetLoader, getAssetLoader } from './loaders/AssetLoader'
export type { App3DOptions } from './App3D'
export type { DebugOverlayOptions } from './debug'
export type { SceneConfig } from './types'
