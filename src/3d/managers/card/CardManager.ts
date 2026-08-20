import type * as THREE from 'three';
import type { IntersectionEvent, InteractiveManager } from '@a3d/a3d-components/interactive';
import { CardComponentRegistry, cardComponentRegistry } from './CardRegistry';
import { Css2dCard } from '../../components/base';
import type {
  CardDef, CardState, CardStateCallback, CardScanRule, CardScanGroup, CardAnchorSpec,
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
  css2d: THREE.Object3D
  domEl: HTMLElement
  visible: boolean
}

/** 场景订阅标识（用于 InteractiveManager 多订阅者 add/remove） */
const CARD_SCENE_ID = 'card-scene';

/**
 * ============================================================
 *  CardManager — CSS2D 卡片管理器（框架无关）
 *
 *  职责：
 *  - 为绑定了 CardDef 的 3D 物体创建 CSS2DObject（DOM 定位层，经 Css2dCard）
 *  - 管理卡片的显示/隐藏（单个、按类型、全部）
 *  - 处理 click 交互模式（同组互斥显示）
 *  - 暴露 CardState[] 供 UI 层渲染卡片内容
 *  - scanAndRegisterCards / refreshCards 实例方法
 *  - 场景切换时整体隐藏/恢复
 *  - 销毁时清理 DOM
 *
 *  交互底座：不自建 Raycaster / 不自挂 canvas 监听。点击检测交由单实例
 *  InteractiveManager —— 在 scene 上注册一个 'card-scene' 订阅（onClick +
 *  onPointerMissed），onClick 时取最近命中沿父链找卡片（与原 _handleClick
 *  完全一致：只看 intersects[0]，链上无卡片则不动作）。编辑态（editMode）
 *  下 onClick 直接返回，只显示 always 卡片、不触发 click-toggle，避免与
 *  SelectionService 冲突。
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

  private _cards: Map<string, CardEntry> = new Map();
  private _stateListeners: Array<CardStateCallback> = [];
  private _frozen: boolean = false;

  /** 交互底座绑定（bindInteraction 后可用；未绑定则无点击响应，仅常显卡片） */
  private _manager: InteractiveManager | null = null;
  private _scene: THREE.Scene | null = null;
  private _editMode: boolean = false;
  private _sceneBound: boolean = false;

  /** per-click 标志：scene 的 onClick 会对每个命中触发 N 次，用它保证一次点击只处理首次 */
  private _clickResolved: boolean = false;

  constructor() {
    this.registry = new CardComponentRegistry<T>();
  }

  /**
   * 绑定交互底座：在 scene 上注册 'card-scene' 订阅（onClick + onPointerMissed）。
   *
   * @param editMode 编辑态（interactive:true）下为 true：onClick 直接返回，
   *   只显示 always 卡片、不触发 click-toggle，避免与 SelectionService 冲突。
   *   运行态为 false：点物体弹/收卡片、点空白 hideAll。
   */
  bindInteraction(manager: InteractiveManager, scene: THREE.Scene, editMode: boolean): void {
    this._manager = manager;
    this._scene = scene;
    this._editMode = editMode;
    manager.add(scene, {
      // pointerdown 重置 per-click 标志（scene 是任意命中的祖先，必触发一次）
      onPointerDown: () => {
        this._clickResolved = false;
      },
      onClick: (e) => this._handleSceneClick(e),
      onPointerMissed: (e) => {
        // 冻结态（场景切换中）不响应；仅响应 click（pointerup）路径的 missed：
        // _fireClickMissed 已按 clickThreshold 过滤拖拽；pointerdown 路径的 missed
        // 不带阈值，跳过以免拖拽空白时误隐藏卡片。
        if (this._frozen || e.nativeEvent.type === 'pointerdown') {
          return;
        }
        this.hideAll();
      },
    }, CARD_SCENE_ID);
    this._sceneBound = true;
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
  ): HTMLElement | undefined {
    if (this._cards.has(id)) {
      console.warn(`[CardManager] 卡片 "${id}" 已存在`);
      return undefined;
    }

    const targetList = Array.isArray(targets) ? targets : [targets];
    if (targetList.length === 0) {
      console.warn(`[CardManager] 卡片 "${id}" 没有关联物体`);
      return undefined;
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

    // CSS2D 锚点：Css2dCard 包装 domEl，add 到锚点物体（渲染由 createScene3D 的 CSS2DRenderer 统一处理）
    const css2d = new Css2dCard(domEl, { offset: def.offset ?? [0, 1.5, 0] });
    css2d.name = `card-${id}`;
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
    return domEl;
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

  /** 销毁卡片 DOM + 注销场景订阅（CSS2DRenderer 由 createScene3D 自行销毁） */
  dispose(): void {
    if (this._manager && this._scene && this._sceneBound) {
      this._manager.remove(this._scene, CARD_SCENE_ID);
      this._sceneBound = false;
    }
    this._cards.forEach((entry) => {
      entry.css2d.removeFromParent();
      entry.domEl.remove();
    });
    this._cards.clear();
    this._stateListeners = [];
  }

  // ---- 内部 ----

  /**
   * scene 的 onClick 处理：取最近命中沿父链找卡片（搬自原 _handleClick）。
   *
   * manager 的 onClick 按命中数触发 N 次（stopPropagation 仅标记不中断，见
   * interactive 源码），故用 _clickResolved 标志保证一次点击只处理首次；
   * 首次回调的 e.intersections 按距离排序，只看 [0]（最近命中）的父链 ——
   * 与原 _handleClick「intersects[0] 沿父链找 entry，找不到不动作」完全一致。
   * 编辑态直接返回（只显 always 卡片，不 click-toggle）。
   */
  private _handleSceneClick(e: IntersectionEvent): void {
    if (this._frozen || this._editMode || this._clickResolved) {
      return;
    }
    this._clickResolved = true;

    if (e.intersections.length === 0) {
      return;
    }

    // 构建 object → entry 反查表（per-click，与原 _handleClick 一致）
    const objToEntry = new Map<THREE.Object3D, CardEntry>();
    this._cards.forEach((entry) => {
      entry.targets.forEach((o) => {
        if (!objToEntry.has(o)) {
          objToEntry.set(o, entry);
        }
      });
    });

    // 最近命中沿父链找卡片（兼容嵌套物体）
    let cur: THREE.Object3D | null = e.intersections[0].object;
    while (cur) {
      const entry = objToEntry.get(cur);
      if (entry) {
        this._onCardClicked(entry);
        return;
      }
      cur = cur.parent;
    }
    // 链上无卡片（点中非卡片物体）→ 不动作（与原实现一致：不 hideAll、不 toggle）
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
