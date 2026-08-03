/** modelHandler — new ModelComponent（带 src 的占位 Group，异步由 loadModelObjects 填充） */
import type { ComponentHandler } from '../../ComponentManager'
import type { LiveDataObject } from '../../../../scene/loader'
import { ModelComponent } from '../../../../components/base/Model'
import { toOptions } from './options'

export const modelHandler: ComponentHandler = {
  create(data: LiveDataObject) {
    return new ModelComponent(toOptions(data))
  },
}
