/**
 * ============================================================
 *  src/3d/cards/types.ts — 卡片运行时类型
 *
 *  CardDef 定义在 ../types.ts 中。
 *  CardState 定义在 ../managers/card/types.ts 中。
 *  此文件仅做重导出，保持向后兼容。
 * ============================================================
 */

// 从主类型文件重导出
export type { CardDef } from '../types'
// 从 CardManager 类型重导出
export type { CardState } from '../managers/card/types'
