/**
 * ============================================================
 *  createScene3D — 3D 模块唯一对外主入口
 *
 *  业务方只需：
 *    const data = await fetch('/api/scene').then(r => r.json())  // 分组扁平 TreeScene
 *    const handle = createScene3D(canvas, data, { cardRules })
 *    handle.onCardState(states => cardStates.value = states)
 *
 *    // 之后全量推送更新（分组字典 + 可选 remove:[ids]，不 diff）
 *    handle.update({ buildings: [...], remove: ['wave'] })
 *
 *    onUnmounted(() => handle.dispose())
 *
 *  引擎循环 / PMREM 环境 / OrbitControls / 相机生命周期 /
 *  CSS2D 卡片层 / resize / dispose 全部在这里封装，业务方无需感知。
 *
 *  Debug 模式：
 *    URL 添加 ?debug=true 开启 HUD 面板（calls、triangles、FPS 等）
 *    也可通过 handle.setDebug() 运行时切换
 *
 *  结构（Phase R C3）：
 *    - 本文件：公共类型（Scene3DOptions/Scene3DHandle）+ 装配编排
 *    - sceneSetup.ts：装配 helper（debug 开关/updatables/CameraRig/场景应用/CSS2D）
 *    - sceneHandle.ts：handle 组装 + 编辑 helper
 * ============================================================
 */

import { App3D } from './App3D';
import type { CardScanRule } from './managers/card/types';
import { createOrbitControls } from './controls/OrbitControls';
import type { TreeScene, EnvUpdate } from './scene';
import { SelectionService, type MaterialSnapshot } from './interaction/SelectionService';
import { SelectionVisuals } from './interaction/SelectionVisuals';
import type { SceneEditTransform, SceneTreeNode } from './bridge/postMessageHost';
import type { CameraRig } from './interaction/CameraRig';
import { InteractiveManager } from '@a3d/a3d-components/interactive';
import { registerComponentHandlers } from './managers';
import { sharedState } from './managers/component/handlers/base/shared';
import { registerModels, registerMaterials, getResourceManager } from './resources';
import {
  applySceneData, createCameraRig, readDebugFromURL, setupCss2DRenderer, setupUpdatables,
} from './sceneSetup';
import { createHandle } from './sceneHandle';

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

export interface Scene3DHandle {
  app: App3D
  cardManager: CardManager

  /** 原始数据（分组扁平 TreeScene，业务侧读 handle.source.buildings.length 等） */
  source: unknown

  /** OrbitControls 实例，用于编程式控制相机（target / zoom / fit-to-object 等） */
  controls: OrbitControlsInstance

  /** 订阅卡片状态变化，喂给 <CardHost :cards> */
  onCardState(cb: CardStateCallback): () => void

  /**
   * 增量更新（全量分组字典 + 可选 remove）。先 remove，再对根节点 update/create，不 diff。
   * source 可选：传入则同步更新 handle.source / sharedState.source。
   */
  update(tree: TreeScene, source?: unknown): void

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

  /** 场景级增量更新（SCENE_PATCH_ENV）：只 mutate camera/lights/scene.background·fog 不重建物体树（M-3 ①） */
  updateEnvironment: (env: EnvUpdate) => void

  /**
   * 按 __id 直改运行时 Object3D 的材质/transform（SCENE_EDIT_OBJECT）。
   * 用于编辑态选中的子 mesh（不在 data 层、数据层增量更新够不到）——即时生效，不落盘 live-data。
   */
  editObject?: (p: { id: string; material?: MaterialSnapshot; transform?: SceneEditTransform }) => void

  /**
   * 按 __id 即时从运行时场景树移除 Object3D（SCENE_REMOVE_OBJECT）。
   * parent.remove + dispose 几何/材质，不碰 data 层（持久化由宿主侧 editDelta.deleted → patchHandlerSkip 改源码）。
   */
  removeObject?: (id: string) => void

  /**
   * 查询场景 Object3D 树（SCENE_QUERY_TREE）。
   * 遍历 app.scene.traverse()，收集 userData.__id 非空的节点（根+子部件+兜底 part-N），
   * 跳过无 __id 的纯几何 leaf mesh，回传 SceneTreeNode[] 供宿主大纲面板渲染。
   */
  queryTree?: () => SceneTreeNode[];

  /**
   * 按 __id 高亮物体（SCENE_SELECT）。
   * 大纲点击触发：findByUserId 定位 + SelectionVisuals.highlight（复用选中高亮），
   * 不发 SCENE_PICK（区别于 canvas 点击拾取）。
   */
  selectObject?: (targetId: string) => void;

  /** 切换可见性（SCENE_SET_VISIBLE）：递归设 obj + 子孙 visible，运行时态不落盘 */
  setVisible?: (id: string, visible: boolean) => void;

  /** 重命名（SCENE_RENAME）：改 Object3D.name，不改 __id，运行时态不落盘 */
  renameObject?: (id: string, name: string) => void;

  /** 锁定/解锁（SCENE_SET_LOCKED）：设 userData.__locked，picker handleClick 跳过锁定物，运行时态不落盘 */
  setLocked?: (id: string, locked: boolean) => void;

  /** 销毁：释放 GPU/DOM/事件资源 */
  dispose(): void
}

/** OrbitControls 实例类型（便于外部声明变量类型时引用） */
export type OrbitControlsInstance = ReturnType<typeof createOrbitControls>

/** 编辑态选择服务（仅 interactive:true 时调用：底座订阅 scene，拾取默认关闭，由 SCENE_PICK_MODE 触发 enable） */
const setupSelection = (app: App3D, interactiveManager: InteractiveManager): SelectionService => {
  const visuals = new SelectionVisuals(app.scene);
  const selection = new SelectionService(app.scene, visuals, app.canvas);
  selection.attach(interactiveManager);
  app.addUpdateCallback(() => selection.update());
  return selection;
};

/**
 * 初始化一个完整的树形场景驱动 3D 场景。
 */
export const createScene3D = async (
  canvas: HTMLCanvasElement,
  data: TreeScene,
  options: Scene3DOptions = {},
): Promise<Scene3DHandle> => {
  const {
    cardRules, controls: controlsOpts, enableShadows = true, interactive = false, preset,
  } = options;
  const container = options.container ?? canvas.parentElement ?? document.body;

  // URL 参数优先于 options.debug
  const debug = readDebugFromURL() || options.debug || false;

  // 0. 注册业务 handler + 资源（模型/材质注册表 + 全局 ResourceManager，幂等）
  registerComponentHandlers();
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

  // 3. 应用数据（建环境/物体全量 + sharedState），拿到 id→Object3D 索引供 update 用
  const { merged, objectIndex } = applySceneData(app, data, container, preset);

  // applySceneData 内 applyEnvironment 会新建相机（透视/正交）并 app.setCamera 替换，
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

  // 8. 收集 3d-components 的 IUpdatable 组件（如 HeatMesh 需要每帧 update）
  setupUpdatables(app);

  // 9. 相机操作（通用，注入 sharedState 供 handler 用）+ 编辑态选择服务（仅 interactive:true）
  const cameraRig = createCameraRig(app, controls, merged);
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
