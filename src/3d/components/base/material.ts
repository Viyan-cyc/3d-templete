/**
 * material — 材质工厂（带 AssetPool 缓存）
 *
 * 从 liveDataLoader 迁入。供 primitive / builder / text 等组件与 sceneUpdate.patchObject 复用。
 * 内部 switch（standard/phong/basic/physical）保持不拆——材质是多类组件复用的通用逻辑。
 */
import * as THREE from 'three'
import type { LiveDataMaterial } from '../../scene/loader'
import { assetPool } from './assets'

/** 根据材质参数生成缓存 key */
function materialKey(matDef: LiveDataMaterial): string {
  const parts = [matDef.type, matDef.color ?? '#fff', String(matDef.roughness ?? ''), String(matDef.metalness ?? '')]
  if (matDef.transmission !== undefined) parts.push(`tm:${matDef.transmission}`)
  if (matDef.clearcoat !== undefined) parts.push(`cc:${matDef.clearcoat}`)
  if (matDef.ior !== undefined) parts.push(`ior:${matDef.ior}`)
  if (matDef.transparent) parts.push('tr')
  if (matDef.opacity !== undefined) parts.push(`op:${matDef.opacity}`)
  return parts.join('|')
}

export function createLiveMaterial(
  matDef?: LiveDataMaterial,
): THREE.Material {
  if (!matDef) return new THREE.MeshNormalMaterial()

  // 缓存：相同参数共享同一个 Material 实例
  const key = materialKey(matDef)
  return assetPool.getMaterial(key, () => createLiveMaterialInner(matDef))
}

/** 实际创建材质（仅缓存未命中时调用） */
function createLiveMaterialInner(matDef: LiveDataMaterial): THREE.Material {
  const type = matDef.type
  let mat: THREE.Material

  switch (type) {
    case 'standard':
      mat = new THREE.MeshStandardMaterial({
        color: matDef.color ?? '#ffffff',
        roughness: matDef.roughness ?? 0.5,
        metalness: matDef.metalness ?? 0,
      })
      break
    case 'phong':
      mat = new THREE.MeshPhongMaterial({
        color: matDef.color ?? '#ffffff',
      })
      break
    case 'basic':
      mat = new THREE.MeshBasicMaterial({
        color: matDef.color ?? '#ffffff',
      })
      break
    case 'physical': {
      mat = new THREE.MeshPhysicalMaterial({
        color: matDef.color ?? '#ffffff',
        roughness: matDef.roughness ?? 0.5,
        metalness: matDef.metalness ?? 0,
      })
      const pm = mat as THREE.MeshPhysicalMaterial
      if (matDef.transmission !== undefined) pm.transmission = matDef.transmission
      if (matDef.thickness !== undefined) pm.thickness = matDef.thickness
      if (matDef.ior !== undefined) pm.ior = matDef.ior
      if (matDef.clearcoat !== undefined) pm.clearcoat = matDef.clearcoat
      if (matDef.clearcoatRoughness !== undefined) pm.clearcoatRoughness = matDef.clearcoatRoughness
      if (matDef.sheen !== undefined) pm.sheen = matDef.sheen
      if (matDef.sheenColor !== undefined) pm.sheenColor = new THREE.Color(matDef.sheenColor)
      break
    }
    default:
      return new THREE.MeshNormalMaterial()
  }

  if (matDef.transparent) {
    mat.transparent = true
    if (matDef.opacity !== undefined) mat.opacity = matDef.opacity
  }

  return mat
}
