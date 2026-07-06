import * as THREE from 'three'
import { ComponentRegistry } from '../ComponentRegistry'
import type { AssetPool } from '../AssetPool'

/**
 * Rack 货架组件 —— 程序化生成多层置物架。
 * 与 UXAI scene-protocol 的 rack 组件保持一致。
 */
export interface RackParams {
  levels?: number
  width?: number
  height?: number
  depth?: number
}

/** 注册 rack 组件到 ComponentRegistry */
export function registerRack(registry: typeof ComponentRegistry): void {
  registry.registerBuilder('rack', buildRack)
}

function buildRack(
  params: Record<string, number | string>,
  material: THREE.Material,
  pool: AssetPool,
): THREE.Group {
  const levels = Math.max(2, Math.min(20, Math.floor(Number(params.levels) || 4)))
  const width = Number(params.width) > 0 ? Number(params.width) : 2
  const height = Number(params.height) > 0 ? Number(params.height) : 2
  const depth = Number(params.depth) > 0 ? Number(params.depth) : 0.6

  const postSize = 0.08
  const shelfThick = 0.04
  const halfW = width / 2 - postSize / 2
  const halfD = depth / 2 - postSize / 2

  const group = new THREE.Group()

  const postGeo = pool.getGeometry(
    `rack:post:${postSize},${height},${postSize}`,
    () => new THREE.BoxGeometry(postSize, height, postSize),
  )

  const corners: Array<[string, number, number]> = [
    ['postBL', -halfW, -halfD],
    ['postBR', halfW, -halfD],
    ['postTL', -halfW, halfD],
    ['postTR', halfW, halfD],
  ]
  for (const [name, cx, cz] of corners) {
    const post = new THREE.Mesh(postGeo, material)
    post.name = name
    post.position.set(cx, height / 2, cz)
    post.castShadow = true
    post.receiveShadow = true
    group.add(post)
  }

  const shelfGeo = pool.getGeometry(
    `rack:shelf:${width},${shelfThick},${depth}`,
    () => new THREE.BoxGeometry(width, shelfThick, depth),
  )

  for (let i = 0; i < levels; i++) {
    const y = levels > 1 ? (i / (levels - 1)) * height : 0
    const shelf = new THREE.Mesh(shelfGeo, material)
    shelf.name = `shelf${i}`
    shelf.position.set(0, y, 0)
    shelf.castShadow = true
    shelf.receiveShadow = true
    group.add(shelf)
  }

  return group
}
