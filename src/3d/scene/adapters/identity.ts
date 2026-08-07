/**
 * adapters/identity — 编排数据透传 adapter
 *
 * 数据已是 canonical LiveDataConfig（扁平 objects[] + parentId 树）时命中，
 * 直接透传。向后兼容现有编排数据，零回归。
 */
import type { Adapter } from './types';
import type { LiveDataObject } from '../loader';

/** 单个对象是否像 LiveDataObject（id + type 是契约必填） */
const looksLikeLiveDataObject = (o: unknown): boolean => {
  if (!o || typeof o !== 'object') {
    return false;
  }
  const obj = o as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.type === 'string';
};

export const identityAdapter: Adapter = {
  name: 'identity',
  match: (data) => {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const cfg = data as Record<string, unknown>;
    if (!Array.isArray(cfg.objects)) {
      return false;
    }
    // 空数组视为 canonical（合法空场景）
    if (cfg.objects.length === 0) {
      return true;
    }
    return looksLikeLiveDataObject(cfg.objects[0]);
  },
  normalize: (data) => {
    const cfg = data as { objects?: LiveDataObject[] };
    const objects = cfg.objects ?? [];
    return { source: data, objects };
  },
};
