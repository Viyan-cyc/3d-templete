/**
 * options — LiveDataObject → ComponentOptions 翻译（handler 层通用）
 *
 * handler 拿到 data 后先 toOptions，再 new XxxComponent(opts)。
 */
import type { LiveDataObject } from '../../../../scene/loader'
import type { ComponentOptions } from '../../../../components/base/types'

export function toOptions(data: LiveDataObject): ComponentOptions {
  return {
    id: data.id,
    geometry: data.geometry,
    material: data.material,
    params: data.component?.params,
    position: data.position,
    rotation: data.rotation,
    scale: data.scale,
    castShadow: data.castShadow,
    receiveShadow: data.receiveShadow,
    src: data.src,
  }
}
