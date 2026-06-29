/**
 * ============================================================
 *  src/3d/index.ts — 3D 模块统一入口
 *
 *  对外暴露:
 *  1. initScene(canvas, data?)     — 初始化 3D 场景 + 卡片系统
 *  2. ComponentRegistry            — 注册自定义 3D 组件
 *  3. cardManager                  — 卡片管理器（控制显隐/类型/状态）
 *
 *  业务开发示例 (Scene3D.vue):
 *
 *  ```ts
 *  import { initScene } from '@/3d'
 *
 *  const resp = await fetch('/api/scene/data')
 *  const { app, cardManager, dispose } = initScene(canvas, resp.data)
 *
 *  // 卡片状态传给 CardHost
 *  cardManager.onStateChange((cards) => { cardStates.value = cards })
 *
 *  // 场景切换: cardManager.freeze() / cardManager.unfreeze()
 *
 *  onUnmounted(() => dispose())
 *  ```
 * ============================================================
 */

import { App3D } from './App3D'
import { MainScene } from './scenes/MainScene'
import { CardManager } from './cards/CardManager'
import type { SceneData } from './types'

export interface SceneAPI {
  app: App3D
  mainScene: MainScene
  /** 卡片管理器 */
  cardManager: CardManager
  dispose: () => void
}

/**
 * 初始化 3D 场景
 *
 * @param canvas    调用方 Vue 组件的 <canvas ref>
 * @param data      场景数据（JSON 解析结果），留空则显示默认 demo
 * @param container 卡片 CSS2D 层的挂载容器（默认取 canvas 的父节点）
 * @param debug     是否显示调试辅助，默认 true
 */
export function initScene(
  canvas: HTMLCanvasElement,
  data?: SceneData,
  container?: HTMLElement,
  debug: boolean = true,
): SceneAPI {
  // 1. 3D 引擎
  const app = new App3D({
    canvas,
    config: data?.config,
    enableShadows: data?.config?.enableShadows ?? true,
    antialias: true,
  })

  // 2. 卡片管理器（CSS2D）
  const cardManager = new CardManager()
  const cssContainer = container ?? canvas.parentElement ?? document.body
  cardManager.attach(cssContainer, app.camera, canvas)

  // 后渲染 CSS2D 层
  app.addPostRenderCallback(() => {
    cardManager.render(app.scene, app.camera)
  })

  // resize 同步
  const originalResize = app['_onResize']?.bind?.(app)
  const resizeObserver = new ResizeObserver(() => {
    cardManager.resize(cssContainer.clientWidth, cssContainer.clientHeight)
  })
  resizeObserver.observe(cssContainer)

  // 3. 场景
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

// ---- 导出 ----
export { App3D } from './App3D'
export { MainScene } from './scenes/MainScene'
export { CardManager, CardHost, cardComponentRegistry } from './cards'
export type { App3DOptions } from './App3D'
export type { MainSceneOptions } from './scenes/MainScene'
export { AssetLoader, getAssetLoader } from './loaders/AssetLoader'
export { ComponentRegistry } from './components'
export type { I3DComponent } from './components'
export type { SceneData, SceneConfig, ModelDef, LightDef, CardDef } from './types'
export type { CardState } from './cards'
export * from './objects'
export * from './lights'
