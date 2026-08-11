/**
 * ============================================================
 *  SelectionVisuals — 选中高亮可视化
 *
 *  从原 ScenePicker 抽出的 BoxHelper 包围盒高亮，独立可复用：
 *  - highlight(obj)：给物体套蓝色 BoxHelper，每帧 update 跟随移动。
 *  - clear()：移除并释放 helper。
 *  - update()：每帧调用，让包围盒跟随选中物移动。
 *
 *  与选择逻辑解耦：SelectionService 只管"选中谁"，可视化交给本类。
 *  未来可替换为 outline pass / 描边材质而不动 SelectionService。
 * ============================================================
 */

import * as THREE from 'three';

export class SelectionVisuals {

  /** 当前高亮物体 */
  private highlighted: THREE.Object3D | null = null;

  /** 高亮包围盒 helper（加到 scene，每帧 update 跟随） */
  private boxHelper: THREE.BoxHelper | null = null;

  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** 高亮指定物体（BoxHelper 包围盒，跟随移动） */
  highlight(obj: THREE.Object3D): void {
    if (this.highlighted === obj && this.boxHelper) {
      return;
    }
    this.clear();
    this.highlighted = obj;
    const helper = new THREE.BoxHelper(obj, 0x3d99ff);
    // BoxHelper 自身不应被 raycast 命中（否则点选中物的边框会命中 helper）
    helper.raycast = () => {};
    this.boxHelper = helper;
    this.scene.add(helper);
    helper.update();
  }

  /** 清除高亮（移除 helper 并释放几何/材质） */
  clear(): void {
    if (this.boxHelper) {
      this.scene.remove(this.boxHelper);
      this.boxHelper.geometry.dispose();
      const mat = this.boxHelper.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
      this.boxHelper = null;
    }
    this.highlighted = null;
  }

  /** 每帧调用（由 createScene3D 渲染循环触发）：让包围盒跟随选中物移动 */
  update(): void {
    if (this.boxHelper && this.highlighted) {
      this.boxHelper.update();
    }
  }

  /** 销毁：清除高亮 */
  dispose(): void {
    this.clear();
  }
}
