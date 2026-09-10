/**
 * ============================================================
 *  CameraManager — 相机所有权 + 正交 resize 基准 + 构建/mutate
 *
 *  从 App3D camera 段 + environment.ts buildCamera/updateEnvironment camera 分支抽出。
 *  关键耦合点：_orthoHalfH —— setCamera(正交) 时记录半高基准，resize 按 aspect
 *  重算 left/right（水平范围跟随、垂直范围不变）。两者必须同住此类。
 *
 *  既有 quirk（Phase R 不修）：update type 变换重建相机后，OrbitControls /
 *  InteractiveManager / CameraRig 持有的旧 camera 引用不刷新（宿主通过重建场景路径兜底）。
 * ============================================================
 */
import * as THREE from 'three';
import type { SceneConfig } from '../../App3D';
import type { TreeScene } from '../../scene/loader';

/** 相机配置（TreeScene['camera'] duck-type，免 loader 类型环） */
export interface CameraConfig {
  type?: string;
  position?: unknown;
  lookAt?: unknown;
  perspective?: { fov?: number; near?: number; far?: number };
  orthographic?: { top: number; bottom: number; near: number; far: number; zoom?: number };
}

export class CameraManager {
  camera: THREE.Camera;

  /** 正交相机 resize 时的基准半高（max(|top|,|bottom|)），仅正交相机下非 null */
  private _orthoHalfH: number | null = null;

  private readonly canvas: HTMLCanvasElement;

  constructor(params: { canvas: HTMLCanvasElement; config?: SceneConfig }) {
    this.canvas = params.canvas;
    const config = params.config ?? {};
    this.camera = new THREE.PerspectiveCamera(
      config.cameraFov ?? 60,
      this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1),
      0.1,
      1000,
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
  }

  /**
   * 替换当前相机（如 live-data 把透视相机换成正交相机）。
   * 内部记录正交相机的基准半高，供 resize 时按 aspect 重算 left/right。
   */
  setCamera(cam: THREE.Camera): void {
    this.camera = cam;
    if (cam instanceof THREE.OrthographicCamera) {
      this._orthoHalfH = Math.max(Math.abs(cam.top), Math.abs(cam.bottom));
    } else {
      this._orthoHalfH = null;
    }
  }

  /**
   * 构建相机（透视/正交）并盖 __id="camera"（场景级 patch 定位用）。
   * applyEnvironment 全量与 update type 变重建共用。原 environment.ts buildCamera verbatim。
   */
  buildCamera(camCfg: CameraConfig, viewSize: { width: number; height: number }):
    THREE.PerspectiveCamera | THREE.OrthographicCamera {
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
  }

  /** resize：aspect 重算（透视 aspect；正交按 _orthoHalfH 基准重算水平范围） */
  resize(width: number, height: number): void {
    const cam = this.camera;
    const aspect = width / Math.max(height, 1);
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    } else if (cam instanceof THREE.OrthographicCamera && this._orthoHalfH !== null) {
      // 保持垂直范围不变，按新 aspect 重算水平范围
      const halfW = this._orthoHalfH * aspect;
      cam.left = -halfW;
      cam.right = halfW;
      cam.updateProjectionMatrix();
    }
  }

  /**
   * 增量更新（M-3① set_camera op）：type 不变 mutate position/lookAt/fov，
   * type 变（perspective↔orthographic）重建 + setCamera。原 updateEnvironment camera 分支 verbatim。
   */
  update(camCfg: NonNullable<TreeScene['camera']>, viewSize: { width: number; height: number }): void {
    const cam = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const isOrtho = (cam as THREE.OrthographicCamera).isOrthographicCamera === true;
    const wantOrtho = camCfg.type === 'orthographic';
    if (isOrtho === wantOrtho) {
      if (Array.isArray(camCfg.position) && camCfg.position.length >= 3) {
        cam.position.set(camCfg.position[0], camCfg.position[1], camCfg.position[2]);
      }
      if (Array.isArray(camCfg.lookAt) && camCfg.lookAt.length >= 3) {
        cam.lookAt(camCfg.lookAt[0], camCfg.lookAt[1], camCfg.lookAt[2]);
      }
      if (!wantOrtho && camCfg.perspective?.fov !== undefined) {
        const p = cam as THREE.PerspectiveCamera;
        p.fov = camCfg.perspective.fov;
        p.updateProjectionMatrix();
      }
    } else {
      this.setCamera(this.buildCamera(camCfg, viewSize));
    }
  }
}
