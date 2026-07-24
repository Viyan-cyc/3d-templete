/**
 * ============================================================
 *  sceneUpdate — 物体级增量更新
 *
 *  按 id 对场景做增/删/改：
 *  - upsert：id 已存在就**就地补丁**（transform / material / geometry），
 *    保留 Object3D 身份，移动/换色不重建、不闪烁；id 不存在才创建并挂父节点。
 *  - remove：按 id 脱离父节点 + dispose 几何/材质 + 移出索引。
 *  - refreshCards：物体增删后，重建受影响的卡片分组（目标/props 按当前场景重算）。
 *
 *  几何/材质/变换工厂复用自 liveDataLoader，保证增量与初始化逻辑一致。
 * ============================================================
 */

import * as THREE from 'three'
import type { CardManager } from '../managers/card/CardManager'
import type { LiveDataObject } from './liveDataLoader'
import {
  applyTransform,
  createLiveGeometry,
  createLiveMaterial,
  createLiveObject3D,
} from './liveDataLoader'
import { componentManager } from '../managers/component/ComponentManager'
import { sharedState } from '../managers/component/handlers/shared'
import { scanAndRegisterCards, type CardScanRule } from './sceneCards'

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

/**
 * 物体增删后同步卡片：用各 rule.pattern 在变更 name 上取捕获组 [1] 得到受影响
 * 的卡片分组 id，先 removeCard 再重跑 scanAndRegisterCards（幂等：未受影响的
 * 卡片 addCard 会跳过），让受影响分组按当前场景重建目标与 props。
 */
export function refreshCards(
  scene: THREE.Scene,
  cardManager: CardManager,
  rules: CardScanRule[],
  changedNames: string[],
): void {
  if (rules.length === 0 || changedNames.length === 0) return

  const affected = new Set<string>()
  for (const name of changedNames) {
    for (const rule of rules) {
      const m = name.match(rule.pattern)
      if (m) affected.add(m[1] ?? name)
    }
  }
  affected.forEach((id) => cardManager.removeCard(id))

  scanAndRegisterCards(scene, cardManager, rules)
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
