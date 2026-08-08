/**
 * adapters/tree — 通用树遍历归一化器
 *
 * 递归遍历任意 数组/对象 嵌套，按"有 id 的对象 = 实体"识别实体节点，
 * 产出扁平 LiveDataObject[]。父子关系用 id 作 parentId。
 *
 * typeRegistry 配置覆盖：注册的 typeKey 按 TypeMapping 转（component/src/skip）；
 *   未注册的回落 skip（不产出，透明递归子）；注册 skip 同样透明。
 * component kind 统一产 component.type；路由由 creationChain 定（库组件 type 命中 libraryBridge → libraryHandler，否则走垂域 handler）。
 *
 * 通用提取 position/rotation/scale 到 LiveDataObject 顶层（复用 applyTransform）；
 * 其余参数由 typeRegistry 的 options 函数按需提取到 component.options/params。
 *
 * 四种嵌套组合（数组→数组/数组→对象/对象→数组/对象→对象）一套逻辑兜住。
 */
import type { Adapter, EntityNode, TypeMapping } from './types';
import type { LiveDataObject, LiveDataComponent } from '../loader';
import { toVec, isEntityNode } from './utils';
import { resolveTypeMapping } from './registry';

/** 按 TypeMapping 构造 LiveDataObject（position/rotation/scale 通用提取到顶层） */
const buildObject = (
  node: EntityNode,
  parentId: string | null,
  mapping: TypeMapping,
): LiveDataObject | null => {
  const id = String(node.id);
  const position = toVec(node.position);
  const rotation = toVec(node.rotation);
  const scale = toVec(node.scale);
  const transform = {
    ...(position ? { position } : {}),
    ...(rotation ? { rotation } : {}),
    ...(scale ? { scale } : {}),
  };
  switch (mapping.kind) {
    case 'group':
      return {
        id, type: 'group', parentId, ...transform,
      };
    case 'component': {
      const params = mapping.params ? mapping.params(node) : {};
      // 统一产 component.type：库组件 type（Grid/Wall…）命中 libraryBridge 走 libraryHandler，
      // 本仓 builder type（example…）走垂域 handler。路由由 creationChain 定，归一化层不判断
      const component: LiveDataComponent = { type: mapping.type, params };
      return {
        id, type: 'component', parentId, component, ...transform,
      };
    }
    case 'src':
      return {
        id, type: 'model', parentId, src: mapping.src(node), ...transform,
      };
    case 'skip':
      return null;
    default:
      return null;
  }
};

export const treeAdapter: Adapter = {
  name: 'tree',
  match: () => true,
  normalize: (data) => {
    const objects: LiveDataObject[] = [];

    const walk = (value: unknown, parentId: string | null, typeKey: string): void => {
      if (Array.isArray(value)) {
        for (const el of value) {
          walk(el, parentId, typeKey);
        }
        return;
      }
      if (!isEntityNode(value)) {
        return;
      }
      const node = value as EntityNode;
      const mapping = resolveTypeMapping(typeKey);

      if (mapping.kind === 'skip') {
        // 透明容器：自身不产出，子节点挂到当前 parentId
        for (const [childKey, childVal] of Object.entries(node)) {
          if (childKey !== 'id') {
            walk(childVal, parentId, childKey);
          }
        }
        return;
      }

      const obj = buildObject(node, parentId, mapping);
      if (!obj) {
        return;
      }
      objects.push(obj);
      for (const [childKey, childVal] of Object.entries(node)) {
        if (childKey !== 'id') {
          walk(childVal, obj.id, childKey);
        }
      }
    };

    // 顶层：无 id 的根容器，遍历字段；顶层数组遍历元素
    if (Array.isArray(data)) {
      walk(data, null, '');
    } else if (data && typeof data === 'object') {
      for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
        walk(val, null, key);
      }
    }

    return { source: data, objects };
  },
};
