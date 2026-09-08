/**
 * ============================================================
 *  ComponentManager — 业务层组件生命周期分派器（树原生）
 *
 *  四层链：data → manager → handlers → components
 *    - manager 按 type 在「type→handler 注册表」里找 handler，调 handler.create；
 *    - handler 是厚代码（LLM 写），拥有整棵子树：create 内部通过 ctx.getChildren 查 children 递归建；
 *    - manager 只对根节点（parentId=null）分发；子节点由父 handler 内部处理；
 *    - create 成功后统一盖 userData.__id / __componentType / __logicalRoot（根=整体）。
 *
 *  用法：
 *    1. registerHandler(type, handler)   注册 type→handler（在 createScene3D 初始化时一次）
 *    2. componentManager.create(node, ctx)         创建（仅根节点）
 *    3. componentManager.update(obj, node, ctx, defaultFn)   更新
 *    4. componentManager.delete(obj, ctx, defaultFn)        删除
 * ============================================================
 */

import type * as THREE from 'three';
import type { TreeNode } from '../../scene/loader';
import type { ComponentSharedState } from './handlers/base/shared';
import type { CloneModelOpts } from '../../resources';

/** id → Object3D 索引（objects 层 buildTreeScene 维护，借 ctx 透传给 handler） */
export type ObjectIndex = Map<string, THREE.Object3D>

// ── 类型定义 ──

/**
 * 单个业务 type 的生命周期处理器（树原生）。
 * handler 拥有整棵子树：create 读根节点 + ctx.getChildren 递归建子节点；update 全量不 diff；
 * delete 清理资源（返回 true 跳过默认 dispose，保护共享资源）。
 */
export interface ComponentHandler {

  /** 创建：node 是根节点（parentId=null）。返回 Object3D，null 表示未处理。handler 自盖子对象 __id + 注册 index。 */
  create?: (node: TreeNode, ctx: ComponentContext) => THREE.Object3D | null

  /** 更新：全量数据推过来，不 diff。handler 把 obj 调整到新 node 状态（重建子树或就地改）。返回 true 已处理，false 回落 defaultFn。 */
  update?: (obj: THREE.Object3D, node: TreeNode, ctx: ComponentContext) => boolean

  /** 删除：清理资源（取消订阅/卡片）。返回 true 跳过默认 dispose（保护共享资源），false 回落 defaultFn。 */
  delete?: (obj: THREE.Object3D, ctx: ComponentContext) => boolean

  /** 该 type 的数据契约（代码先行后反推，供产品对接 + 绑定 UI） */
  dataSchema?: object
}

/** handler 执行上下文 */
export interface ComponentContext {
  scene: THREE.Scene
  index: ObjectIndex

  /** 跨 handler 共享的状态（resources/interactiveManager/cameraRig/cardManager/source） */
  shared: ComponentSharedState

  /**
   * 加载模型（便捷，对齐文档 `ctx.loadModel('asset:xxx')`）：等价于 ctx.shared.resources.cloneModel(src, opts)。
   * handler 二选一——ctx.loadModel（便捷，新 handler 推荐）或 ctx.shared.resources.cloneModel（直接门面，exampleHandler 用）。
   */
  loadModel: (src: string, opts?: CloneModelOpts) => Promise<THREE.Object3D>

  /** 查某节点的子节点（按 parentId 在当前推送的 nodeMap 里查，带 type） */
  getChildren(parentId: string): TreeNode[]

  /** 按 id 查节点 */
  getNode(id: string): TreeNode | undefined
}

// ── Manager ──

export class ComponentManager {
  private _handlers = new Map<string, ComponentHandler>();

  /** 注册 type → handler（幂等：同 type 覆盖） */
  registerHandler(type: string, handler: ComponentHandler): void {
    this._handlers.set(type, handler);
  }

  /** 批量注册 */
  registerHandlers(entries: Array<{ type: string; handler: ComponentHandler }>): void {
    for (const { type, handler } of entries) {
      this.registerHandler(type, handler);
    }
  }

  /** 按 type 取 handler */
  resolveHandler(type: string): ComponentHandler | undefined {
    return this._handlers.get(type);
  }

  /**
   * 分派创建：按 node.type 找 handler，调 handler.create。
   * 创建成功后自动盖 userData.__id（node.id）/ __componentType（type）/ __logicalRoot（根=整体）。
   * 子对象的 __id 由 handler 自盖；handler 漏盖的由 stampMissingIds 兜底补（保证 part 粒度可拾取）。
   */
  create(node: TreeNode, ctx: ComponentContext): THREE.Object3D | null {
    const handler = this._handlers.get(node.type);
    let result: THREE.Object3D | null;
    try {
      result = handler?.create?.(node, ctx) ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ComponentManager] handler "${node.type}" (${node.id}) create 抛错: ${msg}`);
      return null;
    }
    if (result) {
      result.userData.__id = node.id;
      result.userData.__componentType = node.type;
      // 根节点 = 用户视角的"一个整体"（whole 粒度选中）；handler 建的子对象不盖此戳（=part）
      result.userData.__logicalRoot = true;
      // 命中的 3d-components 组件名（handler 直接 new 库组件时自盖 __componentName）；
      // 默认 ''（picker 据此判断是否回传 component 字段）
      if (!result.userData.__componentName) {
        result.userData.__componentName = '';
      }
      if (!result.name) {
        result.name = node.id;
      }
      // 兜底盖戳：handler 可能漏盖子对象 __id（循环同质子物体尤甚）→ part 粒度 picker 沿父子链
      // 找不到子 __id 回落父 group → 只能整体选。遍历子树给「无 __id」后代自动盖 __id（不盖
      // __logicalRoot，子=part），引擎层保证「每个物体可拾取」+ 正确区分局部/整体，不依赖 LLM 合规。
      this.stampMissingIds(result, node.id, node.type);
      return result;
    }
    return null;
  }

  /**
   * 兜底盖戳：遍历 root 子树，给所有没有 __id 的后代自动盖 __id + __componentType。
   * 不盖 __logicalRoot（仅根有，子=part）。handler 已盖的 __id（含 `${id}-${子类型}-${i}` 命名）不覆盖。
   * 目的：part 粒度 picker 需子对象有 __id 才能选得中单个，否则回落父 group（整体）。
   */
  private stampMissingIds(root: THREE.Object3D, rootId: string, rootType: string): void {
    let i = 0;
    root.traverse((child) => {
      if (child === root) {
        return;
      }
      // handler 已盖 __id → 不覆盖（保留语义化命名）
      if (typeof child.userData.__id === 'string' && child.userData.__id !== '') {
        return;
      }
      child.userData.__id = `${rootId}-part-${i++}`;
      if (!child.userData.__componentType) {
        child.userData.__componentType = rootType;
      }
    });
  }

  /**
   * 分派更新：按 node.type 找 handler（回落 obj.__componentType），调 handler.update。
   * 返回 true 则结束，否则回落 defaultFn（patchObject 就地改 transform）。
   */
  update(
    obj: THREE.Object3D,
    node: TreeNode,
    ctx: ComponentContext,
    defaultFn: (obj: THREE.Object3D, node: TreeNode) => void,
  ): void {
    const handler = this._handlers.get(node.type) ?? this.resolveHandlerFromObj(obj);
    if (handler?.update?.(obj, node, ctx)) {
      return;
    }
    defaultFn(obj, node);
  }

  /**
   * 分派删除：按 __componentType 找 handler，调 handler.delete。
   * 返回 true 则结束，否则回落 defaultFn（disposeObject）。
   */
  delete(
    obj: THREE.Object3D,
    ctx: ComponentContext,
    defaultFn: (obj: THREE.Object3D) => void,
  ): void {
    const handler = this.resolveHandlerFromObj(obj);
    if (handler?.delete?.(obj, ctx)) {
      return;
    }
    defaultFn(obj);
  }

  /** 从 Object3D.userData 读 __componentType（delete 时按 type 反查 handler） */
  resolveHandlerFromObj(obj: THREE.Object3D): ComponentHandler | undefined {
    const type = obj.userData.__componentType as string | undefined;
    return type ? this._handlers.get(type) : undefined;
  }
}

/** 全局单例 */
export const componentManager = new ComponentManager();
