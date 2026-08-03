import type { LiveDataMaterial, LiveDataGeometry } from '../../scene/loader'

/**
 * 所有组件统一的 options 形状（由 handler 从 LiveDataObject 翻译而来）。
 * 组件自建:extend THREE.Mesh/Group,在构造器里按需读这些字段。
 */
export interface ComponentOptions {
  id?: string
  geometry?: LiveDataGeometry
  material?: LiveDataMaterial
  /** component.params（builder 参数等） */
  params?: Record<string, number | string>
  position?: number[]
  rotation?: number[]
  scale?: number[]
  castShadow?: boolean
  receiveShadow?: boolean
  /** 模型资源引用（type='glb'/'model'） */
  src?: string
}
