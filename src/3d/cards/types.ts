/**
 * ============================================================
 *  src/3d/cards/types.ts — 卡片运行时类型（Vue 桥接层）
 *
 *  CardDef / CardStateCore 定义在 @cyc/3d-components/card 中。
 *  此文件扩展 CardStateCore，添加 Vue Teleport 所需的 domElement 字段。
 * ============================================================
 */

import type { CardStateCore as _CardStateCore } from '@cyc/3d-components/card'

// 从库重导出核心类型
export type { CardDef } from '@cyc/3d-components/card'
export type { CardStateCore } from '@cyc/3d-components/card'

/**
 * 卡片运行时状态（CardManager 暴露给 Vue 的）
 *
 * 继承库的 CardStateCore，添加 domElement 供 CardHost.vue 的 <Teleport :to> 使用。
 */
export interface CardState extends _CardStateCore {
  domElement: HTMLElement
}
