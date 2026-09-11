/**
 *  SceneManager — THREE.Scene 所有权 + 场景级视觉态（背景/雾）
 *
 *  从 App3D scene 段 + environment.ts 背景/雾段抽出。
 *  applyEnvironment（全量）与 updateEnvironment（M-3① 增量）的背景/雾逻辑
 *  在此合一（applyBackgroundFog），消除原两处重复。
 *  Phase L：fog exp 型（FogExp2）+ 显式清雾 + markMaterialsDirty（toneMapping/shadowMapType 热改）。
 */
import * as THREE from 'three';

/** scene 级视觉配置（TreeScene['scene'] 的背景/雾/环境强度子集，duck-type 免类型环） */
export interface SceneVisualsConfig {
  background?: string;

  /** fog.type 'linear'（near/far）| 'exp'（density，FogExp2）；显式 undefined（'fog' in cfg）= 清除雾 */
  fog?: { type?: string; color: string; near: number; far: number; density?: number } | undefined;
  environment?: { intensity?: number } | undefined;
}

export class SceneManager {
  readonly scene: THREE.Scene;

  constructor(config?: { backgroundColor?: string; fogColor?: string; fogNear?: number; fogFar?: number }) {
    this.scene = new THREE.Scene();
    if (config?.backgroundColor) {
      this.scene.background = new THREE.Color(config.backgroundColor);
    }
    if (config?.fogColor) {
      this.scene.fog = new THREE.Fog(config.fogColor, config.fogNear ?? 10, config.fogFar ?? 100);
    }
  }

  /** 应用背景/雾/环境强度（全量 apply 与增量 update 共用；undefined 字段不覆盖，显式 fog=undefined 清除雾） */
  applyBackgroundFog(cfg: SceneVisualsConfig): void {
    if (cfg.background) {
      this.scene.background = new THREE.Color(cfg.background);
    }
    if ('fog' in cfg) {
      if (cfg.fog?.type === 'exp') {
        this.scene.fog = new THREE.FogExp2(cfg.fog.color, cfg.fog.density ?? 0.02);
      } else if (cfg.fog?.type === 'linear') {
        const f = cfg.fog;
        this.scene.fog = new THREE.Fog(f.color, f.near, f.far);
      } else if (!cfg.fog) {
        this.scene.fog = null;
      }
    }
    // 注意：environmentIntensity 仅在此设置；PMREM 纹理本身从不在此重生成（全量 applyEnvironment 才建）
    if (cfg.environment?.intensity !== undefined) {
      this.scene.environmentIntensity = cfg.environment.intensity;
    }
  }

  /**
   * 全量材质重编译标记：toneMapping/shadowMapType 运行时改后 shader 须重建
   * （three 只在 material.needsUpdate 时重编 program）。RendererManager.update 返回
   * changed 时由 environment 分发层调用。
   */
  markMaterialsDirty(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (Array.isArray(o.material)) {
          o.material.forEach((m) => {
            m.needsUpdate = true;
          });
        } else {
          o.material.needsUpdate = true;
        }
      }
    });
  }

  /** 增量更新入口（M-3① set_scene op）——语义同 applyBackgroundFog，保留独立命名供分发侧读 */
  update(cfg: SceneVisualsConfig): void {
    this.applyBackgroundFog(cfg);
  }

  /** 清空场景直接子节点（保留 scene 对象本身；applyEnvironment 全量重建用） */
  clearChildren(): void {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
  }

  /** traverse 释放全部 mesh 的 geometry/material（App3D 原 dispose 逻辑） */
  dispose(): void {
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
}
