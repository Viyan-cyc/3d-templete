/** rackHandler — new RackComponent（1:1 对齐 components/warehouse/rack.ts） */
import type * as THREE from 'three';
import type { ComponentHandler, ComponentContext } from '../../ComponentManager';
import type { LiveDataObject } from '../../../../scene/loader';
import { RackComponent } from '../../../../components/warehouse';
import { applyTransform } from '../../../../components';
import { toOptions } from '../base/options';

export const rackHandler: ComponentHandler = {
  create(data: LiveDataObject) {
    return new RackComponent(toOptions(data));
  },

  /**
   * 就地更新货架：用新 params（如 levels）重建子节点，替换旧子节点并同步 index。
   * patchObject 只能改 transform / material，改不了 levels 这类结构参数，故 rack 自行处理。
   * geometry/material 走 AssetPool 缓存共享，此处不 dispose（避免误释放共享资源）。
   * 返回 true 表示已处理，跳过 defaultFn(patchObject)。
   */
  update(obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext): boolean {
    // 用新 params 重建一个货架（构造器内已建好 4 立柱 + N 搁板 + 子节点 userData.id）
    const fresh = new RackComponent(toOptions(data));

    // 旧子节点：从 index 移除并脱离父节点（缓存资源不 dispose）
    for (const child of Array.from(obj.children)) {
      if (child.userData?.id) {
        ctx.index.delete(child.userData.id);
      }
      obj.remove(child);
    }

    // 新子节点：搬入现有节点并注册进 index
    for (const child of Array.from(fresh.children)) {
      obj.add(child);
      if (child.userData?.id) {
        ctx.index.set(child.userData.id, child);
      }
    }

    // transform（position/rotation/scale）应用到现有节点；未传则保持原位
    applyTransform(obj, data);
    return true;
  },
};
