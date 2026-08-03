/**
 * base — 通用底座（无业务属性）：工具 + 通用组件
 *
 * 通用组件：Primitive（box/plane/.../ring 统一分支）、Text（canvas 贴图）、Group、Model。
 * 工具：material/geometry/transform/assets。
 * 组件统一自建：extend THREE.Mesh/Group，构造器里建内容 + 调 applyTransform/applyShadow。
 */
export type { ComponentOptions } from './types'
export { PrimitiveComponent } from './Primitive'
export { TextComponent } from './Text'
export { ModelComponent } from './Model'
export { createLiveMaterial } from './material'
export { createGeometry } from './geometry'
export { applyTransform, applyShadow, parseVec3 } from './transform'
export { assetPool } from './assets'
