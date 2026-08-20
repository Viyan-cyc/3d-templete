/**
 * scene — 场景层入口
 *
 * 一次性建场景 = 环境(environment) + 物体(objects):
 *   applyLiveDataToApp = mergeWithPreset → applyEnvironment → buildTreeScene
 *
 * - environment.ts  场景环境(非物体):背景/雾/相机/灯光/PMREM
 * - objects.ts       物体生命周期:buildTreeScene/updateTreeScene/removeObjects
 * - loader.ts        树形场景配置加载 + 类型定义(TreeScene/TreeNode)
 * - utils.ts         toVec/toPath/disposeObject/clearIndexSubtree
 */
import type { App3D } from '../App3D';
import type { TreeScene, ApplyLiveDataOptions } from './loader';
import { mergeWithPreset } from './presets';
import { applyEnvironment } from './environment';
import { buildTreeScene, type ObjectIndex } from './objects';

export { loadLiveDataConfig } from './loader';
export type {
  TreeScene,
  TreeNode,
  TreeSceneEnv,
  LiveDataCamera,
  LiveDataLight,
  LiveDataGeometry,
  LiveDataMaterial,
  ApplyLiveDataOptions,
} from './loader';
export { buildTreeScene, updateTreeScene, removeObjects } from './objects';
export type { ObjectIndex } from './objects';
export {
  toVec, toPath, disposeObject, clearIndexSubtree,
} from './utils';
export { registerScenePreset, getScenePresets, mergeWithPreset } from './presets';
export type { ScenePreset } from './presets';

/**
 * 将树形场景配置应用到已有的 App3D 实例(一次性建场景)。
 *
 * 编排:合并预设(scene/camera/lights 兜底，type 分组透传)→ 应用环境 → 全量建物体。
 *
 * @returns 所有根实体的 id → Object3D 索引(供增量更新使用)
 */
export const applyLiveDataToApp = (
  app: App3D,
  tree: TreeScene,
  options: ApplyLiveDataOptions,
): ObjectIndex => {
  const { viewSize, preset: presetKey = 'dark' } = options;
  const merged = mergeWithPreset(tree, presetKey);
  applyEnvironment(app, merged, viewSize, options.keepExisting);
  return buildTreeScene(app.scene, merged);
};
