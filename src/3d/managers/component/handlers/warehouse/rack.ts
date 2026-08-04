/** rackHandler — new RackComponent（1:1 对齐 components/warehouse/rack.ts） */
import type { ComponentHandler } from '../../ComponentManager';
import type { LiveDataObject } from '../../../../scene/loader';
import { RackComponent } from '../../../../components/warehouse';
import { toOptions } from '../base/options';

export const rackHandler: ComponentHandler = {
  create(data: LiveDataObject) {
    return new RackComponent(toOptions(data));
  },
};
