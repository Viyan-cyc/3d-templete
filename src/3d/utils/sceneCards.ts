/**
 * ============================================================
 *  scanCards — 通用「按命名规则批量注册卡片」扫描器
 *
 *  包内不写死任何业务对象（不再有 tree/building）。业务方通过
 *  CardScanRule[] 描述：哪些 mesh 属于同一组、卡片类型、用哪个 Vue
 *  组件、锚点怎么取、传什么 props。扫描器负责分组 + 自动注册组件
 *  + 调 cardManager.addCard。
 *
 *  约定：mesh.name === live-data 中的 id（见 liveDataLoader.ts）。
 *  规则的 pattern 用捕获组 [1] 表示「对象分组 id」，
 *  例如 /^(tree\d+)_/ 会把 tree01_trunk / tree01_canopy 归到 id=tree01。
 * ============================================================
 */

import * as THREE from 'three'
import type { Component } from 'vue'
import { cardComponentRegistry } from '../cards/CardRegistry'
import type { CardManager } from '../cards/CardManager'
import type { CardDef } from '../types'

/** 锚点选取方式 */
export type CardAnchorSpec =
  | 'highest' // 取 position.y 最大的 mesh（卡片飘在顶部）
  | 'first' // 取 meshes[0]
  | string // 取 name 以该后缀结尾的 mesh（如 '_body'），找不到回退 meshes[0]
  | ((meshes: THREE.Object3D[]) => THREE.Object3D) // 完全自定义

export interface CardScanRule {
  /** 卡片类型，对应 cardComponentRegistry 中注册的 Vue 组件 */
  type: string
  /** 该卡片类型对应的 Vue 组件；传入即自动注册，无需再调 cardComponentRegistry.register */
  component?: Component
  /** 匹配 mesh.name；捕获组 [1] = 分组 id */
  pattern: RegExp
  /** 锚点选取，默认 'first' */
  anchor?: CardAnchorSpec
  /** 卡片相对锚点的偏移，默认 [0, 0.6, 0] */
  offset?: [number, number, number]
  /** 交互分组（同组互斥显示），不填则所有卡片共用同一组 */
  interactiveGroup?: string
  /** 从分组派生传给卡片组件的业务 props */
  props?: (group: CardScanGroup) => Record<string, unknown>
}

export interface CardScanGroup {
  /** 分组 id（pattern 捕获组 [1]） */
  id: string
  /** 该分组的全部关联 mesh */
  meshes: THREE.Object3D[]
  /** 选取出的锚点物体 */
  anchor: THREE.Object3D
}

function pickAnchor(spec: CardAnchorSpec | undefined, meshes: THREE.Object3D[]): THREE.Object3D {
  if (meshes.length === 0) throw new Error('[scanCards] 空分组，无法选锚点')
  if (!spec || spec === 'first') return meshes[0]
  if (spec === 'highest') {
    return meshes.reduce((top, m) => (m.position.y > top.position.y ? m : top), meshes[0])
  }
  if (typeof spec === 'string') {
    return meshes.find((m) => m.name.endsWith(spec)) ?? meshes[0]
  }
  return spec(meshes)
}

/**
 * 扫描场景，按 rules 把 mesh 分组并注册卡片。
 * 若规则带 component，会自动注册到 cardComponentRegistry（无需手动 register）。
 * 每条 rule 独立匹配；同一物体可能被多条 rule 命中（少见，一般不重叠）。
 */
export function scanAndRegisterCards(
  scene: THREE.Scene,
  cardManager: CardManager,
  rules: CardScanRule[],
): void {
  if (rules.length === 0) return

  for (const rule of rules) {
    // 自动注册 Vue 组件（声明式：组件随规则一起定义）
    if (rule.component) {
      cardComponentRegistry.register(rule.type, rule.component)
    }

    // 分组：id → meshes
    const buckets = new Map<string, THREE.Object3D[]>()

    scene.traverse((obj) => {
      const name = obj.name
      if (!name) return
      const m = name.match(rule.pattern)
      if (!m) return
      const id = m[1] ?? name
      let bucket = buckets.get(id)
      if (!bucket) {
        bucket = []
        buckets.set(id, bucket)
      }
      bucket.push(obj)
    })

    buckets.forEach((meshes, id) => {
      const anchor = pickAnchor(rule.anchor, meshes)
      const group: CardScanGroup = { id, meshes, anchor }
      const def: CardDef = {
        mode: 'click',
        interactiveGroup: rule.interactiveGroup ?? 'scene',
        anchor,
        offset: rule.offset ?? [0, 0.6, 0],
        props: rule.props?.(group) ?? {},
      }
      cardManager.addCard(id, rule.type, meshes, def)
    })
  }
}
