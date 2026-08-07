/**
 * adapters/index — 产品数据归一化适配层入口
 *
 * adapter 链：identityAdapter（编排数据透传）> treeAdapter（通用树遍历兜底）。
 * normalizeConfig 把任意产品 config 归一化成 LiveDataConfig（objects[] 扁平），
 * 在 createScene3D 内、applyLiveDataToApp 之前调用，喂 applyLiveDataToApp + loadModelObjects。
 *
 * 仿 ComponentManager 的 CreationChain 模式：_chain 数组 + registerAdapters 幂等 + 首 match 命中。
 */
import type { LiveDataConfig, LiveDataObject } from '../loader';
import type { Adapter, AdapterEntry, SceneModel } from './types';
import { identityAdapter } from './identity';
import { treeAdapter } from './tree';
import { registerTypeMappings } from './registry';
import { defaultTypeMappings } from './default';

export type {
  SceneModel, Adapter, AdapterEntry, TypeMapping, TypeRegistry, EntityNode,
} from './types';
export { toVec, toPath, isEntityNode } from './utils';
export { registerTypeMappings, resolveTypeMapping, clearTypeMappings } from './registry';
export { defaultTypeMappings } from './default';

/** adapter 链（按优先级，首项 match 命中即用） */
let adapterChain: AdapterEntry[] = [];

/** 幂等初始化（在 createScene3D 与 registerComponentHandlers 同时调用） */
export const registerAdapters = (): void => {
  // 注册示例默认映射（仅填未注册的 key，业务侧已注册的优先）
  registerTypeMappings(defaultTypeMappings, false);
  adapterChain = [
    // canonical LiveDataConfig（向后兼容 live-data.json）
    identityAdapter,
    // 兜底：任意嵌套产品数据
    treeAdapter,
  ];
};

/** 取首个 match 的 adapter；空链自动初始化 */
export const resolveAdapter = (data: unknown): Adapter => {
  if (adapterChain.length === 0) {
    registerAdapters();
  }
  for (const a of adapterChain) {
    if (a.match(data)) {
      return a;
    }
  }
  // 理论不可达（treeAdapter.match 恒真）
  return treeAdapter;
};

/** 把任意 data 投影成 SceneModel（不修改原 data） */
export const normalizeToModel = (data: unknown): SceneModel =>
  resolveAdapter(data).normalize(data);

/**
 * 把任意产品 config 规范化为 LiveDataConfig：
 *   保留原 config 顶层字段（scene/camera/lights/version + 产品自带键），
 *   仅把投影 objects[] 写入 config.objects。
 * mergeWithPreset 只读 scene/camera/lights/objects，其余键被忽略，安全。
 */
export const normalizeConfig = (config: LiveDataConfig): LiveDataConfig => {
  const model = normalizeToModel(config);
  return { ...config, objects: model.objects };
};

/**
 * 判断数据是否是扁平增量 patch（有 objects.upsert 或 objects.remove）。
 * 调用方用它区分：是 patch → 直接 update；否则 → toUpdatePatch 转换。
 */
export const isUpdatePatch = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const objects = (data as Record<string, unknown>).objects;
  if (!objects || typeof objects !== 'object') {
    return false;
  }
  const o = objects as Record<string, unknown>;
  return Array.isArray(o.upsert) || Array.isArray(o.remove);
};

/**
 * 读产品更新数据顶层的 remove 声明（产品显式声明要删的实体 id）。
 * 非数组或元素非 string 一律忽略，返回空。
 */
const readRemoveDecl = (data: unknown): string[] => {
  if (!data || typeof data !== 'object') {
    return [];
  }
  const remove = (data as Record<string, unknown>).remove;
  return Array.isArray(remove)
    ? remove.filter((s): s is string => typeof s === 'string')
    : [];
};

/**
 * 把产品全量更新数据转成更新 patch：归一化全量树 → 全部 upsert + 顶层 remove 声明。
 * 不 diff（产品每次推全量，前端不比对新旧）。供 handle.update 用（调用方转换后走 update）。
 */
export const toUpdatePatch = (data: unknown): {
  objects: { upsert: LiveDataObject[]; remove: string[] };
} => {
  const model = normalizeToModel(data);
  const remove = readRemoveDecl(data);
  return { objects: { upsert: model.objects, remove } };
};
