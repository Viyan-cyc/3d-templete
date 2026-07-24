/**
 * ============================================================
 *  ComponentManager — 业务层组件生命周期分派器
 *
 *  在现有 resolver 链（component.name > component.type > src > geometry > group）
 *  之上，提供 操作 × 类型 的二维分派：当 live-data 中某个对象属于特定业务类型
 *  （device / tree / Wall 等）时，走该类型注册的 handler；否则回落到 default 逻辑。
 *
 *  用法：
 *    1. 注册 handler：componentManager.register('device', deviceHandler)
 *    2. 创建时：componentManager.create(data, ctx, createLiveObject3D)
 *    3. 更新时：componentManager.update(obj, data, ctx, patchObject)
 *    4. 删除时：componentManager.delete(obj, ctx, disposeObject)
 *
 *  未注册的类型自动回落 defaultFn，零侵入现有逻辑。
 * ============================================================
 */

import type * as THREE from 'three'
import type { LiveDataObject } from '../../utils/liveDataLoader'
import type { ObjectIndex } from '../../utils/sceneUpdate'
import type { ComponentSharedState } from './handlers/shared'

// ── 类型定义 ──

/**
 * 单个业务类型的生命周期处理器。
 * 只需实现关心的操作，其余回落 default。
 */
export interface ComponentHandler {
  /**
   * 创建：拿到数据，返回 Object3D。
   * 返回 null 则回落到 default 逻辑（createLiveObject3D）。
   */
  create?: (data: LiveDataObject, ctx: ComponentContext) => THREE.Object3D | null

  /**
   * 更新：拿到已有 Object3D 和新数据。
   * 返回 true 表示已处理，false 回落 default（patchObject）。
   */
  update?: (obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) => boolean

  /**
   * 删除：拿到 Object3D。
   * 返回 true 表示已处理，false 回落 default（disposeObject）。
   */
  delete?: (obj: THREE.Object3D, ctx: ComponentContext) => boolean
}

/** handler 执行上下文（可随需求扩展） */
export interface ComponentContext {
  scene: THREE.Scene
  index: ObjectIndex
  /** 跨 handler 共享的状态（颜色映射、材质缓存、自定义 store 等） */
  shared: ComponentSharedState
}

// ── Manager ──

export class ComponentManager {
  private _handlers = new Map<string, ComponentHandler>()

  /** 注册一个业务类型的处理器 */
  register(type: string, handler: ComponentHandler): void {
    if (this._handlers.has(type)) {
      console.warn(`[ComponentManager] "${type}" 已注册，将被覆盖`)
    }
    this._handlers.set(type, handler)
  }

  /** 批量注册 */
  registerAll(entries: Array<[string, ComponentHandler]>): void {
    entries.forEach(([type, handler]) => this.register(type, handler))
  }

  /**
   * 从 LiveDataObject 解析出业务类型 key。
   * 优先级：component.name > component.type，与 resolver 链一致。
   */
  resolveType(data: LiveDataObject): string | null {
    return data.component?.name ?? data.component?.type ?? null
  }

  /**
   * 从 Object3D 的 userData 读取创建时存的 component type（供 delete 使用）。
   * delete 阶段没有 LiveDataObject，只有 id 列表，因此依赖创建时写入的标记。
   */
  resolveTypeFromObj(obj: THREE.Object3D): string | null {
    return (obj.userData.__componentType as string) ?? null
  }

  /**
   * 分派创建：优先走 handler，null 则回落 defaultFn。
   * 创建成功后自动在 userData.__componentType 写入类型标记。
   */
  create(
    data: LiveDataObject,
    ctx: ComponentContext,
    defaultFn: (data: LiveDataObject) => THREE.Object3D | null,
  ): THREE.Object3D | null {
    const type = this.resolveType(data)

    if (type) {
      const handler = this._handlers.get(type)
      if (handler?.create) {
        const result = handler.create(data, ctx)
        if (result !== null) {
          result.userData.__componentType = type
          return result
        }
        // handler 返回 null → 继续走 default
      }
    }

    const result = defaultFn(data)
    if (result && type) {
      result.userData.__componentType = type
    }
    return result
  }

  /**
   * 分派更新：优先走 handler，返回 true 表示已处理，否则回落 defaultFn。
   */
  update(
    obj: THREE.Object3D,
    data: LiveDataObject,
    ctx: ComponentContext,
    defaultFn: (obj: THREE.Object3D, data: LiveDataObject) => void,
  ): void {
    const type = this.resolveType(data) ?? this.resolveTypeFromObj(obj)

    if (type) {
      const handler = this._handlers.get(type)
      if (handler?.update?.(obj, data, ctx)) return
    }

    defaultFn(obj, data)
  }

  /**
   * 分派删除：优先走 handler，返回 true 表示已处理，否则回落 defaultFn。
   */
  delete(
    obj: THREE.Object3D,
    ctx: ComponentContext,
    defaultFn: (obj: THREE.Object3D) => void,
  ): void {
    const type = this.resolveTypeFromObj(obj)

    if (type) {
      const handler = this._handlers.get(type)
      if (handler?.delete?.(obj, ctx)) return
    }

    defaultFn(obj)
  }

  /** 是否已注册某类型 */
  has(type: string): boolean {
    return this._handlers.has(type)
  }

  /** 列出所有已注册的类型名（调试用） */
  list(): string[] {
    return [...this._handlers.keys()]
  }
}

/** 全局单例 */
export const componentManager = new ComponentManager()
