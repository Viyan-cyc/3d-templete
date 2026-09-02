/**
 * ============================================================
 *  postMessageHost.ts — Embed.vue 与 octoapp 宿主的 postMessage 桥
 *
 *  通信协议（与 octoapp pages/3d 对齐，命名见 3D_PAGE_DESIGN.md §1.2）：
 *
 *  宿主 → embed（父→子）：
 *    SCENE_UPDATE   { payload: SceneConfig | null }   推送/清空场景 JSON
 *    SCENE_PICK_MODE { enabled: boolean }             开/关编辑态选中（阶段3）
 *    SCENE_PICK_GRANULARITY { granularity }           选中粒度 part(部件)|whole(整体)
 *    SCENE_FLY_TO   { targetId: string }              聚焦物体（阶段3）
 *    SCENE_THEME    { mode: 'light'|'dark' }          切主题（阶段3）
 *    SCENE_RESET_CAMERA —                              复位相机到初始视角
 *    SCENE_EDIT_OBJECT { id, material?, transform? }  直改运行时 Object3D 材质/transform（子 mesh 不在 data 层，即时生效）
 *    SCENE_PATCH_ENV { camera?, lights?, scene? }     场景级增量更新：mutate 灯光/相机/背景·雾，不重建物体树（M-3 ①）
 *
 *  embed → 宿主（子→父）：
 *    SCENE_READY    —                                  握手（onMounted 立即发，父收到重发 pendingData）
 *    SCENE_PICK     { id, name, component, props, isMesh, material, transform }  选中回传（含 transform 弧度快照）
 *    SCENE_ERROR    { message }                        解析/加载错误（fatal：场景构建抛错）
 *    SCENE_CONSOLE_ERROR { level, message, stack? }    运行时 console.error / window error / unhandledrejection（9a 门控捕获）
 *
 *  阶段0：只实现 SCENE_UPDATE 分发 + 发 SCENE_READY/SCENE_ERROR。
 *  其余消息留空分支，阶段3 补 ScenePicker / 增量 / 主题后填充。
 * ============================================================
 */

import type { MaterialSnapshot } from '../interaction/SelectionService';
import type { EnvUpdate } from '../scene';

/** SCENE_EDIT_OBJECT 的 transform 载荷（三轴数组，沿用 SceneConfig 约定：position/rotation/scale） */
export interface SceneEditTransform {
  position?: number[];
  rotation?: number[];
  scale?: number[];
}

/** 宿主→embed 的消息载荷类型（阶段0 仅 SCENE_UPDATE 有实质处理） */
export interface SceneHostMessage {
  type:
    | 'SCENE_UPDATE'
    | 'SCENE_PICK_MODE'
    | 'SCENE_PICK_GRANULARITY'
    | 'SCENE_FLY_TO'
    | 'SCENE_THEME'
    | 'SCENE_RESET_CAMERA'
    | 'SCENE_EDIT_OBJECT'
    | 'SCENE_PATCH_ENV'
  payload?: unknown
  enabled?: boolean
  targetId?: string
  mode?: 'light' | 'dark'

  /** SCENE_PICK_GRANULARITY 的选中粒度：'part'(部件) | 'whole'(整体) */
  granularity?: 'part' | 'whole'

  /** SCENE_EDIT_OBJECT：目标 Object3D 的 __id（沿父子链盖戳） */
  id?: string

  /** SCENE_EDIT_OBJECT：材质覆盖（仅 mesh 生效） */
  material?: MaterialSnapshot

  /** SCENE_EDIT_OBJECT：transform 覆盖 */
  transform?: SceneEditTransform

  /** SCENE_PATCH_ENV：场景级增量更新（M-3 ①）—— camera/lights/scene 保留键，运行时 mutate 不重建物体树 */
  camera?: EnvUpdate['camera']
  lights?: EnvUpdate['lights']
  scene?: EnvUpdate['scene']
}

/** embed→宿主的消息载荷 */
export type SceneEmbedMessage =
  | { type: 'SCENE_READY' }
  | { type: 'SCENE_PICK'; id: string; name?: string; component?: string; props?: unknown; isMesh?: boolean; material?: MaterialSnapshot; transform?: SceneEditTransform }
  | { type: 'SCENE_ERROR'; message: string }
  | { type: 'SCENE_CONSOLE_ERROR'; level: 'error' | 'warn'; message: string; stack?: string }

/** 宿主消息的回调集合 */
export interface PostMessageHostHandlers {

  /** 收到 SCENE_UPDATE：data 为 SceneConfig 或 null（清空） */
  onScene: (data: unknown | null) => void | Promise<void>

  /** 以下阶段3 启用，阶段0 留空实现 */
  onPickMode?: (enabled: boolean) => void

  /** 选中粒度切换：'part'(部件) | 'whole'(整体) */
  onPickGranularity?: (mode: 'part' | 'whole') => void
  onFlyTo?: (targetId: string) => void
  onTheme?: (mode: 'light' | 'dark') => void
  onResetCamera?: () => void

  /** SCENE_EDIT_OBJECT：按 __id 直改运行时 Object3D 的材质/transform（子 mesh 不在 data 层，走此即时通路） */
  onEditObject?: (payload: { id: string; material?: MaterialSnapshot; transform?: SceneEditTransform }) => void

  /** SCENE_PATCH_ENV：场景级增量更新（M-3 ①）—— mutate camera/lights/scene.background·fog，不 dispose 物体树 */
  onPatchEnv?: (env: EnvUpdate) => void
}

/** 向宿主发送一条 embed→父 消息 */
export const postToParent = (msg: SceneEmbedMessage): void => {
  // 仅当处于 iframe 内时才有意义；独立访问 embed 时 parent===self，postMessage 也安全
  window.parent.postMessage(msg, '*');
};

/**
 * 绑定 postMessage 宿主监听，返回卸载函数。
 *
 * 用法（Embed.vue）：
 *   const detach = bindPostMessageHost({
 *     onScene: async (data) => { ... createScene3D / dispose ... },
 *   })
 *   onUnmounted(detach)
 *
 * 阶段0：bindPostMessageHost 本身不收 handle/picker —— 阶段3 扩展时再传入，
 * 或在 handlers.onPickMode 内部操作 picker，保持桥与渲染解耦。
 */
export const bindPostMessageHost = (handlers: PostMessageHostHandlers): () => void => {
  const listener = async (e: MessageEvent) => {
    // 忽略非预期来源（postMessage 用 '*'，此处只认自己的协议结构）
    const data = e.data as SceneHostMessage | undefined;
    if (!data || typeof data.type !== 'string') {
      return;
    }

    try {
      switch (data.type) {
        case 'SCENE_UPDATE':
          await handlers.onScene(data.payload ?? null);
          break;
        case 'SCENE_PICK_MODE':
          handlers.onPickMode?.(data.enabled ?? false);
          break;
        case 'SCENE_PICK_GRANULARITY':
          handlers.onPickGranularity?.(data.granularity ?? 'part');
          break;
        case 'SCENE_FLY_TO':
          if (data.targetId) {
            handlers.onFlyTo?.(data.targetId);
          }
          break;
        case 'SCENE_THEME':
          if (data.mode) {
            handlers.onTheme?.(data.mode);
          }
          break;
        case 'SCENE_RESET_CAMERA':
          handlers.onResetCamera?.();
          break;
        case 'SCENE_EDIT_OBJECT':
          if (data.id) {
            handlers.onEditObject?.({ id: data.id, material: data.material, transform: data.transform });
          }
          break;
        case 'SCENE_PATCH_ENV':
          handlers.onPatchEnv?.({ camera: data.camera, lights: data.lights, scene: data.scene });
          break;
        default:
          // 未知消息类型，忽略
          break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[postMessageHost] 处理消息失败:', data.type, msg);
      postToParent({ type: 'SCENE_ERROR', message: `${data.type}: ${msg}` });
    }
  };

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
};
