import { get } from '../request'
import type { SceneDataResponse } from '../types/scene'

/**
 * 获取场景完整数据
 * 开发者替换为自己的 API 路径和参数
 */
export function fetchSceneData(sceneId: string): Promise<SceneDataResponse> {
  return get<SceneDataResponse>('/scene/data', { sceneId })
}
