/**
 * ============================================================
 *  managers/app — App 级 Manager（渲染/场景/相机/灯光/环境/渲染循环）
 *
 *  从 App3D（316 行 God class）拆出；App3D 现为组合根 + facade。
 *  ControlsManager 由 createScene3D 创建（controls 选项在 Scene3DOptions）。
 * ============================================================
 */
export { RendererManager } from './RendererManager';
export type { RendererManagerOptions } from './RendererManager';
export { SceneManager } from './SceneManager';
export type { SceneVisualsConfig } from './SceneManager';
export { EnvironmentManager } from './EnvironmentManager';
export { CameraManager } from './CameraManager';
export type { CameraConfig } from './CameraManager';
export { LightManager } from './LightManager';
export { ControlsManager } from './ControlsManager';
export type { ControlsManagerOptions, ControlsInstance } from './ControlsManager';
export { RenderLoop } from './RenderLoop';
