/**
 * ============================================================
 *  src/3d/managers/card/types.ts — 卡片管理器类型定义
 * ============================================================
 */

import type { Object3D, Camera } from 'three';

// ---- Card Definition (JSON 配置级) ----

/**
 * JSON 中声明的卡片配置
 */
export interface CardDef {

  /**
   * 卡片类型 —— 决定用哪个卡片组件渲染。
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

  /** 透传给卡片组件的业务数据 */
  props?: Record<string, unknown>
}

// ---- Card State (运行时) ----

/**
 * 卡片运行时状态（CardManager 暴露给 UI 层的）
 */
export interface CardState {
  id: string
  type: string
  visible: boolean

  /** 卡片的 DOM 元素，供 CardHost 的 Teleport/Portal 定位 */
  domElement: HTMLElement

  /** 关联的 3D 物体 ID */
  objectId: string

  /** 透传的业务 props */
  props: Record<string, unknown>
}

/** 卡片状态变化回调 */
export type CardStateCallback = (cards: CardState[]) => void

// ---- Card Manager Options ----

/**
 * CardManager 构造选项
 */
export interface CardManagerOptions {

  /** CSS2D 层挂载容器 */
  container: HTMLElement

  /** 用于射线检测的相机 */
  camera: Camera

  /** 用于监听点击事件的 canvas */
  canvas: HTMLCanvasElement

  /**
   * 拖拽与点击的像素距离阈值，超过则视为拖拽忽略点击。
   * @default 5
   */
  clickThreshold?: number
}

// ---- Scan Rule Types ----

/** 锚点选取方式 */
export type CardAnchorSpec =
  // 取 position.y 最大的 mesh
  | 'highest'
  // 取 meshes[0]
  | 'first'
  // 取 name 以该后缀结尾的 mesh，找不到回退 meshes[0]
  | string
  // 完全自定义
  | ((meshes: Object3D[]) => Object3D)

/**
 * 卡片扫描规则
 *
 * 一条规则 = 卡片类型 + 组件 + 命名匹配 + 锚点 + props，
 * 全部声明在一处。scanAndRegisterCards 会自动注册组件并按 pattern 分组。
 *
 * 泛型参数 T 为组件类型（Vue 的 Component / React 的 ComponentType 等），
 * 默认 unknown，由适配层显式指定。
 */
export interface CardScanRule<T = unknown> {

  /** 卡片类型，对应 registry 中注册的组件 */
  type: string

  /** 该卡片类型对应的组件；传入即自动注册 */
  component?: T

  /** 匹配 mesh.name；捕获组 [1] = 分组 id */
  pattern: RegExp

  /** 锚点选取，默认 'first' */
  anchor?: CardAnchorSpec

  /** 卡片相对锚点的偏移，默认 [0, 0.6, 0] */
  offset?: [number, number, number]

  /** 交互分组（同组互斥显示），不填则所有卡片共用同一组 */
  interactiveGroup?: string

  /** 从分组派生传给卡片组件的业务 props */
  props?: (group: CardScanGroup) => Record<string, unknown>
}

/**
 * 扫描分组结果
 */
export interface CardScanGroup {

  /** 分组 id（pattern 捕获组 [1]） */
  id: string

  /** 该分组的全部关联 mesh */
  meshes: Object3D[]

  /** 选取出的锚点物体 */
  anchor: Object3D
}
