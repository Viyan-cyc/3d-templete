/**
 * CardHost — 3D 卡片宿主组件 (React 版)
 *
 * 通过 React Portal 将 React 卡片组件渲染到 CSS2DObject 的 DOM 元素中。
 * 业务开发只需关注自己的卡片组件怎么写，不需要了解 CSS2D 定位原理。
 *
 * 使用方式：
 * <CardHost cards={cards} />
 * （registry 默认用全局 cardComponentRegistry，除非你需要独立注册表）
 */

import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { CardState } from './types'
import { cardComponentRegistry } from './CardRegistry'

export interface CardRegistryLike {
  get(type: string): React.ComponentType<CardComponentProps> | undefined
}

export interface CardComponentProps {
  cardId: string
  objectId: string
  [key: string]: unknown
}

interface CardHostProps {
  /** 卡片状态列表，由 CardManager.onStateChange 提供 */
  cards: CardState[]
  /** 卡片类型 → React 组件 的注册表，默认用全局 cardComponentRegistry */
  registry?: CardRegistryLike
}

const CardHost: React.FC<CardHostProps> = ({ cards, registry }) => {
  const reg = registry ?? cardComponentRegistry

  const portals = useMemo(() => {
    return cards.map((card) => {
      if (!card.domElement || !card.visible) return null

      const CardComponent = reg.get(card.type) as React.ComponentType<CardComponentProps> | undefined
      if (!CardComponent) return null

      return createPortal(
        <div className="card-fade-enter-active">
          <CardComponent
            cardId={card.id}
            objectId={card.objectId}
            {...(card.props as Record<string, unknown>)}
          />
        </div>,
        card.domElement,
        card.id,
      )
    })
  }, [cards, reg])

  return <>{portals}</>
}

export default CardHost
