/**
 * ============================================================
 *  editHandle — 编辑态 handle（UXAI 编辑对接层入口）
 *
 *  attachEditBridge(core)：在 core Scene3DHandle 上挂编辑能力——
 *  SelectionVisuals + SelectionService（拾取/粒度/高亮）+ 编辑方法
 *  （editObject/removeObject/queryTree/selectObject/setVisible/rename/setLocked）。
 *  即原 createScene3D interactive:true 做的事（C4 从 core 剥出）。
 *
 *  EditSceneHandle = Scene3DHandle + selection 必填 + 编辑方法必填。
 *  dispose 包装：先 selection.dispose() 再 coreHandle.dispose()（保持原顺序）。
 * ============================================================
 */
import type { App3D } from '../App3D';
import type { Scene3DHandle } from '../createScene3D';
import { SelectionService, type MaterialSnapshot } from './SelectionService';
import { SelectionVisuals } from './SelectionVisuals';
import type { SceneEditTransform } from './postMessageHost';
import {
  applyMaterial, applyTransform, buildSceneTree, disposeSceneObject, findByUserId, mutateByUserId,
} from './sceneEdit';

/** 编辑态 handle：core handle + selection 必填 + 编辑方法必填 */
export interface EditSceneHandle extends Scene3DHandle {
  selection: SelectionService
  editObject: (p: { id: string; material?: MaterialSnapshot; transform?: SceneEditTransform }) => void
  removeObject: (id: string) => void
  queryTree: () => ReturnType<Scene3DHandle['queryTree']> extends (...args: never[]) => infer R ? R : never
  selectObject: (targetId: string) => void
  setVisible: (id: string, visible: boolean) => void
  renameObject: (id: string, name: string) => void
  setLocked: (id: string, locked: boolean) => void
}

/** 编辑方法实现（挂到 EditSceneHandle 上；与原 sceneHandle createHandle 内实现 verbatim 一致） */
const createEditMethods = (
  app: App3D,
  selection: SelectionService,
): Pick<EditSceneHandle,
  'editObject' | 'removeObject' | 'queryTree' | 'selectObject' | 'setVisible' | 'renameObject' | 'setLocked'
> => ({
  editObject: (p) =>
    mutateByUserId(app.scene, p.id, (obj) => {
      if (p.transform) {
        applyTransform(obj, p.transform);
      }
      if (p.material) {
        applyMaterial(obj, p.material);
      }
    }),
  removeObject: (id: string) => disposeSceneObject(app, id),
  queryTree: () => buildSceneTree(app.scene),
  selectObject: (targetId: string) => {
    const obj = findByUserId(app.scene, targetId);
    if (!obj) {
      return;
    }
    selection.visualRef.highlight(obj);
  },
  setVisible: (id: string, visible: boolean) =>
    mutateByUserId(app.scene, id, (obj) => {
      obj.visible = visible;
      obj.traverse((c) => {
        c.visible = visible;
      });
    }),
  renameObject: (id: string, name: string) =>
    mutateByUserId(app.scene, id, (obj) => {
      obj.name = name;
    }),
  setLocked: (id: string, locked: boolean) =>
    mutateByUserId(app.scene, id, (obj) => {
      obj.userData.__locked = locked;
    }),
});

/**
 * 在 core handle 上挂编辑桥：拾取服务（SelectionVisuals + SelectionService + 底座挂载 + 每帧 update）
 * + 7 个编辑方法。返回 EditSceneHandle；dispose 已包装（先 selection 后 core，保持原顺序）。
 */
export const attachEditBridge = (core: Scene3DHandle): EditSceneHandle => {
  // 拾取服务（原 createScene3D setupSelection verbatim）：底座订阅 scene，拾取默认关闭，
  // 由 SCENE_PICK_MODE 触发 enable
  const visuals = new SelectionVisuals(core.app.scene);
  const selection = new SelectionService(core.app.scene, visuals, core.app.canvas);
  selection.attach(core.interactiveManager);
  core.app.addUpdateCallback(() => selection.update());

  const editMethods = createEditMethods(core.app, selection);

  const handle: EditSceneHandle = {
    ...core,
    selection,
    ...editMethods,
    dispose(): void {
      // 先 selection 后 core（原 disposeHandle 顺序）；core.dispose 幂等由其 disposed 标志保证
      selection.dispose();
      core.dispose();
    },
  };
  return handle;
};
