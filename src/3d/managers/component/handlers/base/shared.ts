import type { InteractiveManager } from '@cyc/3d-components/interactive';
import type { LiveDataObject } from '../../../../scene/loader';
import type { ResourceManager } from '../../../../resources';
import type { CameraRig } from '../../../../interaction/CameraRig';
import type { CardManager } from '../../../card/CardManager';

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

  /** 单实例交互底座（createScene3D 注入）：handler 经此 manager.add(model, handlers) 绑定指针事件 */
  interactiveManager?: InteractiveManager;

  /** 相机操作（createScene3D 注入）：handler 点击聚焦用 cameraRig.flyTo 等 */
  cameraRig?: CameraRig;

  /** 卡片管理器（createScene3D 注入）：handler 经此 addCard/removeCard 命令式挂卡片（点击 toggle + 空白 hideAll 由 cardManager scene 订阅自动） */
  cardManager?: CardManager;

  dispose(): void {
    this.source = undefined;
    this.dataMap = undefined;
    // resources 是全局单例引用，跨场景复用，不在此释放
    this.interactiveManager = undefined;
    this.cameraRig = undefined;
    this.cardManager = undefined;
  }
}

/** 全局共享状态单例 */
export const sharedState = new ComponentSharedState();
