/**
 * ============================================================
 *  sceneSetup — createScene3D 装配段 helper（C3 从 createScene3D.ts 拆出）
 *
 *  readDebugFromURL / setupUpdatables / createCameraRig / applySceneData /
 *  setupCss2DRenderer。纯搬位置，零逻辑变化。
 * ============================================================
 */
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { App3D } from './App3D';
import { CameraRig } from './interaction/CameraRig';
import {
  applyLiveDataToApp, mergeWithPreset, type ObjectIndex, type TreeScene,
} from './scene';
import { sharedState } from './managers/component/handlers/base/shared';
import type { OrbitControlsInstance } from './createScene3D';

/** 从 URL 查询参数读取 debug 开关 */
export const readDebugFromURL = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const val = params.get('debug');
  return val === 'true' || val === '1';
};

/** 收集 IUpdatable 组件（有 update(delta) 方法的 Object3D，如 HeatMap），注册到渲染循环 */
export const setupUpdatables = (app: App3D): void => {
  const updatables: THREE.Object3D[] = [];
  app.scene.traverse((obj) => {
    if (typeof (obj as { update?: unknown }).update === 'function') {
      updatables.push(obj);
    }
  });
  if (updatables.length > 0) {
    let lastTime = performance.now();
    app.addUpdateCallback(() => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      for (const obj of updatables) {
        ;(obj as unknown as { update?: (d: number) => void }).update?.(delta);
      }
    });
  }
};

/** 相机操作集合（通用：运行态/编辑态均创建，flyTo/setTheme/resetCamera 不再仅 interactive 模式） */
export const createCameraRig = (
  app: App3D,
  controls: OrbitControlsInstance,
  merged: TreeScene,
): CameraRig => {
  const initialPosition = app.camera.position.clone();
  const lookAt = merged.camera?.lookAt;
  const initialTarget =
    Array.isArray(lookAt) && lookAt.length >= 3
      ? new THREE.Vector3(Number(lookAt[0]), Number(lookAt[1]), Number(lookAt[2]))
      : controls.target.clone();
  return new CameraRig(app.camera, controls, app.scene, initialPosition, initialTarget);
};

/** 应用树形场景数据到场景：建环境/物体全量、设置 sharedState，返回合并配置与物体索引 */
export const applySceneData = (
  app: App3D,
  data: TreeScene,
  container: HTMLElement,
  preset: string | undefined,
): { merged: TreeScene; objectIndex: ObjectIndex } => {
  // 供 handler 通过 ctx.shared.source 读原数据
  sharedState.source = data;
  // 合并预设（供 createCameraRig 读 camera.lookAt；applyLiveDataToApp 内部也会合并，幂等）
  const merged = mergeWithPreset(data, preset ?? 'dark');
  const width = app.canvas.clientWidth || container.clientWidth || 1;
  const height = app.canvas.clientHeight || container.clientHeight || 1;
  const objectIndex: ObjectIndex = applyLiveDataToApp(app, data, {
    viewSize: { width, height },
    preset,
  });
  return { merged, objectIndex };
};

/** CSS2D 卡片层：创建 CSS2DRenderer 并挂载到容器（绝对定位、不挡指针）；DOM 钉到 3D 物体由 render(scene) 遍历投影 */
export const setupCss2DRenderer = (container: HTMLElement): CSS2DRenderer => {
  const renderer = new CSS2DRenderer();
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.pointerEvents = 'none';
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  container.appendChild(renderer.domElement);
  return renderer;
};
