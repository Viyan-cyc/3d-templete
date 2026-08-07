import type { LiveDataObject } from '../../../../scene/loader';

/**
 * shared — handler 间共享的状态容器（通过 ctx.shared 访问）。
 * source 由 createScene3D 设置（归一化前的原数据），handler 可通过 ctx.shared.source 读。
 * dataMap 由 createScene3D 设置（归一化后 id → LiveDataObject），handler 可通过 ctx.shared.dataMap 按 id 查。
 */
export class ComponentSharedState {
  /** 原始数据（归一化前的产品数据，由 createScene3D 设置，handler 通过 ctx.shared.source 读） */
  source?: unknown;

  /** 数据层索引：id → LiveDataObject（归一化后实体的当前数据，update 时维护 set/delete） */
  dataMap?: Map<string, LiveDataObject>;

  dispose(): void {
    this.source = undefined;
    this.dataMap = undefined;
  }
}

/** 全局共享状态单例 */
export const sharedState = new ComponentSharedState();
