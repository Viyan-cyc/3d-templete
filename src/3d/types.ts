/**
 * ============================================================
 *  src/3d/types.ts — 3D 模块的核心类型定义
 *
 *  这些类型定义了 initScene() 接收的 JSON 数据结构。
 *  外部调用方按此格式组织数据后传入即可。
 * ============================================================
 */

import type { Object3D } from 'three'

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
  /** CSS2D 卡片配置 */
  card?: CardDef
}

// ---- CSS2D 卡片 ----

/**
 * JSON 中声明的卡片配置（挂在 ModelDef.card 上）
 */
export interface CardDef {
  /**
   * 卡片类型 —— 决定用哪个 React 卡片组件渲染。
   * 与 CardRegistry 中注册的类型名对应，如 'agv'、'container'。
   * 不填则回退到 ModelDef.componentName → ModelDef.type。
   */
  cardType?: string
  /** 是否常显 */
  alwaysVisible?: boolean
  /**
   * 交互模式：
   * - 'always' : 始终显示
   * - 'click'  : 点击物体后显示/隐藏（同 interactiveGroup 内互斥）
   */
  mode?: 'always' | 'click'
  /**
   * 交互分组。mode='click' 时，同一分组内同时只显示一个卡片。
   * 默认使用 type 字段（即 CardHost 中注册的卡片类型名）作为分组。
   */
  interactiveGroup?: string
  /** 物体上方偏移 [x, y, z]，默认 [0, 1.5, 0] */
  offset?: [number, number, number]
  /**
   * 卡片定位锚点（运行时注入，非 JSON 序列化字段）。
   * CSS2D 层挂在其上、跟随其世界坐标。默认取 addCard 传入的 targets[0]。
   */
  anchor?: Object3D
  /** 透传给 React 卡片组件的业务数据 */
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
