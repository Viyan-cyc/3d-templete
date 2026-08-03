/**
 * primitiveHandler — 按 geometry.type 建基础几何体或文字
 *
 * text → TextComponent（canvas 贴图）；其余 → createGeometry(...) 算几何体 + PrimitiveComponent。
 * 未知类型返回 null（manager 继续回落到后续 kind）。
 */
import type { ComponentHandler, ComponentContext } from '../../ComponentManager'
import type { LiveDataObject } from '../../../../scene/loader'
import { PrimitiveComponent, TextComponent, createGeometry } from '../../../../components'
import { toOptions } from './options'

export const primitiveHandler: ComponentHandler = {
  create(data: LiveDataObject, _ctx: ComponentContext) {
    const geoDef = data.geometry
    if (!geoDef?.type) return null
    const opts = toOptions(data)
    if (geoDef.type === 'text') return new TextComponent(opts)
    const geo = createGeometry(geoDef)
    if (!geo) {
      console.warn(`[primitiveHandler] 未知几何体类型: ${geoDef.type}`)
      return null
    }
    return new PrimitiveComponent(opts, geo)
  },
}
