import * as THREE from "three";
import { DebugOverlay } from "./debug";
class App3D {
  renderer;
  scene;
  /**
   * 当前相机。初始为透视相机；live-data 路径可能通过 setCamera() 替换为正交相机。
   * 外部请通过 setCamera() 替换，不要直接赋值。
   */
  camera;
  _canvas;
  _animationId = 0;
  _isRunning = false;
  _resizeHandler = null;
  /** ResizeObserver 监听 canvas 尺寸变化（比 window resize 可靠：iframe 嵌入时宿主改 iframe 尺寸也能触发） */
  _resizeObserver = null;
  _startTime = 0;
  _prevTime = 0;
  _updateCallbacks = [];
  _postRenderCallbacks = [];
  /** 正交相机 resize 时的基准半高（max(|top|,|bottom|)），仅正交相机下使用 */
  _orthoHalfH = null;
  /** 调试模式开关 */
  _debug = false;
  /** 调试 HUD 面板 */
  _debugOverlay = null;
  /** 上一帧时间戳（用于计算 delta） */
  _lastFrameTime = 0;
  constructor(options) {
    const { canvas, config = {}, enableShadows = true, antialias = true, debug = false } = options;
    this._canvas = canvas;
    this._debug = debug;
    this._startTime = performance.now();
    this._prevTime = this._startTime;
    this._lastFrameTime = this._startTime;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = config.toneMappingExposure ?? 1;
    this.scene = new THREE.Scene();
    if (config.backgroundColor) {
      this.scene.background = new THREE.Color(config.backgroundColor);
    }
    if (config.fogColor) {
      this.scene.fog = new THREE.Fog(
        config.fogColor,
        config.fogNear ?? 10,
        config.fogFar ?? 100
      );
    }
    this.camera = new THREE.PerspectiveCamera(
      config.cameraFov ?? 60,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.1,
      1e3
    );
    if (config.cameraPosition) {
      this.camera.position.set(...config.cameraPosition);
    } else {
      this.camera.position.set(8, 6, 12);
    }
    if (config.cameraTarget) {
      this.camera.lookAt(...config.cameraTarget);
    } else {
      this.camera.lookAt(0, 0, 0);
    }
    if (debug) {
      this._debugOverlay = new DebugOverlay();
    }
  }
  /** 启动渲染循环 */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._resizeHandler = this._onResize.bind(this);
    this._resizeObserver = new ResizeObserver(this._resizeHandler);
    this._resizeObserver.observe(this._canvas);
    window.addEventListener("resize", this._resizeHandler);
    this._onResize();
    this._animate();
  }
  /** 停止渲染循环 */
  stop() {
    this._isRunning = false;
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = 0;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
  }
  /** 销毁，释放 GPU 资源 */
  dispose() {
    this.stop();
    this._debugOverlay?.dispose();
    this._debugOverlay = null;
    this.renderer.dispose();
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  }
  /** 获取画布 DOM */
  get canvas() {
    return this._canvas;
  }
  /** 获取当前帧的 delta（秒） */
  get delta() {
    const now = performance.now();
    const dt = (now - this._prevTime) / 1e3;
    this._prevTime = now;
    return Math.min(dt, 0.1);
  }
  /** 获取已运行时间（秒） */
  get elapsed() {
    return (performance.now() - this._startTime) / 1e3;
  }
  /** 注册每帧更新回调 */
  addUpdateCallback(fn) {
    this._updateCallbacks.push(fn);
  }
  /** 移除更新回调 */
  removeUpdateCallback(fn) {
    const idx = this._updateCallbacks.indexOf(fn);
    if (idx !== -1) this._updateCallbacks.splice(idx, 1);
  }
  /**
   * 注册后渲染回调（在 WebGLRenderer.render 之后执行）
   * 用于 CSS2DRenderer 等需要覆盖在 3D 之上的渲染
   */
  addPostRenderCallback(fn) {
    this._postRenderCallbacks.push(fn);
  }
  /** 移除后渲染回调 */
  removePostRenderCallback(fn) {
    const idx = this._postRenderCallbacks.indexOf(fn);
    if (idx !== -1) this._postRenderCallbacks.splice(idx, 1);
  }
  /**
   * 替换当前相机（如 live-data 把透视相机换成正交相机）。
   * 内部记录正交相机的基准半高，供 resize 时按 aspect 重算 left/right。
   */
  setCamera(cam) {
    this.camera = cam;
    if (cam instanceof THREE.OrthographicCamera) {
      this._orthoHalfH = Math.max(Math.abs(cam.top), Math.abs(cam.bottom));
    } else {
      this._orthoHalfH = null;
    }
  }
  /** 设置调试模式（运行时切换） */
  setDebug(mode) {
    this._debug = mode;
    if (mode) {
      if (!this._debugOverlay) {
        this._debugOverlay = new DebugOverlay();
      } else {
        this._debugOverlay.show();
      }
    } else {
      this._debugOverlay?.hide();
    }
  }
  /** 获取当前调试模式 */
  get debug() {
    return this._debug;
  }
  _animate() {
    if (!this._isRunning) return;
    this._animationId = requestAnimationFrame(() => this._animate());
    for (const fn of this._updateCallbacks) {
      fn();
    }
    this.renderer.render(this.scene, this.camera);
    if (this._debug && this._debugOverlay) {
      const now = performance.now();
      const deltaMs = now - this._lastFrameTime;
      this._lastFrameTime = now;
      this._debugOverlay.update(this.renderer.info, deltaMs);
    }
    for (const fn of this._postRenderCallbacks) {
      fn();
    }
  }
  _onResize() {
    const width = this._canvas.offsetWidth;
    const height = this._canvas.offsetHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    const cam = this.camera;
    const aspect = width / Math.max(height, 1);
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    } else if (cam instanceof THREE.OrthographicCamera && this._orthoHalfH != null) {
      const halfW = this._orthoHalfH * aspect;
      cam.left = -halfW;
      cam.right = halfW;
      cam.updateProjectionMatrix();
    }
  }
}
export {
  App3D
};
