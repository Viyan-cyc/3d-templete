/**
 * roadsHandler — 道路（根节点，无子树）
 *
 * 厚代码示例：沿 params.path 建扁平路面段（BoxGeometry），arrow 标记预留。
 * update 全量不 diff：清旧段后按新 path 重建。
 */
import * as THREE from 'three';
import type { ComponentHandler } from '../../ComponentManager';
import type { TreeNode } from '../../../../scene/loader';
import { toPath, disposeObject } from '../../../../scene/utils';

const ROAD_MAT = new THREE.MeshStandardMaterial({ color: 0x333740, roughness: 0.9 });

/** 沿 path 建路面段，挂到 parent */
const populateRoad = (parent: THREE.Object3D, node: TreeNode): void => {
  const path = toPath(node.params.path);
  const width = Number(node.params.width ?? 1.2);
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, , z1] = path[i];
    const [x2, , z2] = path[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len >= 1e-4) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, width), ROAD_MAT);
      seg.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2);
      seg.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      seg.receiveShadow = true;
      parent.add(seg);
    }
  }
};

export const roadsHandler: ComponentHandler = {
  create(node) {
    const obj = new THREE.Group();
    obj.name = node.id;
    populateRoad(obj, node);
    return obj;
  },

  update(obj, node) {
    // 全量不 diff：清旧段后重建
    const kids = [...obj.children];
    for (const c of kids) {
      disposeObject(c);
      obj.remove(c);
    }
    populateRoad(obj, node);
    return true;
  },

  delete(obj) {
    disposeObject(obj);
    return true;
  },

  dataSchema: {
    path: 'vec3[]',
    arrow: 'number',
    width: 'number',
  },
};
