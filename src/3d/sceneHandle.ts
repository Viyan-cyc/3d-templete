/**
 * ============================================================
 *  sceneHandle — handle 组装与编辑 helper（C3 从 createScene3D.ts 拆出）
 *
 *  createHandle（对外 Scene3DHandle 对象字面量组装）/ disposeHandle（按序释放）
 *  + 6 个运行时直改 helper（findByUserId / applyMaterial / applyTransform /
 *  buildSceneTree / mutateByUserId / disposeSceneObject）。
 *  纯搬位置，零逻辑变化。编辑 helper C4 搬 editBridge/sceneEdit.ts。
 * ============================================================
 */
import type * as THREE from 'three';
import type { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { App3D } from './App3D';
import type { CardManager } from './managers/card/CardManager';
import type { CardScanRule } from './managers/card/types';
import {
  updateTreeScene, updateEnvironment, type ObjectIndex, type TreeScene, type EnvUpdate,
} from './scene';
import type { SelectionService, MaterialSnapshot } from './interaction/SelectionService';
import type { SceneEditTransform, SceneTreeNode } from './bridge/postMessageHost';
import type { CameraRig } from './interaction/CameraRig';
import type { InteractiveManager } from '@a3d/a3d-components/interactive';
import { applySyncProps, type MaterialConfig } from '@a3d/a3d-components/material';
import { disposeComponentHandlers } from './managers';
import { sharedState } from './managers/component/handlers/base/shared';
import type { OrbitControlsInstance, Scene3DHandle } from './createScene3D';

/** mesh 材质持有侧像（仅取 material + 数组守卫；属性写入复用 3d-components applySyncProps） */
interface EditMeshLike {
  material?: unknown;
}

/** 按 userData.__id 在场景树里查 Object3D（编辑态运行时直改用；index 只含根节点，子 mesh 靠遍历） */
export const findByUserId = (root: THREE.Object3D, id: string): THREE.Object3D | null => {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.userData?.__id === id) {
      found = o;
    }
  });
  return found;
};

/**
 * 把材质覆盖应用到 mesh（非 mesh / 多材质跳过）。
 * 写入复用 3d-components applySyncProps（duck-type 守卫 + needsUpdate），避免手写属性表与工厂分叉。
 * `as unknown as Parameters<...>[0]` 规避双 @types/three（3d-templete vs 3d-components）冲突。
 */
export const applyMaterial = (obj: THREE.Object3D, m: MaterialSnapshot): void => {
  const raw = (obj as unknown as EditMeshLike).material;
  if (!raw || Array.isArray(raw)) {
    return;
  }
  applySyncProps(
    raw as unknown as Parameters<typeof applySyncProps>[0],
    m as unknown as MaterialConfig,
  );
};

/**
 * 大纲树构建（SCENE_QUERY_TREE）：遍历收集 userData.__id 非空节点（根+子部件+兜底 part-N），
 * 跳过无 __id 的纯几何 leaf mesh；traverse 顺序父先于子，先收集再回填 children。
 */
export const buildSceneTree = (scene: THREE.Scene): SceneTreeNode[] => {
  const nodes: SceneTreeNode[] = [];
  const idToChildren = new Map<string, string[]>();
  scene.traverse((obj) => {
    const uid = obj.userData?.__id;
    if (typeof uid !== 'string' || uid === '') {
      return;
    }
    const parent = obj.parent;
    const parentId =
      parent && typeof parent.userData?.__id === 'string' && parent.userData.__id !== ''
        ? parent.userData.__id
        : null;
    const node: SceneTreeNode = {
      id: uid,
      name: obj.name || uid,
      type: typeof obj.userData?.__componentType === 'string' ? obj.userData.__componentType : undefined,
      parentId,
      isLogicalRoot: obj.userData?.__logicalRoot === true,
      visible: obj.visible,
      locked: obj.userData?.__locked === true,
    };
    nodes.push(node);
    if (parentId) {
      const arr = idToChildren.get(parentId) ?? [];
      arr.push(uid);
      idToChildren.set(parentId, arr);
    }
  });
  for (const n of nodes) {
    n.children = idToChildren.get(n.id) ?? [];
  }
  return nodes;
};

/** 按 __id 找到物体执行 mutator（找不到静默跳过），setVisible/rename/setLocked 运行时直改共用 */
export const mutateByUserId = (scene: THREE.Scene, id: string, fn: (obj: THREE.Object3D) => void): void => {
  const obj = findByUserId(scene, id);
  if (obj) {
    fn(obj);
  }
};

/** 运行时直改材质/transform（SCENE_EDIT_OBJECT）：position/rotation/scale 三轴数组直设 */
export const applyTransform = (obj: THREE.Object3D, t: SceneEditTransform): void => {
  if (t.position) {
    obj.position.set(t.position[0] ?? 0, t.position[1] ?? 0, t.position[2] ?? 0);
  }
  if (t.rotation) {
    obj.rotation.set(t.rotation[0] ?? 0, t.rotation[1] ?? 0, t.rotation[2] ?? 0);
  }
  if (t.scale) {
    obj.scale.set(t.scale[0] ?? 1, t.scale[1] ?? 1, t.scale[2] ?? 1);
  }
};

/** 运行时移除物体 + dispose 其 geometry/material（避免 GPU 资源泄漏） */
export const disposeSceneObject = (app: App3D, id: string): void => {
  const obj = findByUserId(app.scene, id);
  if (!obj) {
    return;
  }
  const parent = obj.parent;
  if (!parent) {
    return;
  }
  parent.remove(obj);
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const raw = (mesh as unknown as EditMeshLike).material;
    if (raw) {
      if (Array.isArray(raw)) {
        raw.forEach((m) => (m as THREE.Material).dispose?.());
      } else {
        (raw as THREE.Material).dispose?.();
      }
    }
  });
};

/** handle.dispose 实现：按序释放 GPU/DOM/事件资源（幂等由 state.disposed 标志保证） */
export const disposeHandle = (
  state: { disposed: boolean },
  deps: {
    selection?: SelectionService
    interactiveManager: InteractiveManager
    resizeObserver: ResizeObserver
    controls: OrbitControlsInstance
    cardManager: CardManager
    css2DRenderer: CSS2DRenderer
    app: App3D
  },
): void => {
  if (state.disposed) {
    return;
  }
  state.disposed = true;
  deps.selection?.dispose();
  deps.interactiveManager.dispose();
  deps.resizeObserver.disconnect();
  deps.controls.dispose();
  deps.cardManager.dispose();
  deps.css2DRenderer.domElement.remove();
  disposeComponentHandlers();
  deps.app.dispose();
};

/** 组装对外 handle（update / dispose 等方法闭包） */
export const createHandle = (params: {
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
  const disposedState = { disposed: false };
  let source = params.source;

  return {
    app,
    cardManager,
    controls,
    get source() {
      return source;
    },
    onCardState: (cb) => cardManager.onStateChange(cb),
    update(tree: TreeScene, sourceData?: unknown): void {
      if (sourceData !== undefined) {
        source = sourceData;
        sharedState.source = sourceData;
      }
      const changed = updateTreeScene(app.scene, objectIndex, tree);
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
    updateEnvironment: (env: EnvUpdate) => {
      const width = app.canvas.clientWidth || 1;
      const height = app.canvas.clientHeight || 1;
      updateEnvironment(app, env, { width, height });
    },
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
      // 复用 SelectionService 的 visuals 高亮（若 selection 存在）；否则直接 new SelectionVisuals
      if (selection) {
        selection.visualRef.highlight(obj);
      }
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
    dispose(): void {
      disposeHandle(disposedState, {
        interactiveManager,
        resizeObserver,
        controls,
        cardManager,
        css2DRenderer,
        app,
        selection,
      });
    },
  };
};
