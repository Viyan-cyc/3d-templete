/**
 * ============================================================
 *  src/3d/types.ts — 3D 模块的核心类型定义
 *
 *  这些类型定义了 initScene() 接收的 JSON 数据结构。
 *  外部调用方按此格式组织数据后传入即可。
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

// ---- 灯光 ----

export type LightType = 'ambient' | 'directional' | 'point' | 'spot'

export interface LightDef {
  type: LightType
  color: string
  intensity: number
  position?: [number, number, number]
  castShadow?: boolean
}

// ---- 模型 / 物体 ----

export type ModelType = 'cube' | 'sphere' | 'plane' | 'gltf' | 'component'

export interface ModelDef {
  id: string
  type: ModelType
  /** 当 type === 'component' 时，指向 ComponentRegistry 中注册的组件名 */
  componentName?: string
  /** 当 type === 'gltf' 时，模型文件路径 */
  filePath?: string
  /** 位置 [x, y, z] */
  position?: [number, number, number]
  /** 旋转 [x, y, z] (弧度) */
  rotation?: [number, number, number]
  /** 缩放 [x, y, z] */
  scale?: [number, number, number]
  /** 颜色 (hex) */
  color?: string
  /** 传递给组件的自定义属性 */
  props?: Record<string, unknown>
}

// ---- 场景数据 (JSON 顶层结构) ----

export interface SceneData {
  /** 场景配置 */
  config?: SceneConfig
  /** 灯光列表 */
  lights?: LightDef[]
  /** 模型/物体列表 */
  models?: ModelDef[]
}

// ---- 辅助 ----

export interface Vector3Like {
  x: number
  y: number
  z: number
}
