/**
 * ============================================================
 *  LightManager — 灯光创建/增量 mutate/index diff
 *
 *  从 environment.ts 抽出：createLiveLight 工厂（ambient/hemisphere/directional）、
 *  mutateLight（增量字段）、applyLights（全量盖 __id=light-${i}）、
 *  update（M-3① index diff：mutate/add/remove）。
 *
 *  Phase L（point/spot/rectarea 类型扩 + add/remove op）在此扩展。
 * ============================================================
 */
import * as THREE from 'three';
import type { LiveDataLight } from '../../scene/loader';
import { parseVec3 } from '../../components/base/transform';

export class LightManager {
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** 灯光工厂（原 environment.ts createLiveLight verbatim；不认识的 type 返回 null） */
  private createLiveLight(cfg: LiveDataLight): THREE.Light | null {
    const color = cfg.color;
    const intensity = cfg.intensity ?? 1;
    const pos = parseVec3(cfg.position);

    switch (cfg.type) {
      case 'ambient':
        return new THREE.AmbientLight(color ?? '#ffffff', intensity);

      case 'hemisphere': {
        const sky = cfg.skyColor ?? cfg.color ?? color ?? '#ffffff';
        const ground = cfg.groundColor ?? '#222222';
        const light = new THREE.HemisphereLight(sky, ground, intensity);
        if (pos) {
          light.position.set(...pos);
        }
        return light;
      }

      case 'directional': {
        const light = new THREE.DirectionalLight(color ?? '#ffffff', intensity);
        if (pos) {
          light.position.set(...pos);
        }
        const target = parseVec3(cfg.target);
        if (target) {
          light.target.position.set(...target);
        }
        if (cfg.castShadow) {
          light.castShadow = true;
          const shadow = cfg.shadow;
          if (shadow) {
            if (shadow.mapSize) {
              light.shadow.mapSize.width = shadow.mapSize;
              light.shadow.mapSize.height = shadow.mapSize;
            }
            const sc = shadow.camera;
            if (sc) {
              light.shadow.camera.near = sc.near;
              light.shadow.camera.far = sc.far;
              light.shadow.camera.left = sc.left;
              light.shadow.camera.right = sc.right;
              light.shadow.camera.top = sc.top;
              light.shadow.camera.bottom = sc.bottom;
              light.shadow.camera.updateProjectionMatrix();
            }
          }
        }
        return light;
      }

      default:
        return null;
    }
  }

  /** 增量改 light 字段：intensity/color/sky·ground/position/target/castShadow（原 mutateLight verbatim） */
  private mutateLight(light: THREE.Light, cfg: LiveDataLight): void {
    if (cfg.intensity !== undefined) {
      light.intensity = cfg.intensity;
    }
    if (cfg.color !== undefined) {
      light.color.set(cfg.color);
    }
    if ((light as THREE.HemisphereLight).isHemisphereLight) {
      const hemi = light as THREE.HemisphereLight;
      if (cfg.skyColor !== undefined) {
        hemi.color.set(cfg.skyColor);
      }
      if (cfg.groundColor !== undefined) {
        hemi.groundColor.set(cfg.groundColor);
      }
    }
    const pos = parseVec3(cfg.position);
    if (pos) {
      light.position.set(...pos);
    }
    if (cfg.castShadow !== undefined && 'castShadow' in light) {
      // 仅 directional 能投射阴影；ambient/hemisphere 无阴影，误置会触发
      // WebGLShadowMap「HemisphereLight has no shadow」警告。
      (light as THREE.DirectionalLight).castShadow =
        cfg.castShadow && (light as THREE.DirectionalLight).isDirectionalLight;
    }
    const target = parseVec3(cfg.target);
    if (target && 'target' in light) {
      const t = (light as THREE.DirectionalLight).target;
      t.position.set(...target);
      t.updateMatrixWorld();
    }
  }

  /** 全量建灯（applyEnvironment 用）：盖 __id=light-${i} 加进场景 */
  applyLights(lights: LiveDataLight[]): void {
    lights.forEach((lc, i) => {
      const light = this.createLiveLight(lc);
      if (light) {
        light.userData.__id = `light-${i}`;
        this.scene.add(light);
      }
    });
  }

  /**
   * 增量更新（M-3① set_light op，原 updateEnvironment lights 分支 verbatim）：
   * 按 __id=light-${index} 定位 mutate；新 index → add + 盖 __id；旧 index 不在新集 → remove。
   */
  update(lights: LiveDataLight[]): void {
    const existing = new Map<string, THREE.Light>();
    this.scene.traverse((o) => {
      const id = o.userData?.__id;
      if (typeof id === 'string' && id.startsWith('light-') && (o as THREE.Light).isLight) {
        existing.set(id, o as THREE.Light);
      }
    });
    const seen = new Set<string>();
    lights.forEach((lc, i) => {
      const id = `light-${i}`;
      seen.add(id);
      const cur = existing.get(id);
      if (cur) {
        this.mutateLight(cur, lc);
      } else {
        const light = this.createLiveLight(lc);
        if (light) {
          light.userData.__id = id;
          this.scene.add(light);
        }
      }
    });
    for (const [id, light] of existing) {
      if (!seen.has(id)) {
        this.scene.remove(light);
      }
    }
  }
}
