/**
 * objects — 物体生命周期：创建 / 挂载 / 更新 / 删除 / 销毁。
 *
 * - buildObjects:全量建(create + 两遍挂载 + zone/logicalRoot 标记)→ 返回 ObjectIndex
 * - upsertObjects / removeObjects:按 id 增量改/删
 * - loadModelObjects:异步填充带 src 的模型占位
 *
 * 创建走 ComponentManager(data → manager → handlers → components);patch/dispose 是
 * update/delete 的 defaultFn,复用 components 层工厂,保证增量与初始化一致。
 */
import * as THREE from 'three';
import type { LiveDataObject } from './loader';
import { loadModel } from '../models/loader';
import { componentManager, type ComponentContext, type ObjectIndex } from '../managers/component/ComponentManager';
import { sharedState } from '../managers/component/handlers/base/shared';
import { applyTransform, createGeometry, createLiveMaterial } from '../components';

// ObjectIndex 定义在 ComponentManager（manager 层），此处 re-export 供 scene/index、3d/index 取用
export type { ObjectIndex } from '../managers/component/ComponentManager';

// ── 共用 helper ──

/** 组件节点展开的子节点注册进 index（供其他物体 parentId 引用 + raycast 识别） */
const registerComponentChildren = (node: THREE.Object3D, index: ObjectIndex): void => {
  node.traverse((child) => {
    if (child.userData?.id && child !== node) {
      index.set(child.userData.id, child);
    }
  });
};

/**
 * 全量标记分区(__zone)/逻辑根(__logicalRoot)，供 ScenePicker「整体/部件」选中模式。
 * zone 身份优先读 o.__zone(权威源,支持嵌套分区);无标记时回落到「root 直接子=zone」启发式。
 * logicalRoot = zone 的直接子(用户视角的"一个整体");排除自身也是 zone 的节点(嵌套分区 bug 修复)。
 * 纯 parentId 图计算,不依赖 Three 挂载结果。
 */
const markZones = (objects: LiveDataObject[], index: ObjectIndex): void => {
  const rootIds = new Set<string>();
  for (const o of objects) {
    if (!o.parentId) {
      rootIds.add(o.id);
    }
  }
  const zoneIds = new Set<string>();
  for (const o of objects) {
    if (o.__zone) {
      zoneIds.add(o.id);
    }
  }
  if (zoneIds.size === 0) {
    for (const o of objects) {
      if (o.parentId && rootIds.has(o.parentId)) {
        zoneIds.add(o.id);
      }
    }
  }
  for (const id of zoneIds) {
    const n = index.get(id);
    if (n) {
      n.userData.__zone = true;
    }
  }
  for (const o of objects) {
    if (o.parentId && zoneIds.has(o.parentId) && !zoneIds.has(o.id)) {
      const n = index.get(o.id);
      if (n) {
        n.userData.__logicalRoot = true;
      }
    }
  }
};

/** 增量单节点 zone/logicalRoot 标记（best-effort：只看自身 __zone 标记 + 父节点是否 zone） */
const markZoneSingle = (def: LiveDataObject, node: THREE.Object3D, index: ObjectIndex): void => {
  if (def.__zone) {
    node.userData.__zone = true;
  }
  if (def.parentId) {
    const parent = index.get(def.parentId);
    if (parent?.userData.__zone) {
      node.userData.__logicalRoot = true;
    }
  }
};

/** 就地补丁:transform 总是应用;mesh 额外按需重建 material/geometry */
const patchObject = (obj: THREE.Object3D, def: LiveDataObject): void => {
  applyTransform(obj, def);

  if ((obj as THREE.Mesh).isMesh) {
    const mesh = obj as THREE.Mesh;
    if (def.material) {
      const old = mesh.material;
      if (Array.isArray(old)) {
        old.forEach((m) => m.dispose());
      } else {
        old?.dispose();
      }
      mesh.material = createLiveMaterial(def.material);
    }
    if (def.geometry) {
      const geo = createGeometry(def.geometry);
      if (geo) {
        mesh.geometry?.dispose();
        mesh.geometry = geo;
      }
    }
  }

  if (def.castShadow !== undefined) {
    obj.castShadow = def.castShadow;
  }
  if (def.receiveShadow !== undefined) {
    obj.receiveShadow = def.receiveShadow;
  }
};

/** dispose 一个 Object3D 及其子孙的几何/材质 */
const disposeObject = (obj: THREE.Object3D): void => {
  obj.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else {
      mat?.dispose();
    }
  });
};

// ══════════════════════════════════════════════════════════════
// 全量构建
// ══════════════════════════════════════════════════════════════

/**
 * 全量建物体:两遍(create → 挂父)+ zone/logicalRoot 标记。返回 id→Object3D 索引。
 */
export const buildObjects = (
  scene: THREE.Scene,
  objects: LiveDataObject[],
): ObjectIndex => {
  const nodeMap: ObjectIndex = new Map();
  const ctx: ComponentContext = { scene, index: nodeMap, shared: sharedState };
  let createdCount = 0;
  let skippedCount = 0;
  const debug =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true';

  if (objects.length === 0) {
    return nodeMap;
  }

  // 第一遍:创建(走 ComponentManager → handler → new 组件)
  for (const oc of objects) {
    const node = componentManager.create(oc, ctx);
    if (node) {
      createdCount++;
      nodeMap.set(oc.id, node);
      // 组件节点:把展开的子节点也注册进 nodeMap,供其他物体的 parentId 引用
      if (oc.type === 'component') {
        registerComponentChildren(node, nodeMap);
      }
    } else {
      // 解析失败(如未知 geometry/src/builder 名):打 warn 便于定位。
      skippedCount++;
      console.warn(`[objects] 无法创建物体，跳过: id=${oc.id} type=${oc.type}` +
          ` component.name=${oc.component?.name} component.type=${oc.component?.type}` +
          ` src=${oc.src ?? '-'} geometry=${oc.geometry?.type ?? '-'}`);
    }
  }

  // 第二遍:挂载父节点
  for (const oc of objects) {
    const node = nodeMap.get(oc.id);
    if (node) {
      const parent = oc.parentId ? nodeMap.get(oc.parentId) : undefined;
      (parent ?? scene).add(node);
    }
  }

  // 标记分区(__zone)/逻辑根(__logicalRoot),供 ScenePicker「整体/部件」选中模式
  markZones(objects, nodeMap);

  if (debug) {
    console.log(`[objects] 场景构建完成: 创建 ${createdCount}/${objects.length} 物体${
      skippedCount > 0 ? `，跳过 ${skippedCount} 个（见上方 warn）` : ''}`);
  }

  return nodeMap;
};

// ══════════════════════════════════════════════════════════════
// 增量:增/改/删
// ══════════════════════════════════════════════════════════════

/**
 * 按 id 增/改物体。返回本次变更的物体 name 列表(供 refreshCards 用)。
 * 两遍:第一遍补丁已有 / 创建新的,第二遍把新节点挂到父(兼容「子先于父」乱序)。
 */
export const upsertObjects = (
  scene: THREE.Scene,
  index: ObjectIndex,
  defs: LiveDataObject[],
): string[] => {
  const changedNames: string[] = [];
  const created: Array<{ node: THREE.Object3D; parentId: string | null }> = [];

  const ctx = { scene, index, shared: sharedState };
  for (const def of defs) {
    const existing = index.get(def.id);
    if (existing) {
      // 通过 ComponentManager 分派更新:handler 处理则跳过 default,否则回落 patchObject
      componentManager.update(existing, def, ctx, patchObject);
      changedNames.push(existing.name || def.id);
    } else {
      // 通过 ComponentManager 分派创建:按 kind 链 handler → new 组件
      const node = componentManager.create(def, ctx);
      if (node) {
        index.set(def.id, node);
        // 与 buildObjects 对齐:注册组件子节点 + 单节点 zone/logicalRoot 标记
        if (def.type === 'component') {
          registerComponentChildren(node, index);
        }
        markZoneSingle(def, node, index);
        created.push({ node, parentId: def.parentId ?? null });
        changedNames.push(node.name || def.id);
      }
    }
  }

  // 第二遍:挂父节点
  for (const { node, parentId } of created) {
    const parent = parentId ? index.get(parentId) : undefined;
    if (parent) {
      parent.add(node);
    } else {
      scene.add(node);
    }
  }

  return changedNames;
};

/**
 * 按 id 删除物体。返回被删物体的 name 列表(供 refreshCards 用)。
 * 只处理显式传入的 id;若删的是父节点,其子孙被 three 一并移除但不会 dispose,
 * 也不会自动清出 index——需要的话请把子孙 id 一并传入。
 */
export const removeObjects = (scene: THREE.Scene, index: ObjectIndex, ids: string[]): string[] => {
  const changedNames: string[] = [];
  const ctx = { scene, index, shared: sharedState };
  for (const id of ids) {
    const obj = index.get(id);
    if (obj) {
      changedNames.push(obj.name || id);
      // 通过 ComponentManager 分派删除:handler 处理则跳过 default,否则回落 disposeObject
      componentManager.delete(obj, ctx, disposeObject);
      obj.removeFromParent();
      index.delete(id);
    }
  }
  return changedNames;
};

// ══════════════════════════════════════════════════════════════
// 异步模型填充(占位节点由 ModelComponent 创建,此处填充内容)
// ══════════════════════════════════════════════════════════════

/**
 * 异步加载场景中所有带 src 的模型(type='glb'/'model',或 component 未命中回落 src)。
 * 在 buildObjects 同步构建场景后调用,将模型填充到占位 Group 中。
 *
 * 走 ModelLoader provider 链(asset/http/hunyuan),内置原型缓存 + clone 复用。
 * hunyuan: 前缀走单次生成缓存,失败回落 mesh 兜底 + SCENE_ERROR。
 */
export const loadModelObjects = async (
  nodeMap: Map<string, THREE.Object3D>,
  objects?: LiveDataObject[],
  onError?: (id: string, message: string) => void,
): Promise<Map<string, THREE.Object3D>> => {
  if (!objects) {
    return new Map();
  }

  const modelDefs = objects.filter((o) => o.src);
  if (modelDefs.length === 0) {
    return new Map();
  }

  const loaded = new Map<string, THREE.Object3D>();

  const tasks = modelDefs.map(async (def) => {
    const src = def.src!;
    const placeholder = nodeMap.get(def.id);
    if (!placeholder) {
      return;
    }

    try {
      const model = await loadModel(src, {
        castShadow: def.castShadow,
        receiveShadow: def.receiveShadow,
      });

      placeholder.add(model);
      delete placeholder.userData.__modelSrc;
      delete placeholder.userData.__modelId;

      // 注册子节点到 nodeMap(供 parentId 引用)
      model.traverse((child) => {
        if (child !== model && child.name) {
          child.userData.id = `${def.id}_${child.name}`;
          nodeMap.set(child.userData.id, child);
        }
      });

      loaded.set(def.id, placeholder);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[objects] 模型加载失败: ${src} (${def.id})`, msg);
      // 回落:占位 Group 内放一个 box 兜底,不阻塞其余物体
      const fallbackGeo = new THREE.BoxGeometry(1, 1, 1);
      const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
      const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
      fallback.name = `${def.id}_fallback`;
      placeholder.add(fallback);
      delete placeholder.userData.__modelSrc;
      delete placeholder.userData.__modelId;
      onError?.(def.id, `模型加载失败 ${src}: ${msg}`);
      loaded.set(def.id, placeholder);
    }
  });

  await Promise.all(tasks);
  return loaded;
};
