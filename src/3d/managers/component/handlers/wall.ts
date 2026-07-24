/**
 * Wall handler — 调用 3d-components 的 Wall 组件
 *
 * component.name = 'Wall' 时触发，通过 library-bridge 创建 Wall 实例。
 * Wall 通常不需要特殊的 update/delete，回落 default 即可。
 */

import type { ComponentHandler, ComponentContext } from '../ComponentManager'
import { createComponentObject } from '../../../library/library-bridge'
import type { LiveDataObject } from '../../../utils/liveDataLoader'

export const wallHandler: ComponentHandler = {
  create(data: LiveDataObject, _ctx: ComponentContext) {
    const obj = createComponentObject('Wall', data.component?.options ?? {})
    if (obj) {
      obj.name = data.id
      obj.userData.__id = data.id
    }
    return obj
  },
}
