/**
 * adapters/types — 产品数据归一化适配层类型定义
 *
 * 通用树遍历归一化器 + 可配置类型映射表，把任意产品数据树（数组/对象任意嵌套）
 * 投影成扁平 LiveDataObject[]，喂现有 buildObjects/ComponentManager 管线。
 *
 * 核心规则：实体节点都有 `id`，参数对象（path/position/info）都没有 `id`。
 * 因此"有 id 的对象 = 实体"是通用识别规则，无需领域定制判断。
 *
 * 投影不替换：原数据 source 原样保留，objects[] 仅是给渲染管线的视图。
 */
import type { LiveDataObject } from '../loader';

/**
 * normalizer 产出的渲染投影 + 原数据保留。
 * - source：原始 data 引用，业务侧 data.racks.length 等照用（投影不替换）
 * - objects：渲染视图，喂 buildObjects（按 id 的活索引由 createScene3D 派生为 sharedState.dataMap）
 */
export interface SceneModel {
  source: unknown;
  objects: LiveDataObject[];
}

/**
 * 单个产品格式的适配器契约。
 * match 按数据形状判断是否负责；normalize 投影成 SceneModel（不修改原 data）。
 */
export interface Adapter {
  name: string;
  match: (data: unknown) => boolean;
  normalize: (data: unknown) => SceneModel;
}

/** 注册表一项（与 Adapter 同义） */
export type AdapterEntry = Adapter;

/** 原始实体节点（unknown 收窄由 adapter 内部做，options/params 函数按此入参） */
export type EntityNode = Record<string, unknown>;

/**
 * 类型映射：实体类型 key（字段名）→ 渲染方式。
 * typeKey 由遍历器按实体在父结构中的字段名传入（buildings/floors/walls/door/...）。
 */
export type TypeMapping =

  /** 容器 → type='group'（building/floor 等纯容器） */
  | { kind: 'group' }

  /**
   * 组件 → type='component'。适配层按 name 自动判断走哪个 handler：
   *   - name 在 library-bridge 注册（库组件 Grid/Wall/...）→ component:{name, params}（libraryHandler 把 params 当 options 传库）
   *   - 否则（应用内置 builder 如 rack）→ component:{type: name, params}（rackHandler 等）
   * 开发者只配 name + params（参数提取函数），不用区分 library/component。统一用 params。
   */
  | { kind: 'component'; name: string; params?: (node: EntityNode) => Record<string, unknown> }

  /** 模型资源 → type='model', src（asset:/http:/hunyuan:） */
  | { kind: 'src'; src: (node: EntityNode) => string }

  /** 不产出（纯参数容器，跳过） */
  | { kind: 'skip' };

/** 类型映射表：typeKey → TypeMapping。领域可配置，未注册 key 回落 group。 */
export type TypeRegistry = Record<string, TypeMapping>;
