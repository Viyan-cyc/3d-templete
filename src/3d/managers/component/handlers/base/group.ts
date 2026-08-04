/** groupHandler — 建空 THREE.Group + name + transform（type:'group'，无需组件类） */
import * as THREE from 'three';
import type { ComponentHandler } from '../../ComponentManager';
import type { LiveDataObject } from '../../../../scene/loader';
import { applyTransform } from '../../../../components';

export const groupHandler: ComponentHandler = {
  create(data: LiveDataObject) {
    const g = new THREE.Group();
    if (data.id) {
      g.name = data.id;
    }
    applyTransform(g, data);
    return g;
  },
};
