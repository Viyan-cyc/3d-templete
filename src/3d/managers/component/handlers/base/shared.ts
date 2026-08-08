import type { LiveDataObject } from '../../../../scene/loader';
import type { ResourceManager } from '../../../../resources';

/**
 * shared — handler 间共享的状态容器（通过 ctx.shared 访问）。
 * source 由 createScene3D 设置（归一化前的原数据），handler 可通过 ctx.shared.source 读。
 * dataMap 由 createScene3D 设置（归一化后 id → LiveDataObject），handler 可通过 ctx.shared.dataMap 按 id 查。
 * resources 由 createScene3D step0 注入（全局 ResourceManager 单例引用），handler 通过 ctx.shared.resources 取模型/材质。
 */
export class ComponentSharedState {
  /** 原始数据（归一化前的产品数据，由 createScene3D 设置，handler 通过 ctx.shared.source 读） */
  source?: unknown;

  /** 数据层索引：id → LiveDataObject（归一化后实体的当前数据，update 时维护 set/delete） */
  dataMap?: Map<string, LiveDataObject>;

  /** 资源门面（全局单例引用，createScene3D step0 注入）：handler 经 ctx.shared.resources 取模型/材质 */
  resources!: ResourceManager;

  dispose(): void {
    this.source = undefined;
    this.dataMap = undefined;
    // resources 是全局单例引用，跨场景复用，不在此释放
  }
}

/** 全局共享状态单例 */
export const sharedState = new ComponentSharedState();
