/**
 * ============================================================
 *  src/3d/index.ts — 3D 模块统一入口
 *
 *  对外暴露两个核心 API:
 *  1. initScene(canvas, data?)  — 初始化 3D 场景
 *  2. ComponentRegistry         — 注册自定义 3D 组件
 *
 *  使用方式（在调用方 Vue 组件中）:
 *
 *  ```ts
 *  import { initScene, ComponentRegistry } from '@/3d'
 *  import { MyCustomComponent } from 'my-3d-npm-package'
 *
 *  // 注册 npm 包或本地组件
 *  ComponentRegistry.register(new MyCustomComponent())
 *
 *  // 获取数据后初始化
 *  const resp = await fetch('/api/scene/data')
 *  const json = await resp.json()
 *  const sceneAPI = initScene(canvasRef.value, json.data)
 *
 *  // 销毁
 *  onUnmounted(() => sceneAPI.dispose())
 *  ```
 * ============================================================
 */

import { App3D } from './App3D'
import { MainScene } from './scenes/MainScene'
import type { SceneData } from './types'

export interface SceneAPI {
  /** App3D 实例（可访问 renderer / scene / camera） */
  app: App3D
  /** MainScene 实例（可访问 controls / objects） */
  mainScene: MainScene
  /** 销毁场景，释放所有 GPU / 内存资源 */
  dispose: () => void
}

/**
 * 初始化 3D 场景
 *
 * @param canvas    HTMLCanvasElement —— 调用方 Vue 组件的 <canvas ref>
 * @param data      场景数据（来自 JSON 解析），留空则显示默认 demo
 * @param debug     是否显示调试辅助（网格 / 坐标轴），默认 true
 */
export function initScene(
  canvas: HTMLCanvasElement,
  data?: SceneData,
  debug: boolean = true,
): SceneAPI {
  const app = new App3D({
    canvas,
    config: data?.config,
    enableShadows: data?.config?.enableShadows ?? true,
    antialias: true,
  })

  const mainScene = new MainScene({ app, data, debug })

  app.addUpdateCallback(() => mainScene.update())
  app.start()

  return {
    app,
    mainScene,
    dispose: () => {
      mainScene.dispose()
      app.dispose()
    },
  }
}

// ---- 导出 ----
export { App3D } from './App3D'
export { MainScene } from './scenes/MainScene'
export type { App3DOptions } from './App3D'
export type { MainSceneOptions } from './scenes/MainScene'
export { AssetLoader, getAssetLoader } from './loaders/AssetLoader'
export { ComponentRegistry } from './components'
export type { I3DComponent } from './components'
export type { SceneData, SceneConfig, ModelDef, LightDef, ModelType, LightType } from './types'
export * from './objects'
export * from './lights'
