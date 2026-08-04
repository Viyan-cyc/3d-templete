/**
 * ============================================================
 *  CardRegistry — 卡片组件注册表（框架无关）
 *
 *  业务开发在此注册卡片类型对应的组件（Vue Component / React ComponentType 等）。
 *  每个 CardManager 实例有自己的 registry，多实例互不干扰。
 *  单实例场景可用 CardManager.defaultRegistry（全局共享）。
 *
 *  示例（Vue）：
 *  cardManager.registry.register('cube', ContainerCard)
 *  cardManager.registry.register('agv', AGVCard)
 *
 *  示例（React）：
 *  cardManager.registry.register('cube', ContainerCard)
 *  cardManager.registry.register('agv', AGVCard)
 * ============================================================
 */

export class CardComponentRegistry<T = unknown> {
  private _map: Map<string, T> = new Map();

  /** 注册卡片类型对应的组件 */
  register(type: string, component: T): void {
    this._map.set(type, component);
  }

  /** 获取卡片类型对应的组件 */
  get(type: string): T | undefined {
    return this._map.get(type);
  }

  /** 是否已注册某卡片类型 */
  has(type: string): boolean {
    return this._map.has(type);
  }

  /** 移除已注册的卡片类型 */
  unregister(type: string): void {
    this._map.delete(type);
  }
}

/** 全局共享注册表（等于 CardManager.defaultRegistry） */
export const cardComponentRegistry = new CardComponentRegistry();
