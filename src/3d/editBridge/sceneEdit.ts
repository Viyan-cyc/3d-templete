/**
 * ============================================================
 *  sceneEdit — 运行时直改 helper（C4 从 sceneHandle.ts 搬入 editBridge）
 *
 *  6 个编辑态 helper：findByUserId / applyMaterial / applyTransform /
 *  buildSceneTree / mutateByUserId / disposeSceneObject。
 *  verbatim 搬移，零逻辑变化（applyMaterial 的双 @types/three cast 原样保留）。
 * ============================================================
 */
import type * as THREE from 'three';
import type { App3D } from '../App3D';
import type { MaterialSnapshot } from './SelectionService';
import type { SceneEditTransform, SceneTreeNode } from './postMessageHost';
import { applySyncProps, type MaterialConfig } from '@a3d/a3d-components/material';

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
