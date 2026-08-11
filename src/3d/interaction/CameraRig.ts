/**
 * ============================================================
 *  CameraRig — 相机操作集合（flyTo / setTheme / resetCamera）
 *
 *  从 createScene3D 的 setupInteractive 抽出，提升为通用层：始终创建，
 *  运行态/编辑态均可编程式聚焦、切主题、复位（不再仅 interactive 模式）。
 *
 *  - flyTo(targetId)：按 userData.__id traverse 找目标，套包围盒定距聚焦，
 *    保持当前视角方向（逻辑与原 setupInteractive 完全一致）。
 *  - setTheme(mode)：切场景背景（dark 深蓝 / light 浅灰）。
 *  - resetCamera()：复位到构造时的初始位置/目标。
 *
 *  不感知 InteractiveManager / postMessage —— 纯相机操作，由调用方触发。
 * ============================================================
 */

import * as THREE from 'three';

/** CameraRig 需要的 controls 结构（避免与 createScene3D 循环类型依赖） */
interface CameraControlsLike {

  /** 轨道目标点（flyTo/resetCamera 写入） */
  target: THREE.Vector3;

  /** 写入 target / position 后调用，同步 controls 内部状态 */
  update(): void;
}

export class CameraRig {

  private readonly camera: THREE.Camera;
  private readonly controls: CameraControlsLike;
  private readonly scene: THREE.Scene;
  private readonly initialPosition: THREE.Vector3;
  private readonly initialTarget: THREE.Vector3;

  constructor(
    camera: THREE.Camera,
    controls: CameraControlsLike,
    scene: THREE.Scene,
    initialPosition: THREE.Vector3,
    initialTarget: THREE.Vector3,
  ) {
    this.camera = camera;
    this.controls = controls;
    this.scene = scene;
    this.initialPosition = initialPosition.clone();
    this.initialTarget = initialTarget.clone();
  }

  /** 聚焦到 userData.__id === targetId 的物体（套包围盒定距，保持当前视角方向） */
  flyTo(targetId: string): void {
    let target: THREE.Object3D | null = null;
    this.scene.traverse((o) => {
      if (!target && o.userData?.__id === targetId) {
        target = o;
      }
    });
    if (!target) {
      return;
    }
    const box = new THREE.Box3().setFromObject(target);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.2 + 1;
    this.controls.target.copy(center);
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (dir.lengthSq() < 1e-6) {
      dir.set(1, 0.8, 1);
    }
    dir.normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.update();
  }

  /** 切主题背景（dark 深蓝 / light 浅灰） */
  setTheme(mode: 'light' | 'dark'): void {
    this.scene.background = new THREE.Color(mode === 'dark' ? '#1a1a2e' : '#c9ccd6');
  }

  /** 复位相机到初始位置/目标 */
  resetCamera(): void {
    this.camera.position.copy(this.initialPosition);
    this.controls.target.copy(this.initialTarget);
    this.camera.lookAt(this.initialTarget);
    this.controls.update();
  }
}
