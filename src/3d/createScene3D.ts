/**
 * ============================================================
 *  createScene3D — 3D 模块唯一对外主入口
 *
 *  业务方只需：
 *    const data = await fetch('/api/scene').then(r => r.json())  // 数据由业务方请求
 *    const handle = createScene3D(canvas, data, { cardRules })
 *    handle.onCardState(states => cardStates.value = states)
 *
 *    // 之后按 id 增删改物体（移动的 AGV、变色的状态、动态增删实体…）
 *    handle.update({ objects: { upsert: [...], remove: [...] } })
 *
 *    onUnmounted(() => handle.dispose())
 *
 *  引擎循环 / PMREM 环境 / OrbitControls / 相机生命周期 /
 *  CSS2D 卡片层 / resize / dispose 全部在这里封装，业务方无需感知。
 *
 *  Debug 模式：
 *    URL 添加 ?debug=true 开启 HUD 面板（calls、triangles、FPS 等）
 *    也可通过 handle.setDebug() 运行时切换
 * ============================================================
 */

import * as THREE from 'three';
import { App3D } from './App3D';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CardManager } from './managers/card/CardManager';
import type { CardStateCallback, CardScanRule } from './managers/card/types';
import { createOrbitControls } from './controls/OrbitControls';
import {
  applyLiveDataToApp,
  loadModelObjects,
  removeObjects,
  upsertObjects,
  registerAdapters,
  normalizeToModel,
  type ObjectIndex,
  type LiveDataConfig,
  type LiveDataObject,
} from './scene';
import { SelectionService } from './interaction/SelectionService';
import { SelectionVisuals } from './interaction/SelectionVisuals';
import { CameraRig } from './interaction/CameraRig';
import { InteractiveManager } from '@cyc/3d-components/interactive';
import { registerComponentHandlers, disposeComponentHandlers } from './managers';
import { sharedState } from './managers/component/handlers/base/shared';
import { registerModels, registerMaterials, getResourceManager } from './resources';

export interface Scene3DControlsOptions {
  minDistance?: number
  maxDistance?: number
  maxPolarAngle?: number
  target?: { x: number; y: number; z: number }
}

export interface Scene3DOptions {

  /** 卡片命名扫描规则（业务方提供，决定哪些物体挂卡片） */
  cardRules?: CardScanRule[]

  /** 卡片 CSS2D 层挂载容器，默认 canvas.parentElement */
  container?: HTMLElement

  /**
   * 调试模式：
   * - false（默认）：关闭
   * - true：显示 HUD 面板（calls、triangles、FPS 等）
   *
   * 也可通过 URL 参数 ?debug=true 开启，URL 参数优先级更高
   */
  debug?: boolean

  /** OrbitControls 配置 */
  controls?: Scene3DControlsOptions

  /** 是否启用阴影，默认 true */
  enableShadows?: boolean

  /**
   * 是否为交互预览态（供 octoapp iframe 嵌入）：
   * - false（默认，生产/交付）：不挂 postMessage 桥、不挂 ScenePicker
   * - true（预览/编辑）：由 Embed.vue 调用方设 true，桥与 picker 在 embed 侧挂载
   */
  interactive?: boolean

  /**
   * 场景预设名称，数据缺 scene/camera/lights 时回落到预设配置。
   * 内置预设: 'dark'（默认）| 'outdoor' | 'industrial' | 'studio'；
   * 也可通过 registerScenePreset() 注册自定义预设。
   */
  preset?: string
}

/** 物体级增量更新补丁 */
export interface SceneUpdatePatch {
  objects?: {

    /** 按 id 增/改（id 已存在则就地补丁，保留身份；不存在则创建并挂父） */
    upsert?: LiveDataObject[]

    /** 按 id 删除 */
    remove?: string[]
  }
}

export interface Scene3DHandle {
  app: App3D
  cardManager: CardManager

  /** 原始数据（投影不替换：归一化前的产品数据原样保留，供业务侧读 roads.length 等） */
  source: unknown

  /** 数据层索引：id → LiveDataObject（归一化后实体的当前数据，按 id 查；update 时维护） */
  dataMap: Map<string, LiveDataObject> | undefined

  /** OrbitControls 实例，用于编程式控制相机（target / zoom / fit-to-object 等） */
  controls: OrbitControlsInstance

  /** 订阅卡片状态变化，喂给 <CardHost :cards> */
  onCardState(cb: CardStateCallback): () => void

  /**
   * 物体级增量更新（按 id 增删改），自动同步受影响的卡片。
   * source 可选：传入则同步更新 handle.source / sharedState.source（产品全量更新场景传原始数据）。
   */
  update(patch: SceneUpdatePatch, source?: unknown): void

  /** 运行时切换调试模式：true 显示 HUD，false 关闭 */
  setDebug(mode: boolean): void

  /** 编辑态选择服务（仅 interactive:true 时存在；Embed.vue 设 onPick 回传 SCENE_PICK） */
  selection?: SelectionService

  /** 相机操作（通用：运行态/编辑态均可编程式聚焦、切主题、复位） */
  cameraRig: CameraRig

  /** 聚焦到某物体（SCENE_FLY_TO / 编程式调用；handler 经 ctx.shared.cameraRig.flyTo） */
  flyTo: (targetId: string) => void

  /** 切换主题（SCENE_THEME / 编程式调用） */
  setTheme: (mode: 'light' | 'dark') => void

  /** 复位相机到初始视角（SCENE_RESET_CAMERA / 编程式调用） */
  resetCamera: () => void

  /** 销毁：释放 GPU/DOM/事件资源 */
  dispose(): void
}

/** OrbitControls 实例类型（便于外部声明变量类型时引用） */
export type OrbitControlsInstance = ReturnType<typeof createOrbitControls>

/** 从 URL 查询参数读取 debug 开关 */
const readDebugFromURL = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const val = params.get('debug');
  return val === 'true' || val === '1';
};

/** 收集 3d-components 的 IUpdatable 组件（如 HeatMesh 需要每帧 update），注册到渲染循环 */
const setupUpdatables = (app: App3D): void => {
  const updatables: THREE.Object3D[] = [];
  app.scene.traverse((obj) => {
    if (obj.userData?.__updatable) {
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
const createCameraRig = (
  app: App3D,
  controls: OrbitControlsInstance,
  data: LiveDataConfig,
): CameraRig => {
  const initialPosition = app.camera.position.clone();
  const lookAt = data.camera?.lookAt;
  const initialTarget =
    Array.isArray(lookAt) && lookAt.length >= 3
      ? new THREE.Vector3(Number(lookAt[0]), Number(lookAt[1]), Number(lookAt[2]))
      : controls.target.clone();
  return new CameraRig(app.camera, controls, app.scene, initialPosition, initialTarget);
};

/** 编辑态选择服务（仅 interactive:true 时调用：底座订阅 scene，拾取默认关闭，由 SCENE_PICK_MODE 触发 enable） */
const setupSelection = (app: App3D, interactiveManager: InteractiveManager): SelectionService => {
  const visuals = new SelectionVisuals(app.scene);
  const selection = new SelectionService(app.scene, visuals, app.canvas);
  selection.attach(interactiveManager);
  app.addUpdateCallback(() => selection.update());
  return selection;
};

/** 组装对外 handle（update / dispose 等方法闭包） */
const createHandle = (params: {
  app: App3D
  cardManager: CardManager
  css2DRenderer: CSS2DRenderer
  controls: OrbitControlsInstance
  objectIndex: ObjectIndex
  cardRules: CardScanRule[] | undefined
  resizeObserver: ResizeObserver
  source: unknown
  interactiveManager: InteractiveManager
  cameraRig: CameraRig
  selection?: SelectionService
}): Scene3DHandle => {
  const {
    app, cardManager, css2DRenderer, controls, objectIndex, cardRules,
    resizeObserver, interactiveManager, cameraRig, selection,
  } = params;
  let disposed = false;
  let source = params.source;

  return {
    app,
    cardManager,
    controls,
    get source() {
      return source;
    },
    get dataMap() {
      return sharedState.dataMap;
    },
    onCardState: (cb) => cardManager.onStateChange(cb),
    update(patch: SceneUpdatePatch, sourceData?: unknown): void {
      if (sourceData !== undefined) {
        source = sourceData;
        sharedState.source = sourceData;
      }
      const map = sharedState.dataMap;
      const changed: string[] = [];
      if (patch.objects?.remove?.length) {
        if (map) {
          for (const id of patch.objects.remove) {
            map.delete(id);
          }
        }
        changed.push(...removeObjects(app.scene, objectIndex, patch.objects.remove));
      }
      if (patch.objects?.upsert?.length) {
        if (map) {
          for (const obj of patch.objects.upsert) {
            map.set(obj.id, obj);
          }
        }
        changed.push(...upsertObjects(app.scene, objectIndex, patch.objects.upsert));
      }
      cardManager.refreshCards(app.scene, cardRules ?? [], changed);
    },
    setDebug(mode: boolean): void {
      app.setDebug(mode);
    },
    selection,
    cameraRig,
    flyTo: (targetId: string) => cameraRig.flyTo(targetId),
    setTheme: (mode: 'light' | 'dark') => cameraRig.setTheme(mode),
    resetCamera: () => cameraRig.resetCamera(),
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      selection?.dispose();
      interactiveManager.dispose();
      resizeObserver.disconnect();
      controls.dispose();
      cardManager.dispose();
      css2DRenderer.domElement.remove();
      disposeComponentHandlers();
      app.dispose();
    },
  };
};

/** 归一化产品数据并应用到场景：建环境/物体全量、设置 sharedState，返回归一化配置与物体索引 */
const applySceneData = (
  app: App3D,
  data: LiveDataConfig,
  container: HTMLElement,
  preset: string | undefined,
): { normalized: LiveDataConfig; objectIndex: ObjectIndex } => {
  const model = normalizeToModel(data);
  const normalized: LiveDataConfig = { ...data, objects: model.objects };
  // 供 handler 通过 ctx.shared.source 读原数据 / ctx.shared.dataMap 按 id 查数据
  sharedState.source = data;
  sharedState.dataMap = new Map<string, LiveDataObject>(model.objects.map((o) => [o.id, o]));
  const width = app.canvas.clientWidth || container.clientWidth || 1;
  const height = app.canvas.clientHeight || container.clientHeight || 1;
  const objectIndex: ObjectIndex = applyLiveDataToApp(app, normalized, {
    viewSize: { width, height },
    preset,
  });
  return { normalized, objectIndex };
};

/** CSS2D 卡片层：创建 CSS2DRenderer 并挂载到容器（绝对定位、不挡指针）；DOM 钉到 3D 物体由 render(scene) 遍历投影 */
const setupCss2DRenderer = (container: HTMLElement): CSS2DRenderer => {
  const renderer = new CSS2DRenderer();
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.pointerEvents = 'none';
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  container.appendChild(renderer.domElement);
  return renderer;
};

/**
 * 初始化一个完整的 live-data 驱动 3D 场景。
 */
export const createScene3D = async (
  canvas: HTMLCanvasElement,
  data: LiveDataConfig,
  options: Scene3DOptions = {},
): Promise<Scene3DHandle> => {
  const {
    cardRules, controls: controlsOpts, enableShadows = true, interactive = false, preset,
  } = options;
  const container = options.container ?? canvas.parentElement ?? document.body;

  // URL 参数优先于 options.debug
  const debug = readDebugFromURL() || options.debug || false;

  // 0. 注册业务 handler + 数据 adapter + 资源（模型/材质注册表 + 全局 ResourceManager，幂等）
  registerComponentHandlers();
  registerAdapters();
  registerModels();
  registerMaterials();
  sharedState.resources = getResourceManager();

  // 1. 3D 引擎
  const app = new App3D({
    canvas, enableShadows, antialias: true, debug,
  });

  // 2. 交互底座（单实例 InteractiveManager）：纯指针事件路由层。提前到 applySceneData 之前创建并
  //    注入 sharedState，使 handler.create 同步阶段即可拿到 manager（example handler 在 cloneModel.then
  //    异步 add）。传 scene（全树 raycast 一次、靠父链展开识别注册对象）、clickThreshold 区分点击/拖拽。
  //    无 hover handler 声明时 pointermove 短路零 raycast（见 interactive 源码 _hasAnyHoverHandler 短路）。
  const interactiveManager = new InteractiveManager({
    camera: app.camera,
    domElement: app.canvas,
    scene: app.scene,
    clickThreshold: 5,
  });
  sharedState.interactiveManager = interactiveManager;

  // 3. 应用数据（归一化 + 建环境/物体 + sharedState），拿到 id→Object3D 索引供 update 用
  const { normalized, objectIndex } = applySceneData(app, data, container, preset);

  // applySceneData 内 createLiveEnvironment 会新建相机（透视/正交）并 app.setCamera 替换，
  // 必须同步给交互底座 —— 否则 InteractiveManager 仍用构造时捕获的旧相机，setFromCamera 算出的
  // 射线与渲染画面错位，点击全打偏（只命中包围场景的 Sky 球壁）。
  interactiveManager.setCamera(app.camera);

  // 4. OrbitControls（相机替换之后再创建）
  const controls = createOrbitControls(app.camera, canvas, controlsOpts);

  // 5. CSS2D 卡片层（DOM 钉到 3D 物体）+ 卡片系统（CardManager，绑定交互底座 + 扫描注册卡片）
  const css2DRenderer = setupCss2DRenderer(container);

  const cardManager = new CardManager();
  cardManager.bindInteraction(interactiveManager, app.scene, interactive);
  cardManager.scanAndRegisterCards(app.scene, cardRules ?? []);
  sharedState.cardManager = cardManager;

  // 6. 接入 App3D 自有渲染循环（update → WebGL render → CSS2D post-render）
  app.addUpdateCallback(() => controls.update());
  // 交互底座每帧 update：相机移动后刷新 hover（无 hover 声明时短路为 no-op，零 raycast）
  app.addUpdateCallback(() => interactiveManager.update());
  app.addPostRenderCallback(() => css2DRenderer.render(app.scene, app.camera));
  // App3D 内部接管 RAF + window resize（含相机 aspect/正交重算）
  app.start();

  // 7. CSS2D 层尺寸随容器变化（App3D 只管 WebGL canvas 与相机）
  const resizeObserver = new ResizeObserver(() => {
    css2DRenderer.setSize(container.offsetWidth, container.offsetHeight);
  });
  resizeObserver.observe(container);

  // 8. 异步加载外部模型（占位节点已在 applyLiveDataToApp 中创建）
  loadModelObjects(objectIndex, normalized.objects).catch((err) => {
    console.error('[createScene3D] 模型加载失败:', err);
  });

  // 9. 收集 3d-components 的 IUpdatable 组件（如 HeatMesh 需要每帧 update）
  setupUpdatables(app);

  // 10. 相机操作（通用，注入 sharedState 供 handler 用）+ 编辑态选择服务（仅 interactive:true）
  const cameraRig = createCameraRig(app, controls, normalized);
  sharedState.cameraRig = cameraRig;
  const selection = interactive ? setupSelection(app, interactiveManager) : undefined;

  return createHandle({
    app,
    cardManager,
    css2DRenderer,
    controls,
    objectIndex,
    cardRules,
    resizeObserver,
    source: data,
    interactiveManager,
    cameraRig,
    selection,
  });
};
