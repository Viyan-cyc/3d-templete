/**
 * environment — 场景环境（非物体）分发层。
 *
 * 实体逻辑已拆到 managers/app/（C2）：
 *   SceneManager.applyBackgroundFog / LightManager.applyLights / CameraManager.setCamera·buildCamera
 *   / EnvironmentManager.applyPMREM。
 * 本文件只剩两个编排入口（EnvUpdate 接口与 updateEnvironment(app, env, viewSize) 签名冻结——
 * bridge + host 依赖）：
 *   applyEnvironment   全量：背景/雾 → 清空 → 相机 → 灯光 → PMREM
 *   updateEnvironment  增量（M-3 ①）：scene/lights/camera 各自 mutate，不重建物体树
 *
 * 行为不变式：
 *   - update 不重生成 PMREM（environmentIntensity 经 SceneManager 设置）
 *   - lights diff 按 __id=light-${index} 前缀 + isLight traverse
 *   - camera type 变（persp↔ortho）重建后 OrbitControls/InteractiveManager 持旧 camera
 *     引用的既有 quirk 原样保留不修（宿主经重建场景路径兜底）
 */
import type { App3D } from '../App3D';
import type {
  TreeScene, LiveDataLight, LiveDataRenderer, LiveDataControls,
} from './loader';
import type { ControlsManager } from '../managers/app/ControlsManager';

/**
 * 应用场景环境：背景/雾 → 清空 → 相机 → 灯光 → PMREM 环境。
 * @param merged 经 mergeWithPreset 合并预设后的配置
 */
export const applyEnvironment = (
  app: App3D,
  merged: TreeScene,
  viewSize: { width: number; height: number },
  keepExisting?: boolean,
): void => {
  const scene = merged.scene!;
  const camCfg = merged.camera!;

  app.sceneManager.applyBackgroundFog({
    background: scene.background,
    fog: scene.fog,
    environment: scene.environment,
  });

  if (!keepExisting) {
    app.sceneManager.clearChildren();
  }

  // 相机替换（buildCamera 盖 __id="camera"；正交相机 resize 时按 aspect 重算）
  app.setCamera(app.cameraManager.buildCamera(camCfg, viewSize));

  // 灯光（盖 __id=light-${i}，供 updateEnvironment 按 index 定位 mutate）
  app.lightManager.applyLights(merged.lights ?? []);

  // PMREM 环境光（IBL，physical 材质必需）
  app.environmentManager.applyPMREM(scene.environment);

  // 渲染参数初载（全量重建路径，材料后建无需 markDirty）
  if (merged.renderer) {
    app.rendererManager.update(merged.renderer);
  }
};

/**
 * 场景级增量更新（M-3 ①）：只重应用 camera/lights/scene.background·fog·environment/renderer/controls，
 * **不重建物体树**。
 * lights 按 __id=light-${index} 定位 mutate（type 变则该槽位重建）；新增 add + 盖 __id；
 * 旧 index 不在新集 → remove。camera type 变（perspective↔orthographic）才 setCamera 重建，
 * 否则 mutate position/lookAt/fov。renderer 的 toneMapping/shadowMapType 变化时全量材质重编译。
 * 对应 set_light/set_camera/set_scene/set_renderer/set_controls op 的运行时 mutate 路径
 * （区别于 applyEnvironment 全量重建）。
 */
export interface EnvUpdate {
  camera?: NonNullable<TreeScene['camera']>;
  lights?: LiveDataLight[];
  scene?: NonNullable<TreeScene['scene']>;
  renderer?: LiveDataRenderer;
  controls?: LiveDataControls;
}

export const updateEnvironment = (
  app: App3D,
  env: EnvUpdate,
  viewSize: { width: number; height: number },
  controlsManager?: ControlsManager,
): void => {
  if (env.scene) {
    app.sceneManager.update(env.scene);
  }
  if (env.lights) {
    app.lightManager.update(env.lights);
  }
  if (env.camera) {
    app.cameraManager.update(env.camera, viewSize);
  }
  if (env.renderer) {
    const shaderChanged = app.rendererManager.update(env.renderer);
    if (shaderChanged) {
      // toneMapping/shadowMapType 热改须重编 shader（three 不自动重编已编译材质）
      app.sceneManager.markMaterialsDirty();
    }
  }
  if (env.controls && controlsManager) {
    controlsManager.update(env.controls);
  }
};
