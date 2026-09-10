/**
 * ============================================================
 *  RenderLoop — RAF 渲染循环 + resize + 回调表 + Debug HUD
 *
 *  从 App3D 抽出：RAF 循环（update 回调 → render → HUD → postRender 回调）、
 *  resize 双监听（ResizeObserver iframe 可靠 + window resize 兜底）、
 *  DebugOverlay 生命周期与每帧刷新。resize 扇出到 RendererManager/CameraManager。
 * ============================================================
 */
import { DebugOverlay } from '../../debug';
import type { CameraManager } from './CameraManager';
import type { RendererManager } from './RendererManager';
import type { SceneManager } from './SceneManager';

export class RenderLoop {
  private readonly canvas: HTMLCanvasElement;
  private readonly rendererManager: RendererManager;
  private readonly cameraManager: CameraManager;
  private readonly sceneManager: SceneManager;

  private _animationId: number = 0;
  private _isRunning: boolean = false;
  private _resizeHandler: (() => void) | null = null;

  /** ResizeObserver 监听 canvas 尺寸变化（比 window resize 可靠：iframe 嵌入时宿主改 iframe 尺寸也能触发） */
  private _resizeObserver: ResizeObserver | null = null;

  private _updateCallbacks: Array<() => void> = [];
  private _postRenderCallbacks: Array<() => void> = [];

  private _debug: boolean = false;
  private _debugOverlay: DebugOverlay | null = null;

  /** 上一帧时间戳（HUD 帧间隔计算用） */
  private _lastFrameTime: number = 0;

  constructor(params: {
    canvas: HTMLCanvasElement;
    rendererManager: RendererManager;
    sceneManager: SceneManager;
    cameraManager: CameraManager;
    debug?: boolean;
  }) {
    this.canvas = params.canvas;
    this.rendererManager = params.rendererManager;
    this.sceneManager = params.sceneManager;
    this.cameraManager = params.cameraManager;
    this._debug = params.debug ?? false;
    this._lastFrameTime = performance.now();
    if (this._debug) {
      this._debugOverlay = new DebugOverlay();
    }
  }

  /** 启动渲染循环 */
  start(): void {
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;

    this._resizeHandler = this._onResize.bind(this);
    // 用 ResizeObserver 监听 canvas 尺寸变化（比 window resize 可靠）：
    // iframe 嵌入时宿主改 iframe CSS 尺寸 → canvas 跟着变 → 直接触发，无需 window.resize 事件。
    this._resizeObserver = new ResizeObserver(this._resizeHandler);
    this._resizeObserver.observe(this.canvas);
    // 兜底：window resize 也监听（独立窗口缩放场景）
    window.addEventListener('resize', this._resizeHandler);
    this._onResize();

    this._animate();
  }

  /** 停止渲染循环 */
  stop(): void {
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
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  }

  /** 释放 HUD（RAF/resize 由 stop 负责；App3D dispose 序 stop → overlay → renderer → scene） */
  dispose(): void {
    this.stop();
    this._debugOverlay?.dispose();
    this._debugOverlay = null;
  }

  /** 注册每帧更新回调 */
  addUpdateCallback(fn: () => void): void {
    this._updateCallbacks.push(fn);
  }

  /** 注册后渲染回调（WebGLRenderer.render 之后；CSS2DRenderer 等覆盖层用） */
  addPostRenderCallback(fn: () => void): void {
    this._postRenderCallbacks.push(fn);
  }

  /** 设置调试模式（运行时切换；HUD 生命周期在此管理） */
  setDebug(mode: boolean): void {
    this._debug = mode;
    if (mode) {
      if (this._debugOverlay) {
        this._debugOverlay.show();
      } else {
        this._debugOverlay = new DebugOverlay();
      }
    } else {
      this._debugOverlay?.hide();
    }
  }

  get debug(): boolean {
    return this._debug;
  }

  private _animate(): void {
    if (!this._isRunning) {
      return;
    }
    this._animationId = requestAnimationFrame(() => this._animate());

    for (const fn of this._updateCallbacks) {
      fn();
    }

    this.rendererManager.renderer.render(this.sceneManager.scene, this.cameraManager.camera);

    // Debug: 更新 HUD 面板
    if (this._debug && this._debugOverlay) {
      const now = performance.now();
      const deltaMs = now - this._lastFrameTime;
      this._lastFrameTime = now;
      this._debugOverlay.update(this.rendererManager.info, deltaMs);
    }

    for (const fn of this._postRenderCallbacks) {
      fn();
    }
  }

  private _onResize(): void {
    // 用 offsetWidth/offsetHeight（含 border，比 clientWidth 更贴合实际布局尺寸，对齐 three.js 官方 onWindowResize 习惯）
    const width = this.canvas.offsetWidth;
    const height = this.canvas.offsetHeight;
    if (width === 0 || height === 0) {
      return;
    }

    // updateStyle=false：保持 canvas CSS 100% 跟随父容器，只更新绘图缓冲分辨率
    this.rendererManager.resize(width, height);
    this.cameraManager.resize(width, height);
  }
}
