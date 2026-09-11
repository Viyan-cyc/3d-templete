/**
 * ============================================================
 *  LightManager — 灯光创建/增量 mutate/index diff
 *
 *  从 environment.ts 抽出：createLiveLight 工厂（六型）、
 *  mutateLight（增量字段）、applyLights（全量盖 __id=light-${i}）、
 *  update（M-3① index diff：mutate/add/remove；类型切换重建）。
 *
 *  Phase L 落地：point/spot/rectarea 三新型 + shadow bias/normalBias/radius
 *  + update 类型切换重建（旧实现只 mutate，切型静默 no-op）。
 * ============================================================
 */
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { LiveDataLight } from '../../scene/loader';
import { parseVec3 } from '../../components/base/transform';

// RectAreaLight 着色必需的 uniforms 库，进程内一次 init 即可
RectAreaLightUniformsLib.init();

type ShadowConfig = NonNullable<LiveDataLight['shadow']>;

/** 应用阴影配置（directional/spot 共用；bias/normalBias/radius + mapSize + camera 范围） */
const applyShadowConfig = (
  light: THREE.DirectionalLight | THREE.SpotLight,
  shadow?: ShadowConfig,
): void => {
  if (!shadow) {
    return;
  }
  if (shadow.mapSize) {
    light.shadow.mapSize.width = shadow.mapSize;
    light.shadow.mapSize.height = shadow.mapSize;
  }
  if (shadow.bias !== undefined) {
    light.shadow.bias = shadow.bias;
  }
  if (shadow.normalBias !== undefined) {
    light.shadow.normalBias = shadow.normalBias;
  }
  if (shadow.radius !== undefined) {
    light.shadow.radius = shadow.radius;
  }
  const sc = shadow.camera;
  if (sc) {
    const cam = light.shadow.camera;
    cam.near = sc.near;
    cam.far = sc.far;
    // left/right/top/bottom 仅正交相机（directional）有；spot 用 PerspectiveCamera，视锥由 angle 决定
    if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
      const o = cam as THREE.OrthographicCamera;
      o.left = sc.left;
      o.right = sc.right;
      o.top = sc.top;
      o.bottom = sc.bottom;
    }
    cam.updateProjectionMatrix();
  }
};

export class LightManager {
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** 灯光工厂（六型；不认识的 type 返回 null） */
  private createLiveLight(cfg: LiveDataLight): THREE.Light | null {
    const pos = parseVec3(cfg.position);

    switch (cfg.type) {
      case 'ambient':
        return new THREE.AmbientLight(cfg.color ?? '#ffffff', cfg.intensity ?? 1);

      case 'hemisphere':
        return this.createHemisphere(cfg, pos);

      case 'directional':
        return this.createDirectional(cfg, pos);

      case 'point': {
        const light = new THREE.PointLight(
          cfg.color ?? '#ffffff', cfg.intensity ?? 1,
          cfg.distance ?? 0, cfg.decay ?? 2,
        );
        if (pos) {
          light.position.set(...pos);
        }
        return light;
      }

      case 'spot':
        return this.createSpot(cfg, pos);

      case 'rectarea':
        return this.createRectArea(cfg, pos);

      default:
        return null;
    }
  }

  private createHemisphere(cfg: LiveDataLight, pos: ReturnType<typeof parseVec3>): THREE.HemisphereLight {
    const sky = cfg.skyColor ?? cfg.color ?? '#ffffff';
    const ground = cfg.groundColor ?? '#222222';
    const light = new THREE.HemisphereLight(sky, ground, cfg.intensity ?? 1);
    if (pos) {
      light.position.set(...pos);
    }
    return light;
  }

  private createDirectional(
    cfg: LiveDataLight,
    pos: ReturnType<typeof parseVec3>,
  ): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(cfg.color ?? '#ffffff', cfg.intensity ?? 1);
    if (pos) {
      light.position.set(...pos);
    }
    const target = parseVec3(cfg.target);
    if (target) {
      light.target.position.set(...target);
    }
    if (cfg.castShadow) {
      light.castShadow = true;
      applyShadowConfig(light, cfg.shadow);
    }
    return light;
  }

  private createSpot(cfg: LiveDataLight, pos: ReturnType<typeof parseVec3>): THREE.SpotLight {
    const light = new THREE.SpotLight(
      cfg.color ?? '#ffffff', cfg.intensity ?? 1, cfg.distance ?? 0,
      cfg.angle ?? Math.PI / 6, cfg.penumbra ?? 0, cfg.decay ?? 2,
    );
    if (pos) {
      light.position.set(...pos);
    }
    const target = parseVec3(cfg.target);
    if (target) {
      light.target.position.set(...target);
    }
    if (cfg.castShadow) {
      light.castShadow = true;
      applyShadowConfig(light, cfg.shadow);
    }
    return light;
  }

  private createRectArea(cfg: LiveDataLight, pos: ReturnType<typeof parseVec3>): THREE.RectAreaLight {
    const light = new THREE.RectAreaLight(cfg.color ?? '#ffffff', cfg.intensity ?? 1, cfg.width ?? 4, cfg.height ?? 4);
    if (pos) {
      light.position.set(...pos);
    }
    // RectAreaLight 无 target 对象，朝向由自身朝 -Z 决定：lookAt 定向
    const target = parseVec3(cfg.target);
    if (target) {
      light.lookAt(...target);
    }
    return light;
  }

  /** 增量改 light 字段：intensity/color/sky·ground/position/target/castShadow + Phase L 新字段 */
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
    if ((light as THREE.PointLight).isPointLight) {
      const p = light as THREE.PointLight;
      if (cfg.distance !== undefined) {
        p.distance = cfg.distance;
      }
      if (cfg.decay !== undefined) {
        p.decay = cfg.decay;
      }
    }
    if ((light as THREE.SpotLight).isSpotLight) {
      const s = light as THREE.SpotLight;
      if (cfg.distance !== undefined) {
        s.distance = cfg.distance;
      }
      if (cfg.decay !== undefined) {
        s.decay = cfg.decay;
      }
      if (cfg.angle !== undefined) {
        s.angle = cfg.angle;
      }
      if (cfg.penumbra !== undefined) {
        s.penumbra = cfg.penumbra;
      }
    }
    if ((light as THREE.RectAreaLight).isRectAreaLight) {
      const r = light as THREE.RectAreaLight;
      if (cfg.width !== undefined) {
        r.width = cfg.width;
      }
      if (cfg.height !== undefined) {
        r.height = cfg.height;
      }
    }
    if (cfg.castShadow !== undefined && 'castShadow' in light) {
      // 仅 directional/spot 能投射阴影；ambient/hemisphere/point(rectarea 无阴影) 误置会触发
      // WebGLShadowMap「has no shadow」警告。
      const canShadow = (light as THREE.DirectionalLight).isDirectionalLight
        || (light as THREE.SpotLight).isSpotLight;
      (light as THREE.DirectionalLight).castShadow = cfg.castShadow && canShadow;
    }
    if (cfg.shadow) {
      const canShadow = (light as THREE.DirectionalLight).isDirectionalLight
        || (light as THREE.SpotLight).isSpotLight;
      if (canShadow) {
        applyShadowConfig(light as THREE.DirectionalLight, cfg.shadow);
      }
    }
    if ((light as THREE.RectAreaLight).isRectAreaLight) {
      const target = parseVec3(cfg.target);
      if (target) {
        (light as THREE.RectAreaLight).lookAt(...target);
      }
    } else {
      const target = parseVec3(cfg.target);
      if (target && 'target' in light) {
        const t = (light as THREE.DirectionalLight).target;
        t.position.set(...target);
        t.updateMatrixWorld();
      }
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
   * 增量更新（M-3① set_light op）：按 __id=light-${index} 定位。
   * type 不变 → mutate；type 变 → remove 旧实例（释放 shadow map）+ 重建，保留 __id。
   * 新 index → add；旧 index 不在新集 → remove。
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
      if (cur && this.lightTypeOf(cur) === lc.type) {
        this.mutateLight(cur, lc);
      } else {
        if (cur) {
          if ((cur as THREE.DirectionalLight).shadow?.map) {
            (cur as THREE.DirectionalLight).shadow.map?.dispose();
          }
          this.scene.remove(cur);
        }
        const light = this.createLiveLight(lc);
        if (light) {
          light.userData.__id = id;
          this.scene.add(light);
        }
      }
    });
    for (const [id, light] of existing) {
      if (!seen.has(id)) {
        if ((light as THREE.DirectionalLight).shadow?.map) {
          (light as THREE.DirectionalLight).shadow.map?.dispose();
        }
        this.scene.remove(light);
      }
    }
  }

  /** 实例的 live-data 灯型名（type 不识别返 null → 走重建分支） */
  private lightTypeOf(light: THREE.Light): LiveDataLight['type'] | null {
    if ((light as THREE.AmbientLight).isAmbientLight) {
      return 'ambient';
    }
    if ((light as THREE.HemisphereLight).isHemisphereLight) {
      return 'hemisphere';
    }
    if ((light as THREE.DirectionalLight).isDirectionalLight) {
      return 'directional';
    }
    if ((light as THREE.PointLight).isPointLight) {
      return 'point';
    }
    if ((light as THREE.SpotLight).isSpotLight) {
      return 'spot';
    }
    if ((light as THREE.RectAreaLight).isRectAreaLight) {
      return 'rectarea';
    }
    return null;
  }
}
