/**
 * adapters/utils — 通用坐标/节点识别工具
 *
 * 产品数据坐标可能是 {x,y,z} 对象（wall/door/fishes）或 [x,y,z] 数组（ceiling），
 * toVec 两种都吃、统一输出 [x,y,z]，不强制产品改格式。
 *
 * 实体识别：对象 + 有字符串/数字 id = 实体节点（参数对象 path/position/info 无 id）。
 */

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

/** 判断是否为实体节点：非数组对象 + 有字符串/数字 id */
export const isEntityNode = (v: unknown): boolean => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const id = (v as Record<string, unknown>).id;
  return typeof id === 'string' || typeof id === 'number';
};
