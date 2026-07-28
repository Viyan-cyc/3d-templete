import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { CardComponentRegistry, cardComponentRegistry } from "./CardRegistry";
function pickAnchor(spec, meshes) {
  if (meshes.length === 0) throw new Error("[scanCards] \u7A7A\u5206\u7EC4\uFF0C\u65E0\u6CD5\u9009\u951A\u70B9");
  if (!spec || spec === "first") return meshes[0];
  if (spec === "highest") {
    return meshes.reduce((top, m) => m.position.y > top.position.y ? m : top, meshes[0]);
  }
  if (typeof spec === "string") {
    return meshes.find((m) => m.name.endsWith(spec)) ?? meshes[0];
  }
  return spec(meshes);
}
class CardManager {
  /** 实例级组件注册表 */
  registry;
  /** 全局共享注册表（向后兼容 + 单实例场景） */
  static defaultRegistry = cardComponentRegistry;
  css2DRenderer;
  _cards = /* @__PURE__ */ new Map();
  _stateListeners = [];
  _raycaster = new THREE.Raycaster();
  _mouse = new THREE.Vector2();
  _camera;
  _domElement;
  _clickThreshold;
  _clickHandler = null;
  _pointerDownHandler = null;
  _pointerDownPos = null;
  _frozen = false;
  constructor(options) {
    this.registry = new CardComponentRegistry();
    const { container, camera, canvas, clickThreshold = 5 } = options;
    this._camera = camera;
    this._domElement = canvas;
    this._clickThreshold = clickThreshold;
    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.domElement.style.position = "absolute";
    this.css2DRenderer.domElement.style.top = "0";
    this.css2DRenderer.domElement.style.left = "0";
    this.css2DRenderer.domElement.style.pointerEvents = "none";
    this.css2DRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.css2DRenderer.domElement);
    this._pointerDownHandler = (e) => {
      this._pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    this._clickHandler = (e) => {
      if (this._frozen) return;
      if (this._pointerDownPos) {
        const dx = e.clientX - this._pointerDownPos.x;
        const dy = e.clientY - this._pointerDownPos.y;
        if (Math.hypot(dx, dy) > this._clickThreshold) return;
      }
      const rect = canvas.getBoundingClientRect();
      this._mouse.x = (e.clientX - rect.left) / rect.width * 2 - 1;
      this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._handleClick();
    };
    canvas.addEventListener("pointerdown", this._pointerDownHandler);
    canvas.addEventListener("click", this._clickHandler);
  }
  /**
   * 注册一个卡片
   *
   * 一个卡片可关联一组物体（如一棵树的树干+树冠），点击其中任意一个都会命中本卡片。
   */
  addCard(id, type, targets, def = {}) {
    if (this._cards.has(id)) {
      console.warn(`[CardManager] \u5361\u7247 "${id}" \u5DF2\u5B58\u5728`);
      return;
    }
    const targetList = Array.isArray(targets) ? targets : [targets];
    if (targetList.length === 0) {
      console.warn(`[CardManager] \u5361\u7247 "${id}" \u6CA1\u6709\u5173\u8054\u7269\u4F53`);
      return;
    }
    const anchor = def.anchor ?? targetList[0];
    const domEl = document.createElement("div");
    domEl.className = `card-3d card-type-${type}`;
    domEl.setAttribute("data-card-id", id);
    domEl.setAttribute("data-card-type", type);
    domEl.style.position = "absolute";
    domEl.style.pointerEvents = "auto";
    domEl.style.transition = "opacity 0.3s ease";
    const css2d = new CSS2DObject(domEl);
    css2d.name = `card-${id}`;
    const off = def.offset ?? [0, 1.5, 0];
    css2d.position.set(off[0] ?? 0, off[1] ?? 1.5, off[2] ?? 0);
    anchor.add(css2d);
    const alwaysVisible = def.mode === "always" || def.alwaysVisible === true;
    domEl.style.opacity = alwaysVisible ? "1" : "0";
    domEl.style.visibility = alwaysVisible ? "visible" : "hidden";
    const entry = {
      id,
      type,
      object3D: anchor,
      targets: targetList,
      def,
      css2d,
      domEl,
      visible: alwaysVisible
    };
    this._cards.set(id, entry);
    this._notify();
  }
  /** 移除卡片 */
  removeCard(id) {
    const entry = this._cards.get(id);
    if (!entry) return;
    entry.css2d.removeFromParent();
    entry.domEl.remove();
    this._cards.delete(id);
    this._notify();
  }
  /** 显示卡片（带动画） */
  showCard(id) {
    const entry = this._cards.get(id);
    if (!entry) return;
    entry.visible = true;
    entry.domEl.style.visibility = "visible";
    entry.domEl.style.opacity = "1";
    this._notify();
  }
  /** 隐藏卡片（带动画） */
  hideCard(id) {
    const entry = this._cards.get(id);
    if (!entry) return;
    entry.visible = false;
    entry.domEl.style.opacity = "0";
    const onDone = () => {
      entry.domEl.style.visibility = "hidden";
      entry.domEl.removeEventListener("transitionend", onDone);
    };
    entry.domEl.addEventListener("transitionend", onDone, { once: true });
    this._notify();
  }
  /** 切换卡片显隐 */
  toggleCard(id) {
    const entry = this._cards.get(id);
    if (!entry) return;
    if (entry.visible) {
      this.hideCard(id);
    } else {
      this.showCard(id);
    }
  }
  /** 按类型显示全部 */
  showByType(type) {
    this._cards.forEach((entry) => {
      if (entry.type === type) this.showCard(entry.id);
    });
  }
  /** 按类型隐藏全部 */
  hideByType(type) {
    this._cards.forEach((entry) => {
      if (entry.type === type) this.hideCard(entry.id);
    });
  }
  /** 按类型切换 */
  toggleByType(type) {
    const hasVisible = Array.from(this._cards.values()).some((e) => e.type === type && e.visible);
    if (hasVisible) {
      this.hideByType(type);
    } else {
      this.showByType(type);
    }
  }
  /** 隐藏所有 click 模式的卡片 */
  hideAll() {
    this._cards.forEach((entry) => {
      if (entry.def.mode === "click" && entry.visible) {
        this.hideCard(entry.id);
      }
    });
  }
  /** 冻结/解冻所有卡片交互（场景切换时使用） */
  freeze() {
    this._frozen = true;
    this._cards.forEach((entry) => {
      entry.domEl.style.display = "none";
    });
  }
  unfreeze() {
    this._frozen = false;
    this._cards.forEach((entry) => {
      entry.domEl.style.display = "";
    });
  }
  /** 获取当前卡片状态（供 UI 层使用） */
  getCardStates() {
    const states = [];
    this._cards.forEach((entry) => {
      states.push({
        id: entry.id,
        type: entry.type,
        visible: entry.visible,
        domElement: entry.domEl,
        objectId: entry.object3D.name || entry.id,
        props: entry.def.props ?? {}
      });
    });
    return states;
  }
  /** 订阅卡片状态变化 */
  onStateChange(cb) {
    this._stateListeners.push(cb);
    return () => {
      const idx = this._stateListeners.indexOf(cb);
      if (idx !== -1) this._stateListeners.splice(idx, 1);
    };
  }
  /**
   * 扫描场景，按 rules 把 mesh 分组并注册卡片。
   * 若规则带 component，会自动注册到本实例的 registry。
   */
  scanAndRegisterCards(scene, rules) {
    if (rules.length === 0) return;
    for (const rule of rules) {
      if (rule.component !== void 0) {
        this.registry.register(rule.type, rule.component);
      }
      const buckets = /* @__PURE__ */ new Map();
      scene.traverse((obj) => {
        const name = obj.name;
        if (!name) return;
        const m = name.match(rule.pattern);
        if (!m) return;
        const id = m[1] ?? name;
        let bucket = buckets.get(id);
        if (!bucket) {
          bucket = [];
          buckets.set(id, bucket);
        }
        bucket.push(obj);
      });
      buckets.forEach((meshes, id) => {
        const anchor = pickAnchor(rule.anchor, meshes);
        const group = { id, meshes, anchor };
        const def = {
          mode: "click",
          interactiveGroup: rule.interactiveGroup ?? "scene",
          anchor,
          offset: rule.offset ?? [0, 0.6, 0],
          props: rule.props?.(group) ?? {}
        };
        this.addCard(id, rule.type, meshes, def);
      });
    }
  }
  /**
   * 物体增删后同步卡片：用各 rule.pattern 在变更 name 上取捕获组 [1] 得到受影响
   * 的卡片分组 id，先 removeCard 再重跑 scanAndRegisterCards（幂等）。
   */
  refreshCards(scene, rules, changedNames) {
    if (rules.length === 0 || changedNames.length === 0) return;
    const affected = /* @__PURE__ */ new Set();
    for (const name of changedNames) {
      for (const rule of rules) {
        const m = name.match(rule.pattern);
        if (m) affected.add(m[1] ?? name);
      }
    }
    affected.forEach((id) => this.removeCard(id));
    this.scanAndRegisterCards(scene, rules);
  }
  /** 每帧渲染（由 App3D 的 post-render 回调调用） */
  render(scene, camera) {
    this.css2DRenderer.render(scene, camera);
  }
  /** resize */
  resize(width, height) {
    this.css2DRenderer.setSize(width, height);
  }
  /** 销毁所有卡片 */
  dispose() {
    if (this._clickHandler) {
      this._domElement.removeEventListener("click", this._clickHandler);
    }
    if (this._pointerDownHandler) {
      this._domElement.removeEventListener("pointerdown", this._pointerDownHandler);
    }
    this._cards.forEach((entry) => {
      entry.css2d.removeFromParent();
      entry.domEl.remove();
    });
    this._cards.clear();
    this.css2DRenderer.domElement.remove();
    this._stateListeners = [];
  }
  // ---- 内部 ----
  _handleClick() {
    if (!this._camera) return;
    const objToEntry = /* @__PURE__ */ new Map();
    const targets = [];
    this._cards.forEach((entry) => {
      entry.targets.forEach((o) => {
        if (!objToEntry.has(o)) {
          objToEntry.set(o, entry);
          targets.push(o);
        }
      });
    });
    if (targets.length === 0) return;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const intersects = this._raycaster.intersectObjects(targets, true);
    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit) {
        const entry = objToEntry.get(hit);
        if (entry) {
          this._onCardClicked(entry);
          return;
        }
        hit = hit.parent;
      }
    } else {
      this.hideAll();
    }
  }
  _onCardClicked(entry) {
    if (entry.def.mode === "click") {
      const group = entry.def.interactiveGroup || entry.type;
      let hasVisibleSibling = false;
      this._cards.forEach((other) => {
        if (other.id === entry.id) return;
        const otherGroup = other.def.interactiveGroup || other.type;
        if (otherGroup === group && other.visible) {
          hasVisibleSibling = true;
          this.hideCard(other.id);
        }
      });
      if (entry.visible && !hasVisibleSibling) {
        this.hideCard(entry.id);
      } else {
        this.showCard(entry.id);
      }
    }
  }
  _notify() {
    const states = this.getCardStates();
    this._stateListeners.forEach((cb) => cb(states));
  }
}
export {
  CardManager
};
