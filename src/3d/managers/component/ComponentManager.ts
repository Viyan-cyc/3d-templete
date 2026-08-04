/**
 * ============================================================
 *  ComponentManager — 业务层组件生命周期分派器
 *
 *  四层链：data → manager → handlers → components
 *    - manager 按优先级遍历「创建 kind 链」，首个 match 且 create 返回非 null 的 handler 胜出；
 *    - handler 薄，调 new XxxComponent(options) 实例化组件（创建逻辑在 components 层）；
 *    - create 成功后统一盖 userData.__id / __componentType。
 *
 *  用法：
 *    1. registerCreationChain([...])  注册 kind 链（按优先级，在 createScene3D 初始化时一次）
 *    2. componentManager.create(data, ctx)         创建
 *    3. componentManager.update(obj, data, ctx, patchObject)   更新
 *    4. componentManager.delete(obj, ctx, disposeObject)      删除
 * ============================================================
 */

import type * as THREE from 'three';
import type { LiveDataObject } from '../../scene/loader';
import type { ComponentSharedState } from './handlers/base/shared';

/** id → Object3D 索引（物体层 buildObjects/upsertObjects 维护，借 ctx 透传给 handler） */
export type ObjectIndex = Map<string, THREE.Object3D>

// ── 类型定义 ──

/**
 * 单个业务类型的生命周期处理器。
 * 只需实现关心的操作；create 返回 null 表示未处理（回落 kind 链下一项），
 * update/delete 返回 false 表示未处理（回落 defaultFn）。
 */
export interface ComponentHandler {

  /** 创建：返回 Object3D，null 表示未处理（回落 kind 链下一项） */
  create?: (data: LiveDataObject, ctx: ComponentContext) => THREE.Object3D | null

  /** 更新：返回 true 表示已处理，false 回落 defaultFn */
  update?: (obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) => boolean

  /** 删除：返回 true 表示已处理，false 回落 defaultFn */
  delete?: (obj: THREE.Object3D, ctx: ComponentContext) => boolean
}

/** handler 执行上下文 */
export interface ComponentContext {
  scene: THREE.Scene
  index: ObjectIndex

  /** 跨 handler 共享的状态（颜色映射、材质缓存、自定义 store 等） */
  shared: ComponentSharedState
}

/** 创建 kind 链的一项：match 命中则交给 handler；handler.create 返回 null 则继续下一项 */
export interface CreationEntry {

  /** 类型标识（delete 时按 __componentType 匹配此项） */
  key: string

  /** 是否能处理该 data（按 data 形状判断） */
  match: (data: LiveDataObject) => boolean
  handler: ComponentHandler
}

// ── Manager ──

export class ComponentManager {
  private _chain: CreationEntry[] = [];

  /** 注册创建 kind 链（按优先级顺序；首项 match 且 create 返回非 null 者胜出） */
  registerCreationChain(entries: CreationEntry[]): void {
    this._chain = entries;
  }

  /**
   * 从 Object3D 的 userData 读取创建时存的 handler key（供 delete 分派使用）。
   * delete 阶段没有 LiveDataObject，只有 id 列表，因此依赖创建时写入的标记。
   */
  resolveTypeFromObj(obj: THREE.Object3D): string | null {
    return (obj.userData.__componentType as string) ?? null;
  }

  /**
   * 分派创建：按 kind 链优先级遍历，首个 match 且 create 返回非 null 者胜出（null 则回落下一项）。
   * 创建成功后自动盖 userData.__id（data.id）与 __componentType（创建它的 chain entry 的 key，
   * 供 delete 按 key 反查 handler）。
   */
  create(data: LiveDataObject, ctx: ComponentContext): THREE.Object3D | null {
    for (const entry of this._chain) {
      if (entry.match(data)) {
        const result = entry.handler.create?.(data, ctx) ?? null;
        if (result) {
          if (data.id) {
            result.userData.__id = data.id;
          }
          result.userData.__componentType = entry.key;
          return result;
        }
        // handler 返回 null → 继续 kind 链下一项
      }
    }
    return null;
  }

  /**
   * 分派更新：首个 match 的 handler.update 返回 true 则结束，否则回落 defaultFn。
   */
  update(
    obj: THREE.Object3D,
    data: LiveDataObject,
    ctx: ComponentContext,
    defaultFn: (obj: THREE.Object3D, data: LiveDataObject) => void,
  ): void {
    const entry = this._chain.find((e) => e.match(data));
    if (entry?.handler.update?.(obj, data, ctx)) {
      return;
    }
    defaultFn(obj, data);
  }

  /**
   * 分派删除：按 __componentType 找 handler，返回 true 则结束，否则回落 defaultFn。
   */
  delete(
    obj: THREE.Object3D,
    ctx: ComponentContext,
    defaultFn: (obj: THREE.Object3D) => void,
  ): void {
    const key = this.resolveTypeFromObj(obj);
    const entry = key ? this._chain.find((e) => e.key === key) : undefined;
    if (entry?.handler.delete?.(obj, ctx)) {
      return;
    }
    defaultFn(obj);
  }
}

/** 全局单例 */
export const componentManager = new ComponentManager();
