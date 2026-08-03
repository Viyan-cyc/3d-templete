/**
 * shared — handler 间共享的状态容器（通过 ctx.shared 访问）。
 * 当前为空占位：待真正有跨 handler 状态需求时再加字段。dispose 供场景 teardown 调用。
 */
export class ComponentSharedState {
  dispose(): void {
    // 占位：当前无字段需释放
  }
}

/** 全局共享状态单例 */
export const sharedState = new ComponentSharedState()
