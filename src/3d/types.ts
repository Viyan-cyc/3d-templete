/**
 * ============================================================
 *  src/3d/types.ts — 3D 模块的核心类型定义
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

// ---- CSS2D 卡片 ----

/**
 * JSON 中声明的卡片配置
 */
export interface CardDef {
  /**
   * 卡片类型 —— 决定用哪个 Vue 卡片组件渲染。
   * 与 CardRegistry 中注册的类型名对应，如 'agv'、'container'。
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
  /** 透传给 Vue 卡片组件的业务数据 */
  props?: Record<string, unknown>
}

// ---- 辅助 ----

export interface Vector3Like {
  x: number
  y: number
  z: number
}
