/**
 * ============================================================
 *  EnvironmentManager — PMREM 环境光（IBL）生命周期
 *
 *  从 environment.ts applyPMREM 抽出。物理材质（MeshStandardMaterial 等）
 *  依赖 scene.environment 提供的 IBL；RoomEnvironment 为默认室内环境。
 *  Phase S（环境 HDR 可换）在此扩展。
 * ============================================================
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class EnvironmentManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;

  constructor(params: { renderer: THREE.WebGLRenderer; scene: THREE.Scene }) {
    this.renderer = params.renderer;
    this.scene = params.scene;
  }

  /** 建立 PMREM 环境光（默认 RoomEnvironment；intensity 可选） */
  applyPMREM(env?: { intensity?: number } | undefined): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    if (env?.intensity !== undefined) {
      this.scene.environmentIntensity = env.intensity;
    }
    pmrem.dispose();
  }
}
