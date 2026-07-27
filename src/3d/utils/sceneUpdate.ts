/**
 * ============================================================
 *  sceneUpdate — 物体级增量更新
 *
 *  按 id 对场景做增/删/改：
 *  - upsert：id 已存在就**就地补丁**（transform / material / geometry），
 *    保留 Object3D 身份，移动/换色不重建、不闪烁；id 不存在才创建并挂父节点。
 *  - remove：按 id 脱离父节点 + dispose 几何/材质 + 移出索引。
 *  - refreshCards 已迁至 CardManager.refreshCards() 实例方法。
 *
 *  几何/材质/变换工厂复用自 liveDataLoader，保证增量与初始化逻辑一致。
 * ============================================================
 */

import * as THREE from 'three'
import type { LiveDataObject } from './liveDataLoader'
import {
  applyTransform,
  createLiveGeometry,
  createLiveMaterial,
  createLiveObject3D,
} from './liveDataLoader'
import { componentManager } from '../managers/component/ComponentManager'
import { sharedState } from '../managers/component/handlers/shared'

export type ObjectIndex = Map<string, THREE.Object3D>

/**
 * 按 id 增/改物体。返回本次变更的物体 name 列表（供 refreshCards 用）。
 *
 * 两遍处理：第一遍补丁已有 / 创建新的（新节点暂存），第二遍把新节点挂到父
 * （父可能是本批刚创建的），兼容「子先于父」的乱序。
 */
export function upsertObjects(
  scene: THREE.Scene,
  index: ObjectIndex,
  defs: LiveDataObject[],
): string[] {
  const changedNames: string[] = []
  const created: Array<{ node: THREE.Object3D; parentId: string | null }> = []

  // 第一遍：补丁已有 / 创建新的
  const ctx = { scene, index, shared: sharedState }
  for (const def of defs) {
    const existing = index.get(def.id)
    if (existing) {
      // 通过 ComponentManager 分派更新：handler 处理则跳过 default，否则回落 patchObject
      componentManager.update(existing, def, ctx, patchObject)
      changedNames.push(existing.name || def.id)
      continue
    }
    // 通过 ComponentManager 分派创建：handler 处理则跳过 default，否则回落 createLiveObject3D
    const node = componentManager.create(def, ctx, createLiveObject3D)
    if (!node) continue
    index.set(def.id, node)
    created.push({ node, parentId: def.parentId ?? null })
    changedNames.push(node.name || def.id)
  }

  // 第二遍：挂父节点
  for (const { node, parentId } of created) {
    const parent = parentId ? index.get(parentId) : undefined
    if (parent) parent.add(node)
    else scene.add(node)
  }

  return changedNames
}

/**
 * 按 id 删除物体。返回被删物体的 name 列表（供 refreshCards 用）。
 * 注意：只处理显式传入的 id；若删的是父节点，其子孙会被 three 一并移除
 * 但不会 dispose，也不会自动清出 index——需要的话请把子孙 id 一并传入。
 */
export function removeObjects(scene: THREE.Scene, index: ObjectIndex, ids: string[]): string[] {
  const changedNames: string[] = []
  const ctx = { scene, index, shared: sharedState }
  for (const id of ids) {
    const obj = index.get(id)
    if (!obj) continue
    changedNames.push(obj.name || id)
    // 通过 ComponentManager 分派删除：handler 处理则跳过 default，否则回落 disposeObject
    componentManager.delete(obj, ctx, disposeObject)
    obj.removeFromParent()
    index.delete(id)
  }
  return changedNames
}

// ---- 内部 ----

/** 就地补丁：transform 总是应用；mesh 额外按需重建 material/geometry */
function patchObject(obj: THREE.Object3D, def: LiveDataObject): void {
  applyTransform(obj, def)

  if ((obj as THREE.Mesh).isMesh) {
    const mesh = obj as THREE.Mesh
    if (def.material) {
      const old = mesh.material
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else old?.dispose()
      mesh.material = createLiveMaterial(def.material)
    }
    if (def.geometry) {
      const geo = createLiveGeometry(def.geometry)
      if (geo) {
        mesh.geometry?.dispose()
        mesh.geometry = geo
      }
    }
  }

  if (def.castShadow !== undefined) obj.castShadow = def.castShadow
  if (def.receiveShadow !== undefined) obj.receiveShadow = def.receiveShadow
}

/** dispose 一个 Object3D 及其子孙的几何/材质 */
function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose()
  })
}
