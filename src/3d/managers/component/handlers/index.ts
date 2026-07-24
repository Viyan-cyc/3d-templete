/**
 * handlers — 业务 handler 统一注册入口
 *
 * 新增业务类型只需：
 *   1. 在本目录下新建 xxx.ts，导出 xxxHandler
 *   2. 在下方 import + registerAll 中加一行
 *   3. 不需要修改 ComponentManager 或其他框架代码
 */

import { componentManager } from '../ComponentManager'
import { sharedState } from './shared'
import { deviceHandler } from './device'
import { treeHandler } from './tree'
import { wallHandler } from './wall'

export { sharedState, ComponentSharedState } from './shared'

/** 注册所有业务 handler（在 createScene3D 初始化时调用一次） */
export function registerComponentHandlers(): void {
  componentManager.registerAll([
    ['device', deviceHandler],
    ['tree', treeHandler],
    ['Wall', wallHandler],
    // 新增类型在这里加一行即可
  ])
}

/** 释放共享状态（在场景 dispose 时调用） */
export function disposeComponentHandlers(): void {
  sharedState.dispose()
}
