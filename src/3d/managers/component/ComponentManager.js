class ComponentManager {
  _handlers = /* @__PURE__ */ new Map();
  /** 注册一个业务类型的处理器 */
  register(type, handler) {
    if (this._handlers.has(type)) {
      console.warn(`[ComponentManager] "${type}" \u5DF2\u6CE8\u518C\uFF0C\u5C06\u88AB\u8986\u76D6`);
    }
    this._handlers.set(type, handler);
  }
  /** 批量注册 */
  registerAll(entries) {
    entries.forEach(([type, handler]) => this.register(type, handler));
  }
  /**
   * 从 LiveDataObject 解析出业务类型 key。
   * 优先级：component.name > component.type，与 resolver 链一致。
   */
  resolveType(data) {
    return data.component?.name ?? data.component?.type ?? null;
  }
  /**
   * 从 Object3D 的 userData 读取创建时存的 component type（供 delete 使用）。
   * delete 阶段没有 LiveDataObject，只有 id 列表，因此依赖创建时写入的标记。
   */
  resolveTypeFromObj(obj) {
    return obj.userData.__componentType ?? null;
  }
  /**
   * 分派创建：优先走 handler，null 则回落 defaultFn。
   * 创建成功后自动在 userData.__componentType 写入类型标记。
   */
  create(data, ctx, defaultFn) {
    const type = this.resolveType(data);
    if (type) {
      const handler = this._handlers.get(type);
      if (handler?.create) {
        const result2 = handler.create(data, ctx);
        if (result2 !== null) {
          result2.userData.__componentType = type;
          return result2;
        }
      }
    }
    const result = defaultFn(data);
    if (result && type) {
      result.userData.__componentType = type;
    }
    return result;
  }
  /**
   * 分派更新：优先走 handler，返回 true 表示已处理，否则回落 defaultFn。
   */
  update(obj, data, ctx, defaultFn) {
    const type = this.resolveType(data) ?? this.resolveTypeFromObj(obj);
    if (type) {
      const handler = this._handlers.get(type);
      if (handler?.update?.(obj, data, ctx)) return;
    }
    defaultFn(obj, data);
  }
  /**
   * 分派删除：优先走 handler，返回 true 表示已处理，否则回落 defaultFn。
   */
  delete(obj, ctx, defaultFn) {
    const type = this.resolveTypeFromObj(obj);
    if (type) {
      const handler = this._handlers.get(type);
      if (handler?.delete?.(obj, ctx)) return;
    }
    defaultFn(obj);
  }
  /** 是否已注册某类型 */
  has(type) {
    return this._handlers.has(type);
  }
  /** 列出所有已注册的类型名（调试用） */
  list() {
    return [...this._handlers.keys()];
  }
}
const componentManager = new ComponentManager();
export {
  ComponentManager,
  componentManager
};
