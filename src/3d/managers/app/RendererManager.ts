/**
 * ============================================================
 *  RendererManager — WebGLRenderer 所有权与生命周期
 *
 *  从 App3D 抽出：renderer 创建（antialias/pixelRatio cap/shadowMap/toneMapping）、
 *  resize、dispose。RenderLoop 的 resize 扇出经 resize(w,h) 进入。
 *  Phase S：update() 运行时热改 toneMapping/shadowMapType/exposure/
 *  outputColorSpace/autoClear（构造参数 antialias/alpha 不在此——改不了）。
 * ============================================================
 */
import * as THREE from 'three';
import type { LiveDataRenderer } from '../../scene/loader';

export interface RendererManagerOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  enableShadows?: boolean;
  toneMappingExposure?: number;
}

/** toneMapping 常量名 → THREE 枚举（LLM/面板写常量名，运行时映射） */
const TONE_MAPPINGS: Record<string, THREE.ToneMapping> = {
  NoToneMapping: THREE.NoToneMapping,
  LinearToneMapping: THREE.LinearToneMapping,
  ReinhardToneMapping: THREE.ReinhardToneMapping,
  CineonToneMapping: THREE.CineonToneMapping,
  ACESFilmicToneMapping: THREE.ACESFilmicToneMapping,
  AgXToneMapping: THREE.AgXToneMapping,
  NeutralToneMapping: THREE.NeutralToneMapping,
};

/** shadowMap 类型常量名 → THREE 枚举 */
const SHADOW_MAP_TYPES: Record<string, THREE.ShadowMapType> = {
  BasicShadowMap: THREE.BasicShadowMap,
  PCFShadowMap: THREE.PCFShadowMap,
  PCFSoftShadowMap: THREE.PCFSoftShadowMap,
  VSMShadowMap: THREE.VSMShadowMap,
};

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

  /**
   * 运行时热改渲染参数（M-3① set_renderer op / 面板 / 初载 live-data.renderer）。
   * 不认识的常量名静默忽略（保留现值）。
   * @returns toneMapping/shadowMapType 是否变化（true → 调用方须 markMaterialsDirty 重编 shader）
   */
  update(cfg: LiveDataRenderer): boolean {
    let shaderChanged = false;
    if (cfg.toneMapping !== undefined && TONE_MAPPINGS[cfg.toneMapping] !== undefined) {
      if (this.renderer.toneMapping !== TONE_MAPPINGS[cfg.toneMapping]) {
        this.renderer.toneMapping = TONE_MAPPINGS[cfg.toneMapping];
        shaderChanged = true;
      }
    }
    if (cfg.shadowMapType !== undefined && SHADOW_MAP_TYPES[cfg.shadowMapType] !== undefined) {
      if (this.renderer.shadowMap.type !== SHADOW_MAP_TYPES[cfg.shadowMapType]) {
        this.renderer.shadowMap.type = SHADOW_MAP_TYPES[cfg.shadowMapType];
        shaderChanged = true;
      }
    }
    if (cfg.toneMappingExposure !== undefined) {
      this.renderer.toneMappingExposure = cfg.toneMappingExposure;
    }
    if (cfg.outputColorSpace !== undefined) {
      this.renderer.outputColorSpace = cfg.outputColorSpace === 'linear'
        ? THREE.LinearSRGBColorSpace
        : THREE.SRGBColorSpace;
    }
    if (cfg.autoClear !== undefined) {
      this.renderer.autoClear = cfg.autoClear;
    }
    return shaderChanged;
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
