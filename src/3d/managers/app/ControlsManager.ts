/**
 * ============================================================
 *  ControlsManager — OrbitControls 包装（每帧 update + dispose）
 *
 *  从 createScene3D controls 段抽出。注意：由 createScene3D 创建而非 App3D 持有
 *  （controls 选项在 Scene3DOptions；dispose 顺序须保持在 createHandle 序列内）。
 *  Phase S set_controls op 落地：update(cfg) 热改阻尼/距离/极角/开关/autoRotate。
 * ============================================================
 */
import type * as THREE from 'three';
import { createOrbitControls } from '../../controls/OrbitControls';
import type { LiveDataControls } from '../../scene/loader';

export type ControlsInstance = ReturnType<typeof createOrbitControls>;

export interface ControlsManagerOptions {
  enableDamping?: boolean;
  dampingFactor?: number;
  minDistance?: number;
  maxDistance?: number;
  maxPolarAngle?: number;
  target?: { x: number; y: number; z: number };
}

export class ControlsManager {
  readonly controls: ControlsInstance;

  constructor(params: { camera: THREE.Camera; domElement: HTMLElement; options?: ControlsManagerOptions }) {
    this.controls = createOrbitControls(params.camera, params.domElement, params.options);
  }

  /** 运行时热改控制参数（set_controls op / 面板 / 初载 live-data.controls）；undefined 字段不覆盖 */
  update(cfg: LiveDataControls): void {
    const c = this.controls;
    if (cfg.enableDamping !== undefined) {
      c.enableDamping = cfg.enableDamping;
    }
    if (cfg.dampingFactor !== undefined) {
      c.dampingFactor = cfg.dampingFactor;
    }
    if (cfg.minDistance !== undefined) {
      c.minDistance = cfg.minDistance;
    }
    if (cfg.maxDistance !== undefined) {
      c.maxDistance = cfg.maxDistance;
    }
    if (cfg.maxPolarAngle !== undefined) {
      c.maxPolarAngle = cfg.maxPolarAngle;
    }
    if (cfg.enableRotate !== undefined) {
      c.enableRotate = cfg.enableRotate;
    }
    if (cfg.enableZoom !== undefined) {
      c.enableZoom = cfg.enableZoom;
    }
    if (cfg.enablePan !== undefined) {
      c.enablePan = cfg.enablePan;
    }
    if (cfg.autoRotate !== undefined) {
      c.autoRotate = cfg.autoRotate;
    }
    if (cfg.autoRotateSpeed !== undefined) {
      c.autoRotateSpeed = cfg.autoRotateSpeed;
    }
    if (cfg.target) {
      c.target.set(cfg.target.x, cfg.target.y, cfg.target.z);
    }
  }

  /** 每帧 update（damping/autoRotate 跟随），由 createScene3D 注册进渲染循环 */
  update(): void {
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
