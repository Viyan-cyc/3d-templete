/**
 * adapters/default — 示例默认类型映射
 *
 * 开箱即用的领域映射（对应用户示例数据 buildings/floors/walls/door/...）。
 * 不同产品领域字段名/参数不一致，业务侧用 registerTypeMappings() 覆盖或扩展。
 *
 * 注册方式：registerAdapters 以 override=false 注册，仅填未注册的 key——
 * 业务侧先注册的自定义映射优先，default 只兜底。
 * 注册了 library name 但组件类未在 library-bridge 注册的（Door/Road/...），会 warn+跳过，
 * 不阻塞链路；容器层级因默认 group 仍正确。
 */
import type { TypeRegistry } from './types';
import { toPath } from './utils';

export const defaultTypeMappings: TypeRegistry = {
  buildings: { kind: 'group' },
  floors: { kind: 'group' },
  walls: {
    kind: 'component',
    name: 'Wall',
    params: (n) => ({
      walls: [{
        path: toPath(n.path), width: 0.2, height: Number(n.height) || 3, close: true,
      }],
    }),
  },
  door: { kind: 'component', name: 'Door', params: (n) => ({ style: n.style, direction: n.direction }) },
  ceiling: { kind: 'component', name: 'Ceiling', params: (n) => ({ segment: n.segment }) },
  roads: { kind: 'component', name: 'Road', params: (n) => ({ path: toPath(n.path), arrow: n.arrow }) },
  water: { kind: 'component', name: 'Water', params: (n) => ({ style: n.style }) },
  fishes: { kind: 'component', name: 'Fish', params: (n) => ({ type: n.type, other: n.other }) },
  wave: { kind: 'component', name: 'Wave', params: (n) => ({ range: n.range }) },
};
