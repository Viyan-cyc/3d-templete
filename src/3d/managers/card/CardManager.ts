import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CardComponentRegistry, cardComponentRegistry } from './CardRegistry';
import type {
  CardDef, CardState, CardStateCallback, CardManagerOptions, CardScanRule, CardScanGroup, CardAnchorSpec,
} from './types';

// ---- 锚点选取 ----

const pickAnchor = (spec: CardAnchorSpec | undefined, meshes: THREE.Object3D[]): THREE.Object3D => {
  if (meshes.length === 0) {
    throw new Error('[scanCards] 空分组，无法选锚点');
  }
  if (!spec || spec === 'first') {
    return meshes[0];
  }
  if (spec === 'highest') {
    return meshes.reduce((top, m) => (m.position.y > top.position.y ? m : top), meshes[0]);
  }
  if (typeof spec === 'string') {
    return meshes.find((m) => m.name.endsWith(spec)) ?? meshes[0];
  }
  return spec(meshes);
};

interface CardEntry {
  id: string
  type: string

  /** 卡片定位锚点（css2d 挂在其上） */
  object3D: THREE.Object3D

  /** 参与射线检测的全部关联物体（一棵树/一栋楼的所有零件） */
  targets: THREE.Object3D[]
  def: CardDef
  css2d: CSS2DObject
  domEl: HTMLElement
  visible: boolean
}

/**
 * ============================================================
 *  CardManager — CSS2D 卡片管理器（框架无关）
 *
 *  职责：
 *  - 为绑定了 CardDef 的 3D 物体创建 CSS2DObject（DOM 定位层）
 *  - 管理卡片的显示/隐藏（单个、按类型、全部）
 *  - 处理 click 交互模式（同组互斥显示）
 *  - 暴露 CardState[] 供 UI 层渲染卡片内容
 *  - scanAndRegisterCards / refreshCards 实例方法
 *  - 场景切换时整体隐藏/恢复
 *  - 销毁时清理 DOM
 *
 *  每个实例有自己的 registry（CardComponentRegistry<T>），
 *  多实例互不干扰。单实例可用 CardManager.defaultRegistry。
 * ============================================================
 */
export class CardManager<T = unknown> {
  /** 实例级组件注册表 */
  readonly registry: CardComponentRegistry<T>;

  /** 全局共享注册表（向后兼容 + 单实例场景） */
  static readonly defaultRegistry: CardComponentRegistry<unknown> = cardComponentRegistry;

  readonly css2DRenderer: CSS2DRenderer;
  private _cards: Map<string, CardEntry> = new Map();
  private _stateListeners: Array<CardStateCallback> = [];
  private _raycaster: THREE.Raycaster = new THREE.Raycaster();
  private _mouse: THREE.Vector2 = new THREE.Vector2();
  private _camera: THREE.Camera;
  private _domElement: HTMLElement;
  private _clickThreshold: number;
  private _clickHandler: ((e: MouseEvent) => void) | null = null;
  private _pointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private _pointerDownPos: { x: number; y: number } | null = null;
  private _frozen: boolean = false;

  constructor(options: CardManagerOptions) {
    this.registry = new CardComponentRegistry<T>();

    const {
      container, camera, canvas, clickThreshold = 5,
    } = options;
    this._camera = camera;
    this._domElement = canvas;
    this._clickThreshold = clickThreshold;

    // CSS2D renderer
    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.domElement.style.position = 'absolute';
    this.css2DRenderer.domElement.style.top = '0';
    this.css2DRenderer.domElement.style.left = '0';
    // 让点击穿透到 canvas
    this.css2DRenderer.domElement.style.pointerEvents = 'none';

    // CSS2D 层覆盖在 canvas 上方
    this.css2DRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.css2DRenderer.domElement);

    // 点击交互监听
    // pointerdown 记录起点，click 时判断位移，避免 OrbitControls 拖动旋转松手时误触
    this._pointerDownHandler = (e: PointerEvent) => {
      this._pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    this._clickHandler = (e: MouseEvent) => {
      if (this._frozen) {
        return;
      }
      if (this._pointerDownPos) {
        const dx = e.clientX - this._pointerDownPos.x;
        const dy = e.clientY - this._pointerDownPos.y;
        // 视为拖动，忽略
        if (Math.hypot(dx, dy) > this._clickThreshold) {
          return;
        }
      }
      const rect = canvas.getBoundingClientRect();
      this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._handleClick();
    };
    canvas.addEventListener('pointerdown', this._pointerDownHandler);
    canvas.addEventListener('click', this._clickHandler);
  }

  /**
   * 注册一个卡片
   *
   * 一个卡片可关联一组物体（如一棵树的树干+树冠），点击其中任意一个都会命中本卡片。
   */
  addCard(
    id: string,
    type: string,
    targets: THREE.Object3D | THREE.Object3D[],
    def: CardDef = {},
  ): void {
    if (this._cards.has(id)) {
      console.warn(`[CardManager] 卡片 "${id}" 已存在`);
      return;
    }

    const targetList = Array.isArray(targets) ? targets : [targets];
    if (targetList.length === 0) {
      console.warn(`[CardManager] 卡片 "${id}" 没有关联物体`);
      return;
    }
    const anchor = def.anchor ?? targetList[0];

    const domEl = document.createElement('div');
    domEl.className = `card-3d card-type-${type}`;
    domEl.setAttribute('data-card-id', id);
    domEl.setAttribute('data-card-type', type);
    domEl.style.position = 'absolute';
    // 卡片内部需要响应点击
    domEl.style.pointerEvents = 'auto';
    domEl.style.transition = 'opacity 0.3s ease';

    const css2d = new CSS2DObject(domEl);
    css2d.name = `card-${id}`;
    const off = def.offset ?? [0, 1.5, 0];
    css2d.position.set(off[0] ?? 0, off[1] ?? 1.5, off[2] ?? 0);

    // 挂到锚点上，跟随物体移动
    anchor.add(css2d);

    const alwaysVisible = def.mode === 'always' || def.alwaysVisible === true;
    domEl.style.opacity = alwaysVisible ? '1' : '0';
    domEl.style.visibility = alwaysVisible ? 'visible' : 'hidden';

    const entry: CardEntry = {
      id,
      type,
      object3D: anchor,
      targets: targetList,
      def,
      css2d,
      domEl,
      visible: alwaysVisible,
    };

    this._cards.set(id, entry);
    this._notify();
  }

  /** 移除卡片 */
  removeCard(id: string): void {
    const entry = this._cards.get(id);
    if (!entry) {
      return;
    }
    entry.css2d.removeFromParent();
    entry.domEl.remove();
    this._cards.delete(id);
    this._notify();
  }

  /** 显示卡片（带动画） */
  showCard(id: string): void {
    const entry = this._cards.get(id);
    if (!entry) {
      return;
    }
    entry.visible = true;
    entry.domEl.style.visibility = 'visible';
    entry.domEl.style.opacity = '1';
    this._notify();
  }

  /** 隐藏卡片（带动画） */
  hideCard(id: string): void {
    const entry = this._cards.get(id);
    if (!entry) {
      return;
    }
    entry.visible = false;
    entry.domEl.style.opacity = '0';
    // 动画结束后隐藏
    const onDone = () => {
      entry.domEl.style.visibility = 'hidden';
      entry.domEl.removeEventListener('transitionend', onDone);
    };
    entry.domEl.addEventListener('transitionend', onDone, { once: true });
    this._notify();
  }

  /** 切换卡片显隐 */
  toggleCard(id: string): void {
    const entry = this._cards.get(id);
    if (!entry) {
      return;
    }
    if (entry.visible) {
      this.hideCard(id);
    } else {
      this.showCard(id);
    }
  }

  /** 按类型显示全部 */
  showByType(type: string): void {
    this._cards.forEach((entry) => {
      if (entry.type === type) {
        this.showCard(entry.id);
      }
    });
  }

  /** 按类型隐藏全部 */
  hideByType(type: string): void {
    this._cards.forEach((entry) => {
      if (entry.type === type) {
        this.hideCard(entry.id);
      }
    });
  }

  /** 按类型切换 */
  toggleByType(type: string): void {
    const hasVisible = Array.from(this._cards.values())
      .some((e) => e.type === type && e.visible);
    if (hasVisible) {
      this.hideByType(type);
    } else {
      this.showByType(type);
    }
  }

  /** 隐藏所有 click 模式的卡片 */
  hideAll(): void {
    this._cards.forEach((entry) => {
      if (entry.def.mode === 'click' && entry.visible) {
        this.hideCard(entry.id);
      }
    });
  }

  /** 冻结/解冻所有卡片交互（场景切换时使用） */
  freeze(): void {
    this._frozen = true;
    this._cards.forEach((entry) => {
      entry.domEl.style.display = 'none';
    });
  }

  unfreeze(): void {
    this._frozen = false;
    this._cards.forEach((entry) => {
      entry.domEl.style.display = '';
    });
  }

  /** 获取当前卡片状态（供 UI 层使用） */
  getCardStates(): CardState[] {
    const states: CardState[] = [];
    this._cards.forEach((entry) => {
      states.push({
        id: entry.id,
        type: entry.type,
        visible: entry.visible,
        domElement: entry.domEl,
        objectId: entry.object3D.name || entry.id,
        props: entry.def.props ?? {},
      });
    });
    return states;
  }

  /** 订阅卡片状态变化 */
  onStateChange(cb: CardStateCallback): () => void {
    this._stateListeners.push(cb);
    return () => {
      const idx = this._stateListeners.indexOf(cb);
      if (idx !== -1) {
        this._stateListeners.splice(idx, 1);
      }
    };
  }

  /**
   * 扫描场景，按 rules 把 mesh 分组并注册卡片。
   * 若规则带 component，会自动注册到本实例的 registry。
   */
  scanAndRegisterCards(scene: THREE.Scene, rules: CardScanRule<T>[]): void {
    if (rules.length === 0) {
      return;
    }

    for (const rule of rules) {
      // 自动注册组件（声明式：组件随规则一起定义）
      if (rule.component !== undefined) {
        this.registry.register(rule.type, rule.component);
      }

      // 分组：id → meshes
      const buckets = new Map<string, THREE.Object3D[]>();

      scene.traverse((obj) => {
        const name = obj.name;
        if (!name) {
          return;
        }
        const m = name.match(rule.pattern);
        if (!m) {
          return;
        }
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
        const group: CardScanGroup = { id, meshes, anchor };
        const def: CardDef = {
          mode: 'click',
          interactiveGroup: rule.interactiveGroup ?? 'scene',
          anchor,
          offset: rule.offset ?? [0, 0.6, 0],
          props: rule.props?.(group) ?? {},
        };
        this.addCard(id, rule.type, meshes, def);
      });
    }
  }

  /**
   * 物体增删后同步卡片：用各 rule.pattern 在变更 name 上取捕获组 [1] 得到受影响
   * 的卡片分组 id，先 removeCard 再重跑 scanAndRegisterCards（幂等）。
   */
  refreshCards(scene: THREE.Scene, rules: CardScanRule<T>[], changedNames: string[]): void {
    if (rules.length === 0 || changedNames.length === 0) {
      return;
    }

    const affected = new Set<string>();
    for (const name of changedNames) {
      for (const rule of rules) {
        const m = name.match(rule.pattern);
        if (m) {
          affected.add(m[1] ?? name);
        }
      }
    }
    affected.forEach((id) => this.removeCard(id));

    this.scanAndRegisterCards(scene, rules);
  }

  /** 每帧渲染（由 App3D 的 post-render 回调调用） */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.css2DRenderer.render(scene, camera);
  }

  /** resize */
  resize(width: number, height: number): void {
    this.css2DRenderer.setSize(width, height);
  }

  /** 销毁所有卡片 */
  dispose(): void {
    if (this._clickHandler) {
      this._domElement.removeEventListener('click', this._clickHandler);
    }
    if (this._pointerDownHandler) {
      this._domElement.removeEventListener('pointerdown', this._pointerDownHandler);
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

  private _handleClick(): void {
    if (!this._camera) {
      return;
    }

    // 收集所有卡片关联的物体，建立 object → entry 反查表
    const objToEntry = new Map<THREE.Object3D, CardEntry>();
    const targets: THREE.Object3D[] = [];
    this._cards.forEach((entry) => {
      entry.targets.forEach((o) => {
        if (!objToEntry.has(o)) {
          objToEntry.set(o, entry);
          targets.push(o);
        }
      });
    });

    if (targets.length === 0) {
      return;
    }

    this._raycaster.setFromCamera(this._mouse, this._camera);
    const intersects = this._raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      // 沿父子链找到关联卡片的 entry（兼容嵌套物体）
      let hit: THREE.Object3D | null = intersects[0].object;
      while (hit) {
        const entry = objToEntry.get(hit);
        if (entry) {
          this._onCardClicked(entry);
          return;
        }
        hit = hit.parent;
      }
    } else {
      // 点空白：关闭所有 click 模式卡片
      this.hideAll();
    }
  }

  private _onCardClicked(entry: CardEntry): void {
    if (entry.def.mode === 'click') {
      const group = entry.def.interactiveGroup || entry.type;

      // 同组互斥：隐藏组内其他卡片
      let hasVisibleSibling = false;
      this._cards.forEach((other) => {
        if (other.id === entry.id) {
          return;
        }
        const otherGroup = other.def.interactiveGroup || other.type;
        if (otherGroup === group && other.visible) {
          hasVisibleSibling = true;
          this.hideCard(other.id);
        }
      });

      // 如果当前卡片已可见且没有其他同组卡片可见 → 隐藏
      // 否则 → 显示
      if (entry.visible && !hasVisibleSibling) {
        this.hideCard(entry.id);
      } else {
        this.showCard(entry.id);
      }
    }
    // mode === 'always' 或未设置：点击不切换显隐
  }

  private _notify(): void {
    const states = this.getCardStates();
    this._stateListeners.forEach((cb) => cb(states));
  }
}
