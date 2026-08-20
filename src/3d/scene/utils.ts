/**
 * scene/utils — 通用坐标 / 销毁 / 索引清理工具（scene 层共享）
 *
 * 产品数据坐标可能是 {x,y,z} 对象（wall/door/fishes）或 [x,y,z] 数组（ceiling），
 * toVec 两种都吃、统一输出 [x,y,z]，不强制产品改格式。
 *
 * disposeObject / clearIndexSubtree 供 objects.ts 与各 handler 复用（update 时清旧子树 + 索引）。
 */
import type * as THREE from 'three';

type Vec3 = [number, number, number];

/** 把单个坐标从 {x,y,z} 对象或 [x,y,z] 数组统一成 [x,y,z]；非法/undefined 返回 undefined */
export const toVec = (v: unknown): Vec3 | undefined => {
  if (v === null || v === undefined) {
    return undefined;
  }
  if (Array.isArray(v)) {
    if (v.length < 3) {
      return undefined;
    }
    const x = Number(v[0]);
    const y = Number(v[1]);
    const z = Number(v[2]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      return undefined;
    }
    return [x, y, z];
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const x = Number(o.x);
    const y = Number(o.y);
    const z = Number(o.z);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      return undefined;
    }
    return [x, y, z];
  }
  return undefined;
};

/** path:[{x,y,z}] 或 [[x,y,z]] → [[x,y,z],...]；非数组/全非法返回 [] */
export const toPath = (arr: unknown): Vec3[] => {
  if (!Array.isArray(arr)) {
    return [];
  }
  const out: Vec3[] = [];
  for (const el of arr) {
    const v = toVec(el);
    if (v) {
      out.push(v);
    }
  }
  return out;
};

/** dispose 一个 Object3D 及其子孙的几何/材质（共享资源由 handler 自管时，handler.delete 返回 true 跳过此默认逻辑） */
export const disposeObject = (obj: THREE.Object3D): void => {
  obj.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else {
      mat?.dispose();
    }
  });
};

/**
 * 从 index 移除 obj 子孙（默认不含 obj 自身）的 __id 条目。
 * update 时 handler 清旧子树前调用，避免索引残留指向已销毁对象。
 * @param includeSelf true 时连 obj 自身的 __id 一并移除（delete 整棵子树时用）
 */
export const clearIndexSubtree = (
  obj: THREE.Object3D,
  index: Map<string, THREE.Object3D>,
  includeSelf = false,
): void => {
  obj.traverse((child) => {
    if (!includeSelf && child === obj) {
      return;
    }
    const id = child.userData?.__id;
    if (typeof id === 'string' && id !== '') {
      index.delete(id);
    }
  });
};
