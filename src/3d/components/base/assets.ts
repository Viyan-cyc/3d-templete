/**
 * assets — 组件层共享的 AssetPool 单例
 *
 * 供 material 缓存（相同参数复用 Material）与 primitive/text 等组件复用 Geometry/Material。
 * 原 liveDataLoader 的 module 级 assetPool 拆出至此。
 */
import { AssetPool } from '../AssetPool'

export const assetPool = new AssetPool()
