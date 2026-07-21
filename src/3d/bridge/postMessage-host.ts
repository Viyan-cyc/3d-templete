/**
 * ============================================================
 *  postMessage-host.ts — embed.vue 与 octoapp 宿主的 postMessage 桥
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
 *    SCENE_PATCH    { objects: {...} }                增量更新（阶段3）
 *
 *  embed → 宿主（子→父）：
 *    SCENE_READY    —                                  握手（onMounted 立即发，父收到重发 pendingData）
 *    SCENE_PICK     { id, name, component, props }     选中回传（阶段3）
 *    SCENE_ERROR    { message }                        解析/加载错误
 *
 *  阶段0：只实现 SCENE_UPDATE 分发 + 发 SCENE_READY/SCENE_ERROR。
 *  其余消息留空分支，阶段3 补 ScenePicker / 增量 / 主题后填充。
 * ============================================================
 */

import type { Scene3DHandle } from '../createScene3D'

/** 宿主→embed 的消息载荷类型（阶段0 仅 SCENE_UPDATE 有实质处理） */
export interface SceneHostMessage {
  type:
    | 'SCENE_UPDATE'
    | 'SCENE_PICK_MODE'
    | 'SCENE_PICK_GRANULARITY'
    | 'SCENE_FLY_TO'
    | 'SCENE_THEME'
    | 'SCENE_RESET_CAMERA'
    | 'SCENE_PATCH'
  payload?: unknown
  enabled?: boolean
  targetId?: string
  mode?: 'light' | 'dark'
  /** SCENE_PICK_GRANULARITY 的选中粒度：'part'(部件) | 'whole'(整体) */
  granularity?: 'part' | 'whole'
}

/** embed→宿主的消息载荷 */
export type SceneEmbedMessage =
  | { type: 'SCENE_READY' }
  | { type: 'SCENE_PICK'; id: string; name?: string; component?: string; props?: unknown }
  | { type: 'SCENE_ERROR'; message: string }

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
  onPatch?: (patch: unknown) => void
}

/** 向宿主发送一条 embed→父 消息 */
export function postToParent(msg: SceneEmbedMessage): void {
  // 仅当处于 iframe 内时才有意义；独立访问 embed 时 parent===self，postMessage 也安全
  window.parent.postMessage(msg, '*')
}

/**
 * 绑定 postMessage 宿主监听，返回卸载函数。
 *
 * 用法（embed.vue）：
 *   const detach = bindPostMessageHost({
 *     onScene: async (data) => { ... createScene3D / dispose ... },
 *   })
 *   onUnmounted(detach)
 *
 * 阶段0：bindPostMessageHost 本身不收 handle/picker —— 阶段3 扩展时再传入，
 * 或在 handlers.onPickMode 内部操作 picker，保持桥与渲染解耦。
 */
export function bindPostMessageHost(handlers: PostMessageHostHandlers): () => void {
  const listener = async (e: MessageEvent) => {
    // 忽略非预期来源（postMessage 用 '*'，此处只认自己的协议结构）
    const data = e.data as SceneHostMessage | undefined
    if (!data || typeof data.type !== 'string') return

    try {
      switch (data.type) {
        case 'SCENE_UPDATE':
          await handlers.onScene(data.payload ?? null)
          break
        case 'SCENE_PICK_MODE':
          handlers.onPickMode?.(data.enabled ?? false)
          break
        case 'SCENE_PICK_GRANULARITY':
          handlers.onPickGranularity?.(data.granularity ?? 'part')
          break
        case 'SCENE_FLY_TO':
          if (data.targetId) handlers.onFlyTo?.(data.targetId)
          break
        case 'SCENE_THEME':
          if (data.mode) handlers.onTheme?.(data.mode)
          break
        case 'SCENE_RESET_CAMERA':
          handlers.onResetCamera?.()
          break
        case 'SCENE_PATCH':
          handlers.onPatch?.(data.payload)
          break
        default:
          // 未知消息类型，忽略
          break
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[postMessage-host] 处理消息失败:', data.type, msg)
      postToParent({ type: 'SCENE_ERROR', message: `${data.type}: ${msg}` })
    }
  }

  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/**
 * 便捷：把 Scene3DHandle 的增量更新桥接为 SCENE_PATCH 处理器（阶段3 用）。
 * 阶段0 暂不使用，留作阶段3 onPatch 的实现参考。
 */
export function patchHandlerFromHandle(handle: Scene3DHandle) {
  return (patch: unknown) => {
    handle.update(patch as Parameters<Scene3DHandle['update']>[0])
  }
}
