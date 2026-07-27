/**
 * ============================================================
 *  src/3d/types.ts — 3D 模块的核心类型定义
 * ============================================================
 */

// ---- 场景配置 ----

export interface SceneConfig {
  /** 背景色 (hex) */
  backgroundColor?: string
  /** 雾色 (hex) */
  fogColor?: string
  /** 雾近平面 */
  fogNear?: number
  /** 雾远平面 */
  fogFar?: number
  /** 相机初始位置 */
  cameraPosition?: [number, number, number]
  /** 相机注视点 */
  cameraTarget?: [number, number, number]
  /** 相机 FOV */
  cameraFov?: number
  /** 是否开启阴影 */
  enableShadows?: boolean
  /** HDR 环境贴图路径 */
  envMap?: string
  /** 色调映射曝光度 */
  toneMappingExposure?: number
}

// ---- 辅助 ----

export interface Vector3Like {
  x: number
  y: number
  z: number
}
