/**
 * handlers — 业务 handler 统一注册入口
 *
 * 注册「type → handler」表：data 的每个顶层 type 分组对应一个 handler。
 * manager 只对根节点（parentId=null）按 type 分发；handler 拥有整棵子树，通过
 * ctx.getChildren 递归建子节点。新增类型只需：1) 写 handler；2) 在此 registerHandler。
 *
 * 母版保持空注册：所有业务 handler 由 host（octoapp codegen 流水线）按轮生成
 * `handlers/<type>/<type>.ts`，并 overlay 本文件为全量 index.ts。此处空数组 = 初始
 * workspace 无 handler；SCENE_UPDATE 推的分组数据中无注册 handler 的 type 会被 manager 跳过。
 */
import { componentManager, type ComponentHandler } from '../ComponentManager';
import { sharedState } from './base/shared';

export { sharedState, ComponentSharedState } from './base/shared';

/**
 * type → handler 注册表（按 type 名匹配分组 key）。
 * 每个顶层 type 一个 handler；未注册的 type 分组会被 manager 跳过并 warn。
 */
const typeHandlers: Array<{ type: string; handler: ComponentHandler }> = [];

/** 注册所有业务 handler（在 createScene3D 初始化时调用一次，幂等） */
export const registerComponentHandlers = (): void => {
  componentManager.registerHandlers(typeHandlers);
};

/** 释放共享状态（在场景 dispose 时调用） */
export const disposeComponentHandlers = (): void => {
  sharedState.dispose();
};
