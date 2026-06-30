import { OrbitControls as _OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Camera } from 'three'

/**
 * 创建并配置轨道控制器
 */
export function createOrbitControls(
  camera: Camera,
  domElement: HTMLElement,
  options?: {
    enableDamping?: boolean
    dampingFactor?: number
    minDistance?: number
    maxDistance?: number
    maxPolarAngle?: number
    target?: { x: number; y: number; z: number }
  },
): _OrbitControls {
  const controls = new _OrbitControls(camera, domElement)

  controls.enableDamping = options?.enableDamping ?? true
  controls.dampingFactor = options?.dampingFactor ?? 0.08
  controls.minDistance = options?.minDistance ?? 2
  controls.maxDistance = options?.maxDistance ?? 50
  controls.maxPolarAngle = options?.maxPolarAngle ?? Math.PI / 2.1 // 防止穿到地下

  if (options?.target) {
    controls.target.set(options.target.x, options.target.y, options.target.z)
  }

  return controls
}
