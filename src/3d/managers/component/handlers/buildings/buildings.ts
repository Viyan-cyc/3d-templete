/**
 * buildingsHandler — 建筑子树（building → floors → walls/door；building → ceiling）
 *
 * 厚代码示例：handler 拥有整棵子树，通过 ctx.getChildren 递归建子节点。
 *   - building：Group 容器
 *   - floor：楼板（BoxGeometry，height 来自 params）+ 递归建其 children（walls/door）
 *   - wall：优先库组件 Wall（直接 new），构造失败回落原生 THREE 沿 path 建墙段
 *   - door：原生 Box
 *   - ceiling：原生 Box（position 来自 params）
 *
 * update 全量不 diff：清旧子树（dispose + 清 index）后按新 node + children 重建。
 */
import * as THREE from 'three';
import type { ComponentHandler, ComponentContext } from '../../ComponentManager';
import type { TreeNode } from '../../../../scene/loader';
import {
  toVec, toPath, disposeObject, clearIndexSubtree,
} from '../../../../scene/utils';
import { Wall } from '../../../../components';

/** 楼板：薄板 + 高度偏移（height 来自 params，默认 3） */
const buildFloor = (node: TreeNode): THREE.Object3D => {
  const g = new THREE.Group();
  const height = Number(node.params.height ?? 3);
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.8 }),
  );
  slab.position.y = height;
  slab.receiveShadow = true;
  g.add(slab);
  return g;
};

/** 墙：优先库 Wall（直接 new），构造失败回落原生 THREE 沿 path 建墙段 */
const buildWall = (node: TreeNode): THREE.Object3D => {
  const path = toPath(node.params.path);
  const pos = toVec(node.params.position);

  // 直接 new 库组件 Wall（3d-components，barrel import）
  try {
    const lib = new Wall({ path });
    if (pos) {
      lib.position.set(...pos);
    }
    lib.userData.__componentName = 'Wall';
    return lib;
  } catch {
    // 回落：沿 path 建 Box 墙段
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, , z1] = path[i];
      const [x2, , z2] = path[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len >= 1e-4) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 0.15), mat);
        seg.position.set((x1 + x2) / 2, 1.25, (z1 + z2) / 2);
        seg.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        seg.castShadow = true;
        seg.receiveShadow = true;
        g.add(seg);
      }
    }
    if (pos) {
      g.position.set(...pos);
    }
    return g;
  }
};

/** 门：原生 Box（style/direction 预留，暂不消费） */
const buildDoor = (): THREE.Object3D => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 }),
  );
  mesh.castShadow = true;
  return mesh;
};

/** 天花板：原生 Box（position 来自 params） */
const buildCeiling = (node: TreeNode): THREE.Object3D => {
  const g = new THREE.Group();
  const pos = toVec(node.params.position);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.15, 6),
    new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.8 }),
  );
  mesh.receiveShadow = true;
  if (pos) {
    g.position.set(...pos);
  }
  g.add(mesh);
  return g;
};

/** 按 child.type 建子对象 */
const buildChild = (child: TreeNode): THREE.Object3D | null => {
  switch (child.type) {
    case 'floors': return buildFloor(child);
    case 'walls': return buildWall(child);
    case 'door': return buildDoor();
    case 'ceiling': return buildCeiling(child);
    default: return null;
  }
};

/** floor 有自己的 children（walls/door），需递归 */
const isRecursiveType = (type: string): boolean => type === 'floors';

/** 递归建子树：遍历 parentNode 的 children，建对象 + 盖 __id + 注册 index + 挂父；递归型继续向下 */
const buildSubtree = (parent: THREE.Object3D, parentNode: TreeNode, ctx: ComponentContext): void => {
  for (const child of ctx.getChildren(parentNode.id)) {
    const childObj = buildChild(child);
    if (childObj) {
      childObj.name = child.id;
      childObj.userData.__id = child.id;
      childObj.userData.__componentType = child.type;
      // 子对象 = 部件（不盖 __logicalRoot）；whole 粒度选中时沿父链回到 building 根
      ctx.index.set(child.id, childObj);
      parent.add(childObj);
      if (isRecursiveType(child.type)) {
        buildSubtree(childObj, child, ctx);
      }
    }
  }
};

export const buildingsHandler: ComponentHandler = {
  create(node, ctx) {
    const obj = new THREE.Group();
    obj.name = node.id;
    buildSubtree(obj, node, ctx);
    return obj;
  },

  update(obj, node, ctx) {
    // 全量不 diff：清旧子树（index + dispose）后重建
    clearIndexSubtree(obj, ctx.index);
    const kids = [...obj.children];
    for (const c of kids) {
      disposeObject(c);
      obj.remove(c);
    }
    buildSubtree(obj, node, ctx);
    return true;
  },

  delete(obj, ctx) {
    clearIndexSubtree(obj, ctx.index);
    disposeObject(obj);
    return true;
  },

  dataSchema: {
    floors: [{ height: 'number' }],
    walls: [{ path: 'vec3[]', position: 'vec3' }],
    door: [{ style: 'number', direction: 'vec3' }],
    ceiling: [{ position: 'vec3', segment: 'number' }],
  },
};
