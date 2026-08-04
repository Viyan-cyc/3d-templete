/**
 * scene — 场景层入口
 *
 * 一次性建场景 = 环境(environment) + 物体(objects):
 *   applyLiveDataToApp = mergeWithPreset → applyEnvironment → buildObjects
 *
 * - environment.ts  场景环境(非物体):背景/雾/相机/灯光/PMREM
 * - objects.ts       物体生命周期:create/mount/update/delete/dispose + 模型异步填充
 * - loader.ts        live-data 配置加载 + 类型定义
 */
import type { App3D } from '../App3D';
import type { LiveDataConfig, ApplyLiveDataOptions } from './loader';
import { mergeWithPreset } from './presets';
import { applyEnvironment } from './environment';
import { buildObjects, type ObjectIndex } from './objects';

export { loadLiveDataConfig } from './loader';
export type {
  LiveDataConfig,
  LiveDataCamera,
  LiveDataLight,
  LiveDataObject,
  LiveDataComponent,
  LiveDataGeometry,
  LiveDataMaterial,
  ApplyLiveDataOptions,
} from './loader';
export {
  buildObjects, upsertObjects, removeObjects, loadModelObjects,
} from './objects';
export type { ObjectIndex } from './objects';
export { registerScenePreset, getScenePresets } from './presets';
export type { ScenePreset } from './presets';

/**
 * 将 live-data 场景配置应用到已有的 App3D 实例(一次性建场景)。
 *
 * 编排:合并预设 → 应用环境(背景/雾/相机/灯光/PMREM)→ 全量建物体。
 *
 * @returns 所有 live-data 对象的 id → Object3D 索引(供增量更新使用)
 */
export const applyLiveDataToApp = (
  app: App3D,
  config: LiveDataConfig,
  options: ApplyLiveDataOptions,
): ObjectIndex => {
  const { viewSize, preset: presetKey = 'dark' } = options;
  const merged = mergeWithPreset(config, presetKey);
  applyEnvironment(app, merged, viewSize, options.keepExisting);
  return buildObjects(app.scene, merged.objects ?? []);
};
