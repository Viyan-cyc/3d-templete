import {
  applyTransform,
  createLiveGeometry,
  createLiveMaterial,
  createLiveObject3D
} from "./liveDataLoader";
import { componentManager } from "../managers/component/ComponentManager";
import { sharedState } from "../managers/component/handlers/shared";
function upsertObjects(scene, index, defs) {
  const changedNames = [];
  const created = [];
  const ctx = { scene, index, shared: sharedState };
  for (const def of defs) {
    const existing = index.get(def.id);
    if (existing) {
      componentManager.update(existing, def, ctx, patchObject);
      changedNames.push(existing.name || def.id);
      continue;
    }
    const node = componentManager.create(def, ctx, createLiveObject3D);
    if (!node) continue;
    index.set(def.id, node);
    created.push({ node, parentId: def.parentId ?? null });
    changedNames.push(node.name || def.id);
  }
  for (const { node, parentId } of created) {
    const parent = parentId ? index.get(parentId) : void 0;
    if (parent) parent.add(node);
    else scene.add(node);
  }
  return changedNames;
}
function removeObjects(scene, index, ids) {
  const changedNames = [];
  const ctx = { scene, index, shared: sharedState };
  for (const id of ids) {
    const obj = index.get(id);
    if (!obj) continue;
    changedNames.push(obj.name || id);
    componentManager.delete(obj, ctx, disposeObject);
    obj.removeFromParent();
    index.delete(id);
  }
  return changedNames;
}
function patchObject(obj, def) {
  applyTransform(obj, def);
  if (obj.isMesh) {
    const mesh = obj;
    if (def.material) {
      const old = mesh.material;
      if (Array.isArray(old)) old.forEach((m) => m.dispose());
      else old?.dispose();
      mesh.material = createLiveMaterial(def.material);
    }
    if (def.geometry) {
      const geo = createLiveGeometry(def.geometry);
      if (geo) {
        mesh.geometry?.dispose();
        mesh.geometry = geo;
      }
    }
  }
  if (def.castShadow !== void 0) obj.castShadow = def.castShadow;
  if (def.receiveShadow !== void 0) obj.receiveShadow = def.receiveShadow;
}
function disposeObject(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    const mesh = child;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
export {
  removeObjects,
  upsertObjects
};
