/**
 * environment — 场景环境（非物体）：背景/雾/相机/灯光/PMREM 环境。
 *
 * 与物体无关的场景级装配。控制器(OrbitControls)需 canvas + 每帧 update，留 createScene3D。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { App3D } from '../App3D';
import type { TreeScene, LiveDataLight } from './loader';
import { parseVec3 } from '../components/base/transform';

// ── 灯光工厂 ──

const createLiveLight = (cfg: LiveDataLight): THREE.Light | null => {
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
};

/** 根据 config.scene.environment 建立 PMREM 环境光（默认 RoomEnvironment） */
const applyPMREM = (app: App3D, merged: TreeScene): void => {
  const env = merged.scene?.environment;
  const pmrem = new THREE.PMREMGenerator(app.renderer);
  const intensity = env?.intensity;
  app.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if (intensity !== undefined) {
    app.scene.environmentIntensity = intensity;
  }
  pmrem.dispose();
};

/** 构建相机（透视/正交）并盖 __id="camera"（场景级 patch 定位用）。applyEnvironment 全量与 updateEnvironment type 变重建共用。 */
const buildCamera = (
  camCfg: NonNullable<TreeScene['camera']>,
  viewSize: { width: number; height: number },
): THREE.PerspectiveCamera | THREE.OrthographicCamera => {
  const aspect = viewSize.width / Math.max(viewSize.height, 1);
  let newCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;

  if (camCfg.type === 'orthographic' && camCfg.orthographic) {
    const o = camCfg.orthographic;
    const halfH = Math.max(Math.abs(o.top), Math.abs(o.bottom));
    const halfW = halfH * aspect;
    newCamera = new THREE.OrthographicCamera(-halfW, halfW, o.top, o.bottom, o.near, o.far);
    if (o.zoom) {
      newCamera.zoom = o.zoom;
    }
  } else {
    const p = camCfg.perspective ?? { fov: 50, near: 0.1, far: 100 };
    newCamera = new THREE.PerspectiveCamera(p.fov, aspect, p.near, p.far);
  }

  newCamera.position.set(...(Array.isArray(camCfg.position) && camCfg.position.length >= 3
    ? camCfg.position.slice(0, 3) as [number, number, number]
    : [15, 12, 15] as [number, number, number]));
  newCamera.lookAt(...(Array.isArray(camCfg.lookAt) && camCfg.lookAt.length >= 3
    ? camCfg.lookAt.slice(0, 3) as [number, number, number]
    : [0, 0, 0] as [number, number, number]));
  newCamera.updateProjectionMatrix();
  newCamera.userData.__id = 'camera';
  return newCamera;
};

/** 增量改 light 字段：intensity/color/sky·ground/position/target/castShadow（shadow 子对象走全量） */
const mutateLight = (light: THREE.Light, cfg: LiveDataLight): void => {
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
    (light as THREE.DirectionalLight).castShadow = cfg.castShadow;
  }
  const target = parseVec3(cfg.target);
  if (target && 'target' in light) {
    const t = (light as THREE.DirectionalLight).target;
    t.position.set(...target);
    t.updateMatrixWorld();
  }
};

/**
 * 应用场景环境：背景/雾 → 清空 → 相机 → 灯光 → PMREM 环境。
 * @param merged 经 mergeWithPreset 合并预设后的配置
 */
export const applyEnvironment = (
  app: App3D,
  merged: TreeScene,
  viewSize: { width: number; height: number },
  keepExisting?: boolean,
): void => {
  const scene = merged.scene!;
  const camCfg = merged.camera!;

  // ── 背景/雾 ──
  if (scene.background) {
    app.scene.background = new THREE.Color(scene.background);
  }
  if (scene.fog && scene.fog.type === 'linear') {
    const f = scene.fog;
    app.scene.fog = new THREE.Fog(f.color, f.near, f.far);
  }

  // ── 清空现有场景（保留 scene 对象本身）──
  if (!keepExisting) {
    while (app.scene.children.length > 0) {
      app.scene.remove(app.scene.children[0]);
    }
  }

  // ── 相机替换（buildCamera 盖 __id="camera"；正交相机 resize 时按 aspect 重算）──
  app.setCamera(buildCamera(camCfg, viewSize));

  // ── 灯光（盖 __id=light-${i}，供 updateEnvironment 按 index 定位 mutate）──
  (merged.lights ?? []).forEach((lc, i) => {
    const light = createLiveLight(lc);
    if (light) {
      light.userData.__id = `light-${i}`;
      app.scene.add(light);
    }
  });

  // ── PMREM 环境光（IBL，physical 材质必需）──
  applyPMREM(app, merged);
};

/**
 * 场景级增量更新（M-3 ①）：只重应用 camera/lights/scene.background·fog·environment，**不重建物体树**。
 * lights 按 __id=light-${index} 定位 mutate；新增 add + 盖 __id；旧 index 不在新集 → remove。
 * camera type 变（perspective↔orthographic）才 setCamera 重建，否则 mutate position/lookAt/fov。
 * 对应 set_light/set_camera/set_scene op 的运行时 mutate 路径（区别于 applyEnvironment 全量重建）。
 */
export interface EnvUpdate {
  camera?: NonNullable<TreeScene['camera']>;
  lights?: LiveDataLight[];
  scene?: NonNullable<TreeScene['scene']>;
}

export const updateEnvironment = (
  app: App3D,
  env: EnvUpdate,
  viewSize: { width: number; height: number },
): void => {
  // ── background / fog / environment 强度 ──
  if (env.scene) {
    const s = env.scene;
    if (s.background) {
      app.scene.background = new THREE.Color(s.background);
    }
    if (s.fog && s.fog.type === 'linear') {
      const f = s.fog;
      app.scene.fog = new THREE.Fog(f.color, f.near, f.far);
    }
    if (s.environment?.intensity !== undefined) {
      app.scene.environmentIntensity = s.environment.intensity;
    }
  }

  // ── lights：按 index diff（mutate / add / remove）──
  if (env.lights) {
    const existing = new Map<string, THREE.Light>();
    app.scene.traverse((o) => {
      const id = o.userData?.__id;
      if (typeof id === 'string' && id.startsWith('light-') && (o as THREE.Light).isLight) {
        existing.set(id, o as THREE.Light);
      }
    });
    const seen = new Set<string>();
    env.lights.forEach((lc, i) => {
      const id = `light-${i}`;
      seen.add(id);
      const cur = existing.get(id);
      if (cur) {
        mutateLight(cur, lc);
      } else {
        const light = createLiveLight(lc);
        if (light) {
          light.userData.__id = id;
          app.scene.add(light);
        }
      }
    });
    for (const [id, light] of existing) {
      if (!seen.has(id)) {
        app.scene.remove(light);
      }
    }
  }

  // ── camera：type 变重建，否则 mutate ──
  if (env.camera) {
    const cam = app.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const isOrtho = (cam as THREE.OrthographicCamera).isOrthographicCamera === true;
    const wantOrtho = env.camera.type === 'orthographic';
    if (isOrtho === wantOrtho) {
      if (Array.isArray(env.camera.position) && env.camera.position.length >= 3) {
        cam.position.set(env.camera.position[0], env.camera.position[1], env.camera.position[2]);
      }
      if (Array.isArray(env.camera.lookAt) && env.camera.lookAt.length >= 3) {
        cam.lookAt(env.camera.lookAt[0], env.camera.lookAt[1], env.camera.lookAt[2]);
      }
      if (!wantOrtho && env.camera.perspective?.fov !== undefined) {
        const p = cam as THREE.PerspectiveCamera;
        p.fov = env.camera.perspective.fov;
        p.updateProjectionMatrix();
      }
    } else {
      app.setCamera(buildCamera(env.camera, viewSize));
    }
  }
};
