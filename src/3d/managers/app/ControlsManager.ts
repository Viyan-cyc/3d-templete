/**
 * ============================================================
 *  ControlsManager — OrbitControls 包装（每帧 update + dispose）
 *
 *  从 createScene3D controls 段抽出。注意：由 createScene3D 创建而非 App3D 持有
 *  （controls 选项在 Scene3DOptions；dispose 顺序须保持在 createHandle 序列内）。
 *  Phase S（set_controls op）在此扩展 update()。
 * ============================================================
 */
import type * as THREE from 'three';
import { createOrbitControls } from '../../controls/OrbitControls';

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

  /** 每帧 update（damping 跟随），由 createScene3D 注册进渲染循环 */
  update(): void {
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
