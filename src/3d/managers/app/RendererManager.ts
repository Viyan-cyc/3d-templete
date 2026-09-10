/**
 * ============================================================
 *  RendererManager — WebGLRenderer 所有权与生命周期
 *
 *  从 App3D 抽出：renderer 创建（antialias/pixelRatio cap/shadowMap/toneMapping）、
 *  resize、dispose。RenderLoop 的 resize 扇出经 resize(w,h) 进入。
 * ============================================================
 */
import * as THREE from 'three';

export interface RendererManagerOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  enableShadows?: boolean;
  toneMappingExposure?: number;
}

export class RendererManager {
  readonly renderer: THREE.WebGLRenderer;

  constructor(options: RendererManagerOptions) {
    const {
      canvas, antialias = true, enableShadows = true, toneMappingExposure = 1.0,
    } = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    // updateStyle=false：不覆盖 canvas 的 CSS（.scene-canvas width/height:100%），
    // 让 canvas 显示尺寸跟随父容器；只设绘图缓冲分辨率（width/height attribute）。
    // 若 updateStyle=true（默认），setSize 会把 style 钉成像素值，canvas 不再跟随父容器，
    // offsetWidth 锁死 → ResizeObserver 永不触发 → 缩放无响应。
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = toneMappingExposure;
  }

  /** resize 绘图缓冲分辨率（保持 CSS 100% 跟随父容器，updateStyle=false） */
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  /** 渲染统计（DebugOverlay HUD 每帧读） */
  get info(): THREE.WebGLRenderer.Info {
    return this.renderer.info;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
