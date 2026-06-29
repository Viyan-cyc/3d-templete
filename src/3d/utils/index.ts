import * as THREE from 'three'

/**
 * 递归设置对象及其子对象的阴影属性
 */
export function setShadowRecursive(
  object: THREE.Object3D,
  cast: boolean = true,
  receive: boolean = true,
): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = cast
      child.receiveShadow = receive
    }
  })
}

/**
 * 将 Hex 颜色字符串解析为 THREE.Color
 */
export function parseColor(hex: string): THREE.Color {
  return new THREE.Color(hex)
}

/**
 * 计算当前帧率
 */
export class FPSCounter {
  private _frames: number = 0
  private _prevTime: number = performance.now()
  private _fps: number = 60

  update(): number {
    this._frames++
    const now = performance.now()
    if (now >= this._prevTime + 1000) {
      this._fps = Math.round((this._frames * 1000) / (now - this._prevTime))
      this._frames = 0
      this._prevTime = now
    }
    return this._fps
  }

  get fps(): number {
    return this._fps
  }
}
