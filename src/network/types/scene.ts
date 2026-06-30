/**
 * ============================================================
 *  src/network/types/scene.ts — 网络层类型定义（示例）
 *
 *  这些是 API 响应的类型，包装了 SceneData。
 *  开发者按自己后端约定修改 code / data / message 字段即可。
 * ============================================================
 */

import type { SceneData } from '@/3d/types'
import type { LiveDataConfig } from '@/3d/utils/liveDataLoader'

/** 场景数据 API 响应 */
export interface SceneDataResponse {
  code: number
  data: SceneData
  message: string
}

/** live-data 格式 API 响应 */
export interface LiveDataResponse {
  code: number
  data: LiveDataConfig
  message: string
}

/** API 通用响应 */
export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message: string
}
