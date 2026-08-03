/**
 * geometry — 按 geoDef.type 创建 BufferGeometry（8 种基础几何体）
 *
 * 从原 liveDataLoader.createLiveGeometry 拆出。供 primitive 组件与 scene/objects.ts 的 patchObject 复用。
 * 契约：返回 BufferGeometry | null。text 不在此（text 在 TextComponent 单独处理，返回完整 Mesh），
 * 故 patch 路径遇 text 返回 null 跳过，行为与原实现一致。
 */
import * as THREE from 'three'
import type { LiveDataGeometry } from '../../scene/loader'

export function createGeometry(
  geoDef: LiveDataGeometry,
): THREE.BufferGeometry | null {
  const p = (geoDef.params ?? {}) as Record<string, number>

  switch (geoDef.type) {
    case 'box':
      return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1)
    case 'plane':
      return new THREE.PlaneGeometry(p.width ?? 1, p.height ?? 1)
    case 'sphere':
      return new THREE.SphereGeometry(
        p.radius ?? 1,
        p.widthSegments ?? 32,
        p.heightSegments ?? 16,
      )
    case 'cylinder':
      return new THREE.CylinderGeometry(
        p.radiusTop ?? 1,
        p.radiusBottom ?? 1,
        p.height ?? 1,
        p.radialSegments ?? 32,
      )
    case 'cone':
      return new THREE.ConeGeometry(
        p.radius ?? 1,
        p.height ?? 1,
        p.radialSegments ?? 16,
      )
    case 'torus': {
      const inner = p.innerRadius ?? 1
      const outer = p.outerRadius ?? 2
      const radius = (inner + outer) / 2
      const tube = (outer - inner) / 2
      return new THREE.TorusGeometry(
        radius,
        tube,
        p.radialSegments ?? 12,
        p.thetaSegments ?? 64,
        p.arc ?? Math.PI * 2,
      )
    }
    case 'circle':
      return new THREE.CircleGeometry(p.radius ?? 1, p.segments ?? 32)
    case 'ring':
      return new THREE.RingGeometry(
        p.innerRadius ?? 0.5,
        p.outerRadius ?? 1,
        p.thetaSegments ?? 64,
        p.phiSegments ?? 1,
      )
    default:
      console.warn(`[geometry] 未知几何体类型: ${geoDef.type}`)
      return null
  }
}
