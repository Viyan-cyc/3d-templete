import * as THREE from "three";
const CLICK_THRESHOLD = 5;
class ScenePicker {
  ray = new THREE.Raycaster();
  enabled = false;
  /** pointerdown 起始坐标，用于区分点击/拖拽 */
  downPos = null;
  /** 当前高亮物体 */
  highlighted = null;
  /** 高亮包围盒 helper（加到 scene，每帧 update 跟随） */
  boxHelper = null;
  /** 复用 Vector2 / ndc，避免每次 pick 分配 */
  ndc = new THREE.Vector2();
  /**
   * 选中粒度：
   * - 'part'（默认）：取命中点沿父子链的第一个 __id（叶子部件，如树干/树冠）。
   * - 'whole'：取最近的 __logicalRoot 祖先（用户视角的"一个整体"，如整棵树），
   *   链上无 __logicalRoot 时回落到叶子。由宿主通过 SCENE_PICK_GRANULARITY 切换。
   */
  granularity = "part";
  /** 拾取回调（embed.vue 设：把 PickInfo postMessage 给宿主） */
  onPick = null;
  scene;
  camera;
  canvas;
  constructor(scene, camera, canvas) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
  }
  /** 开启拾取：挂监听 */
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.canvas.addEventListener("pointerdown", this.handleDown);
    this.canvas.addEventListener("pointerup", this.handleUp);
    this.canvas.style.cursor = "crosshair";
  }
  /** 关闭拾取：摘监听 + 清高亮 */
  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.canvas.removeEventListener("pointerdown", this.handleDown);
    this.canvas.removeEventListener("pointerup", this.handleUp);
    this.canvas.style.cursor = "";
    this.downPos = null;
    this.clearHighlight();
  }
  /** 每帧调用（由 createScene3D 渲染循环触发）：让包围盒跟随选中物移动 */
  update() {
    if (this.boxHelper && this.highlighted) {
      this.boxHelper.update();
    }
  }
  /** 设置选中粒度（'part' | 'whole'），由 postMessage 桥 SCENE_PICK_GRANULARITY 调用 */
  setGranularity(mode) {
    this.granularity = mode;
  }
  /**
   * 在指定 NDC 坐标拾取。公开方法，也可供编程式调用（如 SCENE_FLY_TO 后高亮）。
   *
   * 粒度（this.granularity）：
   * - 'part'：取命中点沿父子链的第一个 __id（叶子部件）。
   * - 'whole'：取最近的 __logicalRoot 祖先（整体）；链上无 __logicalRoot 时回落到首个 __id。
   */
  pickAt(ndc) {
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      let firstIdObj = null;
      let firstId = "";
      let cur = hit.object;
      while (cur) {
        const id = cur.userData?.__id;
        if (typeof id === "string" && id !== "") {
          if (!firstIdObj) {
            firstIdObj = cur;
            firstId = id;
          }
          if (this.granularity === "part") {
            this.emitPick(cur, id);
            return;
          }
          if (this.granularity === "whole" && cur.userData?.__logicalRoot === true) {
            this.emitPick(cur, id);
            return;
          }
        }
        cur = cur.parent;
      }
      if (firstIdObj) {
        this.emitPick(firstIdObj, firstId);
        return;
      }
    }
    this.clearHighlight();
    this.onPick?.({ id: "" });
  }
  /** 高亮 + 回调的统一出口（part/whole 两模式共用） */
  emitPick(obj, id) {
    this.highlightObject(obj);
    const info = {
      id,
      name: obj.name || id,
      component: typeof obj.userData?.__componentName === "string" ? obj.userData.__componentName : void 0
    };
    this.onPick?.(info);
  }
  /** 销毁：摘监听 + 清高亮 */
  dispose() {
    this.disable();
  }
  // ---- 内部 ----
  handleDown = (e) => {
    this.downPos = { x: e.clientX, y: e.clientY };
  };
  handleUp = (e) => {
    const down = this.downPos;
    this.downPos = null;
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      (e.clientX - rect.left) / rect.width * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.pickAt(this.ndc);
  };
  /** 高亮指定物体（BoxHelper 包围盒，跟随移动） */
  highlightObject(obj) {
    if (this.highlighted === obj && this.boxHelper) return;
    this.clearHighlight();
    this.highlighted = obj;
    const helper = new THREE.BoxHelper(obj, 4037119);
    helper.raycast = () => {
    };
    this.boxHelper = helper;
    this.scene.add(helper);
    helper.update();
  }
  /** 清除高亮 */
  clearHighlight() {
    if (this.boxHelper) {
      this.scene.remove(this.boxHelper);
      this.boxHelper.geometry.dispose();
      const mat = this.boxHelper.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
      this.boxHelper = null;
    }
    this.highlighted = null;
  }
}
export {
  ScenePicker
};
