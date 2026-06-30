import { get } from '../request'
import type { SceneDataResponse, LiveDataResponse } from '../types/scene'

/**
 * 获取 SceneData 格式的场景数据
 * 开发者替换为自己的 API 路径和参数
 */
export function fetchSceneData(sceneId: string): Promise<SceneDataResponse> {
  return get<SceneDataResponse>('/scene/data', { sceneId })
}

/**
 * 获取 live-data 格式的场景数据
 */
export function fetchLiveDataScene(): Promise<LiveDataResponse> {
  return get<LiveDataResponse>('/scene/live-data')
}
