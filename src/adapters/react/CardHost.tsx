/**
 * CardHost — 3D 卡片宿主组件（React 适配层）
 *
 * 通过 createPortal 将 React 卡片组件渲染到 CSS2DObject 的 DOM 元素中。
 * 业务开发只需关注自己的卡片组件怎么写，不需要了解 CSS2D 定位原理。
 *
 * 使用方式：
 * <CardHost cards={cards} registry={cardManager.registry} />
 */
import { type ReactNode, type ComponentType, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { CardState } from '@/3d/managers/card/types'

/** Minimal registry interface — only requires `get()` */
interface CardRegistryLike {
  get(type: string): ComponentType<Record<string, unknown>> | undefined
}

interface CardHostProps {
  /** 卡片状态列表，由 CardManager.onStateChange 提供 */
  cards: CardState[]
  /** CardManager 的实例级注册表 */
  registry: CardRegistryLike | null
}

export function CardHost({ cards, registry }: CardHostProps) {
  return (
    <>
      {cards.map((card) => {
        if (!card.visible || !card.domElement || !registry) return null
        const CardComponent = registry.get(card.type)
        if (!CardComponent) return null

        return (
          <CardPortal key={card.id} domElement={card.domElement}>
            <CardComponent
              cardId={card.id}
              objectId={card.objectId}
              {...(card.props as Record<string, unknown>)}
            />
          </CardPortal>
        )
      })}
    </>
  )
}

/** Portal wrapper：将子组件渲染到 CSS2DObject 的 DOM 元素中 */
function CardPortal({ domElement, children }: { domElement: HTMLElement; children: ReactNode }) {
  return createPortal(children, domElement)
}
