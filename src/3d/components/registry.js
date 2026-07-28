class ComponentRegistryImpl {
  _ctors = /* @__PURE__ */ new Map();
  _builders = /* @__PURE__ */ new Map();
  /** 旧版：注册类构造器（ModelDef.componentName 驱动） */
  register(name, ctor) {
    if (this._ctors.has(name)) {
      console.warn(`[ComponentRegistry] "${name}" \u5DF2\u5B58\u5728\uFF0C\u5C06\u88AB\u8986\u76D6\u3002`);
    }
    this._ctors.set(name, ctor);
  }
  registerAll(entries) {
    entries.forEach(([name, ctor]) => this.register(name, ctor));
  }
  get(name) {
    return this._ctors.get(name);
  }
  has(name) {
    return this._ctors.has(name) || this._builders.has(name);
  }
  list() {
    return [...Array.from(this._ctors.keys()), ...Array.from(this._builders.keys())];
  }
  create(name, props) {
    const Ctor = this._ctors.get(name);
    if (!Ctor) {
      console.warn(`[ComponentRegistry] "${name}" \u672A\u6CE8\u518C\uFF0C\u53EF\u7528: ${this.list().join(", ")}`);
      return null;
    }
    return new Ctor(props);
  }
  // ---- 新版：函数构建器（liveData component.type 驱动 + AssetPool 缓存） ----
  /** 注册组件构建函数 */
  registerBuilder(type, builder) {
    if (this._builders.has(type)) {
      console.warn(`[ComponentRegistry] builder "${type}" \u5DF2\u5B58\u5728\uFF0C\u5C06\u88AB\u8986\u76D6`);
    }
    this._builders.set(type, builder);
  }
  /** 按类型创建组件（通过 builder + pool） */
  createByBuilder(type, params, material, pool) {
    const builder = this._builders.get(type);
    if (!builder) {
      console.warn(`[ComponentRegistry] builder "${type}" \u672A\u6CE8\u518C\uFF0C\u53EF\u7528: ${this.list().join(", ")}`);
      return null;
    }
    return builder(params, material, pool);
  }
}
const ComponentRegistry = new ComponentRegistryImpl();
export {
  ComponentRegistry
};
