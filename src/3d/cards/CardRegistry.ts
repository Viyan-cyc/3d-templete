/**
 * ============================================================
 *  CardRegistry — React 卡片组件注册表
 *
 *  业务开发在此注册卡片类型对应的 React 组件。
 *  键名与 JSON 中 card 的类型匹配：
 *  - 若 ModelDef 设置了 componentName，类型 = componentName
 *  - 否则类型 = ModelDef.type (如 'cube', 'agv')
 *
 *  示例：
 *  CardRegistry.register('cube', ContainerCard)
 *  CardRegistry.register('agv',  AGVCard)
 * ============================================================
 */

import type { ComponentType } from 'react'

export interface CardComponentProps {
  cardId: string
  objectId: string
  [key: string]: unknown
}

class CardComponentRegistry {
  private _map: Map<string, ComponentType<CardComponentProps>> = new Map()

  register(type: string, component: ComponentType<CardComponentProps>): void {
    this._map.set(type, component)
  }

  get(type: string): ComponentType<CardComponentProps> | undefined {
    return this._map.get(type)
  }
}

export const cardComponentRegistry = new CardComponentRegistry()
