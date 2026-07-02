import * as THREE from 'three'
import type { SceneConfig } from './types'

export interface App3DOptions {
  canvas: HTMLCanvasElement
  config?: SceneConfig
  enableShadows?: boolean
  antialias?: boolean
}

/**
 * 3D 应用核心类
 * 管理 Renderer / Scene / Camera 及渲染循环
 */
export class App3D {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  /**
   * 当前相机。初始为透视相机；live-data 路径可能通过 setCamera() 替换为正交相机。
   * 外部请通过 setCamera() 替换，不要直接赋值。
   */
  camera: THREE.Camera

  private _canvas: HTMLCanvasElement
  private _animationId: number = 0
  private _isRunning: boolean = false
  private _resizeHandler: (() => void) | null = null
  private _startTime: number = 0
  private _prevTime: number = 0
  private _updateCallbacks: Array<() => void> = []
  private _postRenderCallbacks: Array<() => void> = []
  /** 正交相机 resize 时的基准半高（max(|top|,|bottom|)），仅正交相机下使用 */
  private _orthoHalfH: number | null = null

  constructor(options: App3DOptions) {
    const { canvas, config = {}, enableShadows = true, antialias = true } = options

    this._canvas = canvas
    this._startTime = performance.now()
    this._prevTime = this._startTime

    // ---- Renderer ----
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.shadowMap.enabled = enableShadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = config.toneMappingExposure ?? 1.0

    // ---- Scene ----
    this.scene = new THREE.Scene()
    if (config.backgroundColor) {
      this.scene.background = new THREE.Color(config.backgroundColor)
    }
    if (config.fogColor) {
      this.scene.fog = new THREE.Fog(
        config.fogColor,
        config.fogNear ?? 10,
        config.fogFar ?? 100,
      )
    }

    // ---- Camera ----
    this.camera = new THREE.PerspectiveCamera(
      config.cameraFov ?? 60,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.1,
      1000,
    )
    if (config.cameraPosition) {
      this.camera.position.set(...config.cameraPosition)
    } else {
      this.camera.position.set(8, 6, 12)
    }
    if (config.cameraTarget) {
      this.camera.lookAt(...config.cameraTarget)
    } else {
      this.camera.lookAt(0, 0, 0)
    }
  }

  /** 启动渲染循环 */
  start(): void {
    if (this._isRunning) return
    this._isRunning = true

    this._resizeHandler = this._onResize.bind(this)
    window.addEventListener('resize', this._resizeHandler)

    this._animate()
  }

  /** 停止渲染循环 */
  stop(): void {
    this._isRunning = false
    if (this._animationId) {
      cancelAnimationFrame(this._animationId)
      this._animationId = 0
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler)
      this._resizeHandler = null
    }
  }

  /** 销毁，释放 GPU 资源 */
  dispose(): void {
    this.stop()
    this.renderer.dispose()
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material?.dispose()
        }
      }
    })
  }

  /** 获取画布 DOM */
  get canvas(): HTMLCanvasElement {
    return this._canvas
  }

  /** 获取当前帧的 delta（秒） */
  get delta(): number {
    const now = performance.now()
    const dt = (now - this._prevTime) / 1000
    this._prevTime = now
    return Math.min(dt, 0.1)
  }

  /** 获取已运行时间（秒） */
  get elapsed(): number {
    return (performance.now() - this._startTime) / 1000
  }

  /** 注册每帧更新回调 */
  addUpdateCallback(fn: () => void): void {
    this._updateCallbacks.push(fn)
  }

  /** 移除更新回调 */
  removeUpdateCallback(fn: () => void): void {
    const idx = this._updateCallbacks.indexOf(fn)
    if (idx !== -1) this._updateCallbacks.splice(idx, 1)
  }

  /**
   * 注册后渲染回调（在 WebGLRenderer.render 之后执行）
   * 用于 CSS2DRenderer 等需要覆盖在 3D 之上的渲染
   */
  addPostRenderCallback(fn: () => void): void {
    this._postRenderCallbacks.push(fn)
  }

  /** 移除后渲染回调 */
  removePostRenderCallback(fn: () => void): void {
    const idx = this._postRenderCallbacks.indexOf(fn)
    if (idx !== -1) this._postRenderCallbacks.splice(idx, 1)
  }

  /**
   * 替换当前相机（如 live-data 把透视相机换成正交相机）。
   * 内部记录正交相机的基准半高，供 resize 时按 aspect 重算 left/right。
   */
  setCamera(cam: THREE.Camera): void {
    this.camera = cam
    if (cam instanceof THREE.OrthographicCamera) {
      this._orthoHalfH = Math.max(Math.abs(cam.top), Math.abs(cam.bottom))
    } else {
      this._orthoHalfH = null
    }
  }

  private _animate(): void {
    if (!this._isRunning) return
    this._animationId = requestAnimationFrame(() => this._animate())

    for (const fn of this._updateCallbacks) {
      fn()
    }

    this.renderer.render(this.scene, this.camera)

    for (const fn of this._postRenderCallbacks) {
      fn()
    }
  }

  private _onResize(): void {
    const width = this._canvas.clientWidth
    const height = this._canvas.clientHeight
    if (width === 0 || height === 0) return

    this.renderer.setSize(width, height)

    const cam = this.camera
    const aspect = width / Math.max(height, 1)
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.aspect = aspect
      cam.updateProjectionMatrix()
    } else if (cam instanceof THREE.OrthographicCamera && this._orthoHalfH != null) {
      // 保持垂直范围不变，按新 aspect 重算水平范围
      const halfW = this._orthoHalfH * aspect
      cam.left = -halfW
      cam.right = halfW
      cam.updateProjectionMatrix()
    }
  }
}
