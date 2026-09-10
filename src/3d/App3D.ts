import type * as THREE from 'three';
import { CameraManager } from './managers/app/CameraManager';
import { EnvironmentManager } from './managers/app/EnvironmentManager';
import { LightManager } from './managers/app/LightManager';
import { RenderLoop } from './managers/app/RenderLoop';
import { RendererManager } from './managers/app/RendererManager';
import { SceneManager } from './managers/app/SceneManager';

/**
 * App3D 场景配置（独立于 live-data；createScene3D 走 live-data 路径时不传 config，
 * 供直接使用 App3D 的场景使用）。
 */
export interface SceneConfig {

  /** 背景色 (hex) */
  backgroundColor?: string

  /** 雾色 (hex) */
  fogColor?: string

  /** 雾近平面 */
  fogNear?: number

  /** 雾远平面 */
  fogFar?: number

  /** 相机初始位置 */
  cameraPosition?: [number, number, number]

  /** 相机注视点 */
  cameraTarget?: [number, number, number]

  /** 相机 FOV */
  cameraFov?: number

  /** 是否开启阴影 */
  enableShadows?: boolean

  /** HDR 环境贴图路径 */
  envMap?: string

  /** 色调映射曝光度 */
  toneMappingExposure?: number
}

export interface App3DOptions {
  canvas: HTMLCanvasElement
  config?: SceneConfig
  enableShadows?: boolean
  antialias?: boolean

  /** 调试模式：true 显示 HUD 面板（calls、triangles、FPS 等）；false 关闭 */
  debug?: boolean
}

/**
 * 3D 应用组合根：构建 6 个 app 级 Manager（renderer/scene/camera/light/environment/renderLoop），
 * 自身只保留 facade——所有消费方（createScene3D/environment.ts/Embed.vue）经此访问，
 * Manager 拆分对它们零改动。
 */
export class App3D {
  readonly rendererManager: RendererManager;
  readonly sceneManager: SceneManager;
  readonly cameraManager: CameraManager;
  readonly lightManager: LightManager;
  readonly environmentManager: EnvironmentManager;
  readonly renderLoop: RenderLoop;

  constructor(options: App3DOptions) {
    const {
      canvas, config = {}, enableShadows = true, antialias = true, debug = false,
    } = options;

    this.rendererManager = new RendererManager({
      canvas,
      antialias,
      enableShadows,
      toneMappingExposure: config.toneMappingExposure,
    });
    this.sceneManager = new SceneManager(config);
    this.cameraManager = new CameraManager({ canvas, config });
    this.lightManager = new LightManager(this.sceneManager.scene);
    this.environmentManager = new EnvironmentManager({
      renderer: this.rendererManager.renderer,
      scene: this.sceneManager.scene,
    });
    this.renderLoop = new RenderLoop({
      canvas,
      rendererManager: this.rendererManager,
      sceneManager: this.sceneManager,
      cameraManager: this.cameraManager,
      debug,
    });
  }

  /** 启动渲染循环 */
  start(): void {
    this.renderLoop.start();
  }

  /** 停止渲染循环 */
  stop(): void {
    this.renderLoop.stop();
  }

  /** 销毁，释放 GPU 资源（顺序：RAF/HUD → renderer → scene traverse dispose） */
  dispose(): void {
    this.renderLoop.dispose();
    this.rendererManager.dispose();
    this.sceneManager.dispose();
  }

  // ── facade getter：消费方继续经 app.renderer/scene/camera/canvas 访问 ──

  get renderer(): THREE.WebGLRenderer {
    return this.rendererManager.renderer;
  }

  get scene(): THREE.Scene {
    return this.sceneManager.scene;
  }

  /**
   * 当前相机。初始为透视相机；live-data 路径可能通过 setCamera() 替换为正交相机。
   * 外部请通过 setCamera() 替换，不要直接赋值。
   */
  get camera(): THREE.Camera {
    return this.cameraManager.camera;
  }

  /** 获取画布 DOM */
  get canvas(): HTMLCanvasElement {
    return this.renderLoop.canvas;
  }

  /** 获取当前调试模式 */
  get debug(): boolean {
    return this.renderLoop.debug;
  }

  // ── facade 委托方法 ──

  /** 注册每帧更新回调 */
  addUpdateCallback(fn: () => void): void {
    this.renderLoop.addUpdateCallback(fn);
  }

  /**
   * 注册后渲染回调（在 WebGLRenderer.render 之后执行）
   * 用于 CSS2DRenderer 等需要覆盖在 3D 之上的渲染
   */
  addPostRenderCallback(fn: () => void): void {
    this.renderLoop.addPostRenderCallback(fn);
  }

  /**
   * 替换当前相机（如 live-data 把透视相机换成正交相机）。
   * 正交相机的 resize 基准半高由 CameraManager 记录并按 aspect 重算。
   */
  setCamera(cam: THREE.Camera): void {
    this.cameraManager.setCamera(cam);
  }

  /** 设置调试模式（运行时切换） */
  setDebug(mode: boolean): void {
    this.renderLoop.setDebug(mode);
  }

  /** @deprecated 无人消费，Phase S 清理时删除 */
  get delta(): number {
    return 0;
  }

  /** @deprecated 无人消费，Phase S 清理时删除 */
  get elapsed(): number {
    return (performance.now()) / 1000;
  }
}
