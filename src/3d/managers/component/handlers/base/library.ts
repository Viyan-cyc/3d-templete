/**
 * libraryHandler — 实例化 3d-components 组件（Wall/Grid/HeatMesh…）
 *
 * 通过 libraryBridge 的 createComponentObject(type, options)（= new Ctor(options）），
 * 再补 name + transform + shadow。原 createLiveObject3D 的 component 分支迁此（统一走 type）。
 */
import type { ComponentHandler } from '../../ComponentManager';
import type { LiveDataObject } from '../../../../scene/loader';
import { createComponentObject } from '../../../../components';
import { applyTransform, applyShadow } from '../../../../components/base/transform';
import { toOptions } from './options';

export const libraryHandler: ComponentHandler = {
  create(data: LiveDataObject) {
    const type = data.component?.type;
    if (!type) {
      return null;
    }
    const obj = createComponentObject(type, data.component?.params ?? {});
    if (!obj) {
      return null;
    }

    const opts = toOptions(data);
    if (opts.id) {
      obj.name = opts.id;
    }
    applyTransform(obj, opts);
    applyShadow(obj, opts);
    return obj;
  },
};
