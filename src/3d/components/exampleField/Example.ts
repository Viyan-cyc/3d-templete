import * as THREE from 'three';
import type { ComponentOptions } from '../base/types';
import { applyTransform } from '../base/transform';

/**
 * ExampleComponent — 示例组件（开发者参考模板）
 *
 * 纯展示组件：不自己加载/创建资源。模型 + 材质由 exampleHandler 创建，
 * 通过 setResources(model, material) 传入；组件只负责组装（挂载模型 + 应用材质）。
 *
 * 参考它开发新组件：
 *   1) 写组件类（extend THREE.Group/Mesh，纯展示，资源由 handler 传入）；
 *   2) 写 handler（create 里加载模型 + 创建材质，传给组件）；
 *   3) 在 handlers/index.ts 的 creationChain 加一项。
 */
export class ExampleComponent extends THREE.Group {
  constructor(opts: ComponentOptions) {
    super();
    if (opts.id) {
      this.name = opts.id;
    }
    applyTransform(this, opts);
  }

  /**
   * 接收 handler 创建好的模型 + 材质并组装：挂载模型，把材质覆盖到模型所有 mesh。
   * 由 handler 在 cloneModel/copy 完成后调用（异步回填同一组件实例）。
   */
  setResources(model: THREE.Object3D, material: THREE.Material): void {
    this.add(model);
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      // debugger
      if (!mesh.isMesh) {
        return;
      }
      mesh.material = material;
    });
  }
}
