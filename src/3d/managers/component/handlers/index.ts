/**
 * handlers — 业务 handler 统一注册入口
 *
 * 注册「创建 kind 链」：data → manager 按 kind 链优先级分派到 handler → handler 调
 * new XxxComponent 实例化组件。新增类型只需：1) 写组件类；2) 写 handler；3) 在链里加一项。
 */
import { componentManager, type CreationEntry } from '../ComponentManager';
import { sharedState } from './base/shared';
import { registerAllComponents, hasComponent } from '../../../components';
import { libraryHandler } from './base/library';
import { rackHandler } from './warehouse/rack';
import { modelHandler } from './base/model';
import { primitiveHandler } from './base/primitive';
import { groupHandler } from './base/group';

export { sharedState, ComponentSharedState } from './base/shared';

/**
 * 创建 kind 链（按优先级）：
 *   library(3d-components) > rack(内置垂域) > model(src) > primitive(geometry) > group
 * match 命中且 create 返回非 null 者胜出；返回 null 则回落下一项。
 */
const creationChain: CreationEntry[] = [
  {
    key: 'library',
    match: (d) => {
      const name = d.component?.name;
      return name ? hasComponent(name) : false;
    },
    handler: libraryHandler,
  },
  { key: 'rack', match: (d) => d.component?.type === 'rack', handler: rackHandler },
  { key: 'model', match: (d) => Boolean(d.src), handler: modelHandler },
  { key: 'primitive', match: (d) => Boolean(d.geometry) || d.type === 'mesh', handler: primitiveHandler },
  { key: 'group', match: (d) => d.type === 'group', handler: groupHandler },
];

/** 注册所有业务 handler + 组件底层注册表（在 createScene3D 初始化时调用一次，幂等） */
export const registerComponentHandlers = (): void => {
  registerAllComponents();
  componentManager.registerCreationChain(creationChain);
};

/** 释放共享状态（在场景 dispose 时调用） */
export const disposeComponentHandlers = (): void => {
  sharedState.dispose();
};
