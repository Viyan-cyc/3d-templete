/**
 * transform — Object3D 变换 / 阴影 / 三元组解析工具（组件层共享）
 *
 * 从原 liveDataLoader 拆出。组件构造时用 applyTransform / applyShadow 应用 data 里的
 * position/rotation/scale/阴影；patchObject 也复用。
 */
import * as THREE from 'three'

const DEG2RAD = Math.PI / 180

/** 给 Object3D 应用 position / rotation / scale */
export function applyTransform(
  obj: THREE.Object3D,
  cfg: { position?: number[]; rotation?: number[]; scale?: number[] },
): void {
  const pos = parseVec3(cfg.position)
  if (pos) obj.position.set(...pos)
  const rot = parseVec3(cfg.rotation, true)
  if (rot) obj.rotation.set(...rot)
  const scl = parseVec3(cfg.scale)
  if (scl) obj.scale.set(...scl)
}

/** 给 Object3D 应用 castShadow / receiveShadow（仅当显式传值时） */
export function applyShadow(
  obj: THREE.Object3D,
  cfg: { castShadow?: boolean; receiveShadow?: boolean },
): void {
  if (cfg.castShadow !== undefined) obj.castShadow = cfg.castShadow
  if (cfg.receiveShadow !== undefined) obj.receiveShadow = cfg.receiveShadow
}

/** 解析三元组数组，toRadians 开启时角度→弧度 */
export function parseVec3(
  value: unknown,
  toRadians = false,
): [number, number, number] | null {
  let arr: number[] | null = null

  if (Array.isArray(value) && value.length >= 3) {
    arr = value.slice(0, 3).map(Number)
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.length >= 3) {
        arr = parsed.slice(0, 3).map(Number)
      }
    } catch {
      return null
    }
  }

  if (!arr) return null
  return toRadians
    ? [arr[0] * DEG2RAD, arr[1] * DEG2RAD, arr[2] * DEG2RAD]
    : [arr[0], arr[1], arr[2]]
}
