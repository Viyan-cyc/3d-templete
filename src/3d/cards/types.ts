/**
 * ============================================================
 *  src/3d/cards/types.ts — 卡片运行时类型
 *
 *  CardDef (JSON 声明) 定义在 ../types.ts 中。
 *  此文件定义卡片运行时的状态和事件类型。
 * ============================================================
 */

// 从主类型文件重导出
export type { CardDef } from '../types'

/**
 * 卡片运行时状态（CardManager 暴露给 Vue 的）
 */
export interface CardState {
  id: string
  type: string
  visible: boolean
  domElement: HTMLElement
  /** 关联的 3D 物体 ID */
  objectId: string
  /** 透传的业务 props */
  props: Record<string, unknown>
}

/**
 * 卡片事件回调
 */
export interface CardEvents {
  onShow?: (cardId: string) => void
  onHide?: (cardId: string) => void
}
