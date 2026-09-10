/**
 * ============================================================
 *  SelectionService — 编辑态场景选择服务（重构自 ScenePicker）
 *
 *  纯 Three.js + InteractiveManager 订阅，不感知 postMessage。
 *  由 createScene3D 在 interactive:true 时构造，Embed.vue 设 onPick 回调
 *  把命中信息 postMessage 给宿主。
 *
 *  与原 ScenePicker 的区别：
 *  - 不自建 Raycaster / 不自挂 canvas 监听 —— 射线检测与点击/拖拽区分
 *    交由单实例 InteractiveManager（注册 scene 一个对象，靠父链展开识别命中）。
 *  - 选择逻辑（__id 父链解析、part/whole 粒度、BoxHelper 高亮）完全保留。
 *
 *  职责：
 *  - enable/disable：向 manager 注册/注销 'selection' 订阅（与 OrbitControls 共存，
 *    靠 manager 的 clickThreshold 区分点击/拖拽）。
 *  - 点击命中 → 从 e.object 沿父子链找 userData.__id（ComponentManager.create 写入）。
 *  - 粒度 'part' 取首个 __id（叶子部件）；'whole' 取最近 __logicalRoot（整体），无则回落叶子。
 *  - 高亮选中物（SelectionVisuals：BoxHelper 包围盒，每帧 update 跟随移动）。
 * ============================================================
 */

import type * as THREE from 'three';
import type { InteractiveManager, IntersectionEvent } from '@a3d/a3d-components/interactive';
import type { SelectionVisuals } from './SelectionVisuals';

/** 拾取结果。id 为空串表示点击空白处（取消选中）。 */
export interface PickInfo {

  /** 命中物体所属的 SceneConfig object id（沿父子链 userData.__id 解析） */
  id: string;

  /** three Object3D.name（通常等于 id） */
  name?: string;

  /** 若命中 3d-components 组件，记录其 name（由 ComponentManager 盖 __componentName） */
  component?: string;

  /** 备用透传字段（当前未填） */
  props?: Record<string, unknown>;

  /** 命中是否为 mesh（有单 material）——宿主据此弹材质编辑器 */
  isMesh?: boolean;

  /** mesh 材质快照（全可编辑字段 + 归一 type），供宿主属性弹窗按类型回显 */
  material?: MaterialSnapshot;

  /** 物体当前 transform 快照（position/rotation/scale）；rotation 弧度（Three 原生），宿主转度显示 */
  transform?: { position?: number[]; rotation?: number[]; scale?: number[] };
}

/**
 * 材质可编辑字段快照（序列化后 postMessage 给宿主回显；全 plain JSON 类型，跨 postMessage 安全）。
 * color/emissive/specular/sheenColor 为 `#rrggbb` string；side/blending 为 number；标量/bool 原样。
 * `type` 为归一 key（运行时 THREE 类名→standard/basic/physical/phong/lambert/toon/points；未知材质 undefined）。
 */
export interface MaterialSnapshot {
  type?: string;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transparent?: boolean;
  side?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  blending?: number;
  fog?: boolean;
  toneMapped?: boolean;
  wireframe?: boolean;
  flatShading?: boolean;
  specular?: string;
  shininess?: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  transmission?: number;
  ior?: number;
  thickness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  size?: number;
  sizeAttenuation?: boolean;
}

/**
 * 运行时 THREE 材质类名 → 归一 key（呈现层映射：决定宿主弹窗显哪组控件）。
 * 仅覆盖可编辑材质；Line/ShaderMaterial 等不在表内 → undefined → 弹窗回落 COMMON-only。
 * 非创建类型（toon/points 仅编辑不创建），故不进 3d-components 的 MaterialType（5 类）。
 */
const MATERIAL_TYPE_KEY: Record<string, string> = {
  MeshStandardMaterial: 'standard',
  MeshBasicMaterial: 'basic',
  MeshPhysicalMaterial: 'physical',
  MeshPhongMaterial: 'phong',
  MeshLambertMaterial: 'lambert',
  MeshToonMaterial: 'toon',
  PointsMaterial: 'points',
};

/** mesh 材质侧像（duck-type，避免 three 类型耦合 + 双 @types/three 冲突） */
interface MaterialLike {
  type?: string;
  color?: { set?: (v: string) => void; getHexString?: () => string };
  emissive?: { set?: (v: string) => void; getHexString?: () => string };
  specular?: { set?: (v: string) => void; getHexString?: () => string };
  sheenColor?: { set?: (v: string) => void; getHexString?: () => string };
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transparent?: boolean;
  side?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  blending?: number;
  fog?: boolean;
  toneMapped?: boolean;
  wireframe?: boolean;
  flatShading?: boolean;
  shininess?: number;
  sheen?: number;
  sheenRoughness?: number;
  transmission?: number;
  ior?: number;
  thickness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  size?: number;
  sizeAttenuation?: boolean;
  needsUpdate?: boolean;
}
interface MeshLike {
  material?: MaterialLike | MaterialLike[];
}

/**
 * 取 mesh 的可编辑材质快照（全字段：颜色→#rrggbb + 标量/布尔/枚举直读 + 归一 type）。
 * 非 mesh（group 无 material）或多材质（数组）返回 undefined → 宿主不弹材质编辑器。
 */
const snapshotMaterial = (obj: THREE.Object3D): MaterialSnapshot | undefined => {
  const mat = (obj as unknown as MeshLike).material;
  if (!mat || Array.isArray(mat)) {
    return undefined;
  }
  const m = mat as unknown as Record<string, unknown>;
  const out: MaterialSnapshot = {};
  const dst = out as unknown as Record<string, unknown>;

  // 归一类型 key（运行时 THREE 类名→standard/.../points；未知材质 undefined）
  if (typeof m.type === 'string') {
    out.type = MATERIAL_TYPE_KEY[m.type];
  }

  // 颜色字段 → #rrggbb（Color 对象的 getHexString）
  const colorOf = (v: unknown): string | undefined => {
    if (v && typeof v === 'object' && typeof (v as { getHexString?: () => string }).getHexString === 'function') {
      return `#${ (v as { getHexString: () => string }).getHexString()}`;
    }
    return undefined;
  };
  for (const k of ['color', 'emissive', 'specular', 'sheenColor'] as const) {
    const hex = colorOf(m[k]);
    if (hex) {
      dst[k] = hex;
    }
  }

  // 标量(number) 与枚举(number，如 side/blending)
  for (const k of [
    'emissiveIntensity', 'roughness', 'metalness', 'opacity', 'side', 'blending',
    'shininess', 'sheen', 'sheenRoughness', 'transmission', 'ior', 'thickness',
    'clearcoat', 'clearcoatRoughness', 'iridescence', 'iridescenceIOR',
    'anisotropy', 'anisotropyRotation', 'size',
  ] as const) {
    if (typeof m[k] === 'number') {
      dst[k] = m[k];
    }
  }
  // 布尔
  for (const k of [
    'transparent', 'depthTest', 'depthWrite', 'fog', 'toneMapped',
    'wireframe', 'flatShading', 'sizeAttenuation',
  ] as const) {
    if (typeof m[k] === 'boolean') {
      dst[k] = m[k];
    }
  }

  return out;
};

/**
 * 选中粒度：
 * - 'part'（默认）：取命中点沿父子链的第一个 __id（叶子部件，如树干/树冠）。
 * - 'whole'：取最近的 __logicalRoot 祖先（用户视角的"一个整体"，如整棵树），
 *   链上无 __logicalRoot 时回落到叶子。由宿主通过 SCENE_PICK_GRANULARITY 切换。
 */
export type SelectionGranularity = 'part' | 'whole';

/** 订阅者标识（用于 InteractiveManager 多订阅者 add/remove） */
const SELECTION_ID = 'selection';

export class SelectionService {

  /** 拾取回调（Embed.vue 设：把 PickInfo postMessage 给宿主） */
  onPick: ((info: PickInfo) => void) | null = null;

  private granularity: SelectionGranularity = 'part';

  /** 绑定的交互底座（attach 时存引用，enable 时用它注册订阅） */
  private manager: InteractiveManager | null = null;

  /** 订阅是否已注册（enable/disable 幂等） */
  private attached = false;

  /** per-click 标志：onClick 会对每个命中触发 N 次，用它保证一次点击只处理一次 */
  private resolved = false;

  private readonly scene: THREE.Scene;
  private readonly visuals: SelectionVisuals;
  private readonly canvas: HTMLCanvasElement;

  /** 高亮可视化实例（供 SCENE_SELECT 大纲点击高亮复用，不经拾取链路） */
  get visualRef(): SelectionVisuals {
    return this.visuals;
  }

  constructor(
    scene: THREE.Scene,
    visuals: SelectionVisuals,
    canvas: HTMLCanvasElement,
  ) {
    this.scene = scene;
    this.visuals = visuals;
    this.canvas = canvas;
  }

  /**
   * 绑定到 InteractiveManager（仅存引用，不自动启用 —— 拾取默认关闭，
   * 由 SCENE_PICK_MODE 触发 enable）。setupInteractive 调用一次。
   */
  attach(manager: InteractiveManager): void {
    this.manager = manager;
  }

  /** 解绑：注销订阅 + 清引用 */
  detach(): void {
    this.disable();
    this.manager = null;
  }

  /** 开启拾取：向 manager 注册 'selection' 订阅 + 十字光标 */
  enable(): void {
    if (!this.manager || this.attached) {
      return;
    }
    this.attached = true;
    this.canvas.style.cursor = 'crosshair';
    this.manager.add(this.scene, {
      // pointerdown 重置 per-click 标志（onClick 按命中数触发 N 次，只处理首次）
      onPointerDown: () => {
        this.resolved = false;
      },
      onClick: (e) => this.handleClick(e),
      onPointerMissed: () => this.handleMissed(),
    }, SELECTION_ID);
  }

  /** 关闭拾取：注销订阅 + 清高亮 + 复位光标 */
  disable(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    this.manager?.remove(this.scene, SELECTION_ID);
    this.canvas.style.cursor = '';
    this.visuals.clear();
  }

  /** 设置选中粒度（'part' | 'whole'），由 postMessage 桥 SCENE_PICK_GRANULARITY 调用 */
  setGranularity(mode: SelectionGranularity): void {
    this.granularity = mode;
  }

  /** 每帧调用（由 createScene3D 渲染循环触发）：让包围盒跟随选中物移动 */
  update(): void {
    this.visuals.update();
  }

  /** 销毁：解绑 + 释放高亮 */
  dispose(): void {
    this.detach();
    this.visuals.dispose();
  }

  // ---- 内部 ----

  /**
   * 点击命中处理：取最近且带 __id 的命中（与原 picker.pickAt 一致）。
   *
   * manager 的 onClick 按命中数触发 N 次（stopPropagation 仅标记不中断，见 interactive 源码），
   * 故用 resolved 标志保证一次点击只处理首次；首次回调的 e.intersections 是按距离排序的全表，
   * 遍历取首个带 __id 者（等价于原 picker 的 for-hit 循环 + return）。
   */
  private handleClick(e: IntersectionEvent): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;

    // 遍历取首个「带 __id 且未锁定」的命中（锁定检查沿父子链查 __locked，锁定整体则子部件也锁）
    const hit = e.intersections.find((i) => {
      const found = this.resolveId(i.object);
      return found !== null && !this.isLocked(found.obj);
    });
    if (hit) {
      const found = this.resolveId(hit.object);
      if (found) {
        this.emitPick(found.obj, found.id);
        return;
      }
    }
    // 有命中但链上无 __id（点中非实体 mesh，如地面/辅助线）→ 取消选中（与原 picker 一致）
    this.handleMissed();
  }

  /** 沿父子链查 __locked —— 任一祖先锁定则视为锁定（锁定整体 = 子部件不可选） */
  private isLocked(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData?.__locked === true) {
        return true;
      }
      cur = cur.parent;
    }
    return false;
  }

  /** 空白点击 / 无 __id 命中：清高亮 + 回传空 id（取消选中） */
  private handleMissed(): void {
    this.visuals.clear();
    this.onPick?.({ id: '' });
  }

  /**
   * 沿父子链解析命中物体的 __id（part/whole 粒度，搬自原 picker L124-153）。
   * @returns 命中实体 { obj, id }；链上无 __id 返回 null。
   */
  private resolveId(hitObj: THREE.Object3D): { obj: THREE.Object3D; id: string } | null {
    let firstIdObj: THREE.Object3D | null = null;
    let firstId = '';
    let cur: THREE.Object3D | null = hitObj;
    while (cur) {
      const id = cur.userData?.__id;
      if (typeof id === 'string' && id !== '') {
        if (!firstIdObj) {
          firstIdObj = cur;
          firstId = id;
        }
        // part 模式：首个 __id 即命中（叶子部件）
        if (this.granularity === 'part') {
          return { obj: cur, id };
        }
        // whole 模式：继续向上找 __logicalRoot（整体），命中则选中整体
        if (this.granularity === 'whole' && cur.userData?.__logicalRoot === true) {
          return { obj: cur, id };
        }
      }
      cur = cur.parent;
    }
    // whole 模式但链上无 __logicalRoot（如点中分区/结构 group 本身）→ 回落叶子
    if (firstIdObj) {
      return { obj: firstIdObj, id: firstId };
    }
    return null;
  }

  /** 高亮 + 回调的统一出口（part/whole 两模式共用） */
  private emitPick(obj: THREE.Object3D, id: string): void {
    this.visuals.highlight(obj);
    const material = snapshotMaterial(obj);
    const info: PickInfo = {
      id,
      name: obj.name || id,
      component:
        typeof obj.userData?.__componentName === 'string' && obj.userData.__componentName !== ''
          ? obj.userData.__componentName
          : undefined,
      isMesh: material !== undefined,
      material,
      transform: {
        position: obj.position.toArray(),
        rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
        scale: obj.scale.toArray(),
      },
    };
    this.onPick?.(info);
  }
}
