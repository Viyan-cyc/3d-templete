/**
 * objects — 物体生命周期：创建 / 更新 / 删除（分组扁平 + parentId 树原生）。
 *
 * - buildTreeScene:全量建(展开 nodeMap → 对根节点分发 create → 挂 scene)→ 返回 ObjectIndex
 * - updateTreeScene:先 remove，再对存在的根节点 update / 新根节点 create。不 diff。
 * - removeObjects:按 id 删(含 handler.delete 资源清理)
 *
 * 创建走 ComponentManager(node → manager → handler → components)；patch/dispose 是
 * update/delete 的 defaultFn，保证增量与初始化一致。
 */
import type * as THREE from 'three';
import type { TreeScene, TreeNode } from './loader';
import { componentManager, type ComponentContext, type ObjectIndex } from '../managers/component/ComponentManager';
import { sharedState } from '../managers/component/handlers/base/shared';
import { disposeObject, toVec } from './utils';

// ObjectIndex 定义在 ComponentManager（manager 层），此处 re-export 供 scene/index、3d/index 取用
export type { ObjectIndex } from '../managers/component/ComponentManager';

// ── nodeMap 构建 ──

/** 保留的顶层 key（非 type 分组：环境字段 + remove） */
const RESERVED_KEYS = new Set(['version', 'scene', 'camera', 'lights', 'remove']);

interface NodeIndex {

  /** id → TreeNode */
  nodes: Map<string, TreeNode>;

  /** parentId → children[]（跨分组） */
  children: Map<string, TreeNode[]>;
}

/** 单条 raw → TreeNode（非对象 / 无 id 返回 null）。 */
const toNode = (type: string, raw: unknown): TreeNode | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const id = r.id === undefined || r.id === null ? '' : String(r.id);
  if (!id) {
    return null;
  }
  return {
    type,
    id,
    params: (typeof r.params === 'object' && r.params !== null ? r.params : {}) as Record<string, unknown>,
    parentId: r.parentId === undefined || r.parentId === null ? null : String(r.parentId),
  };
};

/**
 * 把 TreeScene 的 type 分组展开成 id→TreeNode + parentId→children[] 索引。
 * 节点 type = 所在分组 key（节点自身不带 type 字段）。
 */
const buildNodeIndex = (tree: TreeScene): NodeIndex => {
  const nodes = new Map<string, TreeNode>();
  const children = new Map<string, TreeNode[]>();
  for (const [type, val] of Object.entries(tree)) {
    if (Array.isArray(val) && !RESERVED_KEYS.has(type)) {
      for (const raw of val) {
        const node = toNode(type, raw);
        if (node) {
          nodes.set(node.id, node);
          if (node.parentId !== null) {
            const arr = children.get(node.parentId) ?? [];
            arr.push(node);
            children.set(node.parentId, arr);
          }
        }
      }
    }
  }
  return { nodes, children };
};

// ── 共用 helper ──

/** 构造 handler 上下文（getChildren/getNode 绑定到当前推送的 nodeMap） */
const buildCtx = (scene: THREE.Scene, index: ObjectIndex, nodeIndex: NodeIndex): ComponentContext => ({
  scene,
  index,
  shared: sharedState,
  loadModel: (src, opts) => sharedState.resources.cloneModel(src, opts),
  getChildren: (parentId: string) => nodeIndex.children.get(parentId) ?? [],
  getNode: (id: string) => nodeIndex.nodes.get(id),
});

/** 就地补丁默认实现（handler 未实现 update 时回落）：只改 transform */
const patchObject = (obj: THREE.Object3D, node: TreeNode): void => {
  const pos = toVec(node.params.position);
  if (pos) {
    obj.position.set(...pos);
  }
  const rot = toVec(node.params.rotation);
  if (rot) {
    obj.rotation.set(...rot);
  }
  const scl = toVec(node.params.scale);
  if (scl) {
    obj.scale.set(...scl);
  }
  if (node.params.castShadow !== undefined) {
    obj.castShadow = node.params.castShadow as boolean;
  }
  if (node.params.receiveShadow !== undefined) {
    obj.receiveShadow = node.params.receiveShadow as boolean;
  }
};

/** debug 开关 */
const isDebug = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true';

// ══════════════════════════════════════════════════════════════
// 全量构建
// ══════════════════════════════════════════════════════════════

/**
 * 全量建场景：展开 nodeMap → 对根节点(parentId=null)分发 create → 挂 scene。
 * 子节点由父 handler 通过 ctx.getChildren 递归建。返回 id→Object3D 索引。
 */
export const buildTreeScene = (scene: THREE.Scene, tree: TreeScene): ObjectIndex => {
  const index: ObjectIndex = new Map();
  const nodeIndex = buildNodeIndex(tree);
  const ctx = buildCtx(scene, index, nodeIndex);
  let created = 0;
  let skipped = 0;

  for (const [, node] of nodeIndex.nodes) {
    // 只分发根节点；子节点靠父 handler 递归建
    if (node.parentId === null) {
      const obj = componentManager.create(node, ctx);
      if (obj) {
        created++;
        index.set(node.id, obj);
        scene.add(obj);
      } else {
        skipped++;
        console.warn(`[objects] 无 handler 或 create 返回 null，跳过: id=${node.id} type=${node.type}`);
      }
    }
  }

  if (isDebug()) {
    console.log(`[objects] 场景构建完成: 创建 ${created} 个根实体${skipped > 0 ? `，跳过 ${skipped} 个（见上方 warn）` : ''}`);
  }
  return index;
};

// ══════════════════════════════════════════════════════════════
// 删除
// ══════════════════════════════════════════════════════════════

/**
 * 按 id 删除物体。返回被删物体的 name 列表(供 refreshCards 用)。
 * 通过 ComponentManager 分派 delete：handler 处理则跳过 default，否则回落 disposeObject。
 */
export const removeObjects = (scene: THREE.Scene, index: ObjectIndex, ids: string[]): string[] => {
  const changed: string[] = [];
  const ctx: ComponentContext = {
    scene,
    index,
    shared: sharedState,
    loadModel: (src, opts) => sharedState.resources.cloneModel(src, opts),
    getChildren: () => [],
    getNode: () => undefined,
  };
  for (const id of ids) {
    const obj = index.get(id);
    if (obj) {
      changed.push(obj.name || id);
      componentManager.delete(obj, ctx, disposeObject);
      obj.removeFromParent();
      index.delete(id);
    }
  }
  return changed;
};

// ══════════════════════════════════════════════════════════════
// 增量更新：remove + upsert（不 diff）
// ══════════════════════════════════════════════════════════════

/**
 * 增量更新（全量推送，不 diff）：
 *   1. remove 先走：tree.remove 里的 id 先删；
 *   2. 对根节点：已存在 → handler.update；不存在 → handler.create + 挂 scene。
 *   缺席的 type 分组不动（不 diff，不自动删除）。
 * 返回变更 name 列表（供 refreshCards）。
 */
export const updateTreeScene = (
  scene: THREE.Scene,
  index: ObjectIndex,
  tree: TreeScene,
): string[] => {
  const changed: string[] = [];
  const nodeIndex = buildNodeIndex(tree);
  const ctx = buildCtx(scene, index, nodeIndex);

  // 1. remove 先走
  if (tree.remove?.length) {
    changed.push(...removeObjects(scene, index, tree.remove));
  }

  // 2. 对根节点 update/create（不 diff：有数据就走）
  for (const [, node] of nodeIndex.nodes) {
    if (node.parentId === null) {
      const existing = index.get(node.id);
      if (existing) {
        componentManager.update(existing, node, ctx, patchObject);
        changed.push(existing.name || node.id);
      } else {
        const obj = componentManager.create(node, ctx);
        if (obj) {
          index.set(node.id, obj);
          scene.add(obj);
          changed.push(obj.name || node.id);
        } else {
          console.warn(`[objects] update 时 create 返回 null，跳过: id=${node.id} type=${node.type}`);
        }
      }
    }
  }

  return changed;
};
