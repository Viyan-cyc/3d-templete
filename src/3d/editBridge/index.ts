/**
 * ============================================================
 *  editBridge — UXAI 编辑对接层（隔离于 core）
 *
 *  3d-templete 导出给二次开发：core（渲染/通用交互）不 import 本目录；
 *  编辑能力（拾取/粒度选中/材质直改/大纲树/postMessage 协议）全部收口在此。
 *  宿主用法：handle = attachEditBridge(await createScene3D(...))
 * ============================================================
 */
export { attachEditBridge } from './editHandle';
export type { EditSceneHandle } from './editHandle';
export { bindPostMessageHost, postToParent } from './postMessageHost';
export type {
  SceneHostMessage, SceneEmbedMessage, SceneEditTransform, SceneTreeNode, PostMessageHostHandlers,
} from './postMessageHost';
export { SelectionService } from './SelectionService';
export type { PickInfo, SelectionGranularity, MaterialSnapshot } from './SelectionService';
export { SelectionVisuals } from './SelectionVisuals';
