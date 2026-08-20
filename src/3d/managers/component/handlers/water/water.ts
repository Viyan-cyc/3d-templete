/**
 * waterHandler — 水体子树（water → fishes / wave）
 *
 * 厚代码示例（Step 2 交付的链路验证范例）：handler 拥有整棵子树。
 *   - water：水面（半透明蓝色 Plane）+ 查 children 建 fish/wave
 *   - fishes：原生球（position 来自 params）
 *   - wave：原生圆环（position 来自 params）
 *
 * update 全量不 diff：水面（shell）保留，仅清旧 fish/wave 子节点后按新 children 重建。
 * delete 连子树一起 dispose。
 *
 * 生产可替换为库组件：createComponentObject('Water', params) + 动画/shader，契约不变。
 */
import * as THREE from 'three';
import type { ComponentHandler, ComponentContext } from '../../ComponentManager';
import type { TreeNode } from '../../../../scene/loader';
import { toVec, disposeObject, clearIndexSubtree } from '../../../../scene/utils';

/** 水面：半透明蓝色平面 */
const buildSurface = (): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6, 32, 32),
    new THREE.MeshStandardMaterial({
      color: 0x2fa2c4, transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.3,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  mesh.receiveShadow = true;
  return mesh;
};

/** 鱼：原生球（position 来自 params） */
const buildFish = (node: TreeNode): THREE.Object3D => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xff8844, roughness: 0.5 }),
  );
  mesh.castShadow = true;
  const pos = toVec(node.params.position);
  if (pos) {
    mesh.position.set(...pos);
  }
  return mesh;
};

/** 波纹：原生圆环（position 来自 params） */
const buildWave = (node: TreeNode): THREE.Object3D => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.2, 32),
    new THREE.MeshBasicMaterial({
      color: 0x88ddff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  const pos = toVec(node.params.position);
  if (pos) {
    mesh.position.set(...pos);
  }
  return mesh;
};

/** 按 child.type 建子对象 */
const buildChild = (child: TreeNode): THREE.Object3D | null => {
  switch (child.type) {
    case 'fishes': return buildFish(child);
    case 'wave': return buildWave(child);
    default: return null;
  }
};

/** 建子节点：遍历 water 的 children，建对象 + 盖 __id + 注册 index + 挂父 */
const buildChildren = (obj: THREE.Object3D, node: TreeNode, ctx: ComponentContext): void => {
  for (const child of ctx.getChildren(node.id)) {
    const childObj = buildChild(child);
    if (childObj) {
      childObj.name = child.id;
      childObj.userData.__id = child.id;
      childObj.userData.__componentType = child.type;
      ctx.index.set(child.id, childObj);
      obj.add(childObj);
    }
  }
};

export const waterHandler: ComponentHandler = {
  create(node, ctx) {
    const obj = new THREE.Group();
    obj.name = node.id;
    // 水面（shell 的一部分，不盖 __id：点击水面沿父链回到 water 根）
    obj.add(buildSurface());
    buildChildren(obj, node, ctx);
    return obj;
  },

  update(obj, node, ctx) {
    // 水面保留，仅清旧 fish/wave 子节点（有 __id 且 != water 自身）后重建
    const toClear: THREE.Object3D[] = [];
    for (const child of obj.children) {
      const cid = child.userData?.__id;
      if (typeof cid === 'string' && cid !== node.id) {
        toClear.push(child);
      }
    }
    for (const child of toClear) {
      clearIndexSubtree(child, ctx.index);
      disposeObject(child);
      obj.remove(child);
    }
    buildChildren(obj, node, ctx);
    return true;
  },

  delete(obj, ctx) {
    clearIndexSubtree(obj, ctx.index);
    disposeObject(obj);
    return true;
  },

  dataSchema: {
    style: 'number',
    fishes: [{ type: 'number', position: 'vec3', other: 'number' }],
    wave: { range: 'number', position: 'vec3' },
  },
};
