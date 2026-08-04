/**
 * environment — 场景环境（非物体）：背景/雾/相机/灯光/PMREM 环境。
 *
 * 与物体无关的场景级装配。控制器(OrbitControls)需 canvas + 每帧 update，留 createScene3D。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { App3D } from '../App3D';
import type { LiveDataConfig, LiveDataLight } from './loader';
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
const applyPMREM = (app: App3D, merged: LiveDataConfig): void => {
  const env = merged.scene?.environment;
  const pmrem = new THREE.PMREMGenerator(app.renderer);
  const intensity = env?.intensity;
  app.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if (intensity !== undefined) {
    app.scene.environmentIntensity = intensity;
  }
  pmrem.dispose();
};

/**
 * 应用场景环境：背景/雾 → 清空 → 相机 → 灯光 → PMREM 环境。
 * @param merged 经 mergeWithPreset 合并预设后的配置
 */
export const applyEnvironment = (
  app: App3D,
  merged: LiveDataConfig,
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

  // ── 相机替换（支持 OrthographicCamera）──
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

  // 替换 app 上的 camera（通过 setCamera，正交相机 resize 时按 aspect 重算）
  app.setCamera(newCamera);

  // ── 灯光 ──
  for (const lc of merged.lights ?? []) {
    const light = createLiveLight(lc);
    if (light) {
      app.scene.add(light);
    }
  }

  // ── PMREM 环境光（IBL，physical 材质必需）──
  applyPMREM(app, merged);
};
