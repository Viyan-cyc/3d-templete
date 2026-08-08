/**
 * src/adapters/liveData — 模拟数据定时轮询适配层入口
 *
 * 框架无关：只负责定时请求模拟数据并下发 SceneUpdatePatch，
 * 由调用方（如 Embed.vue）接到 patch 后走 handle.update 流程。
 */
export { LiveDataPoller, type LiveDataPollerOptions } from './LiveDataPoller';
