/**
 * ============================================================
 *  CardRegistry — Vue 卡片组件注册表
 *
 *  业务开发在此注册卡片类型对应的 Vue 组件。
 *  每个 CardManager 实例有自己的 registry，多实例互不干扰。
 *  单实例场景可用 CardManager.defaultRegistry（全局共享）。
 *
 *  示例：
 *  cardManager.registry.register('cube', ContainerCard)
 *  cardManager.registry.register('agv', AGVCard)
 * ============================================================
 */
import type { Component } from 'vue'

export class CardComponentRegistry {
  private _map: Map<string, Component> = new Map()

  /** 注册卡片类型对应的 Vue 组件 */
  register(type: string, component: Component): void {
    this._map.set(type, component)
  }

  /** 获取卡片类型对应的 Vue 组件 */
  get(type: string): Component | undefined {
    return this._map.get(type)
  }

  /** 是否已注册某卡片类型 */
  has(type: string): boolean {
    return this._map.has(type)
  }

  /** 移除已注册的卡片类型 */
  unregister(type: string): void {
    this._map.delete(type)
  }
}

/** 全局共享注册表（等于 CardManager.defaultRegistry） */
export const cardComponentRegistry = new CardComponentRegistry()
