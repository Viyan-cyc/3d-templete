/**
 * shared — handler 间共享的状态容器（通过 ctx.shared 访问）
 *
 * 预留：跨 handler 的选中态、自由 store、AssetPool 注入位。按需扩展。
 */
import type { AssetPool } from '../../../../components/AssetPool'

export class ComponentSharedState {
  /** 当前选中的实体 id */
  selectedComponentId: string | null = null
  /** 自由 key-value 存储，handler 可随意读写 */
  store: Record<string, unknown> = {}
  /** AssetPool 引用（可注入，handler 可用来缓存 Geometry/Material） */
  assetPool: AssetPool | null = null

  dispose(): void {
    this.store = {}
  }
}

/** 全局共享状态单例 */
export const sharedState = new ComponentSharedState()
