class CardComponentRegistry {
  _map = /* @__PURE__ */ new Map();
  /** 注册卡片类型对应的组件 */
  register(type, component) {
    this._map.set(type, component);
  }
  /** 获取卡片类型对应的组件 */
  get(type) {
    return this._map.get(type);
  }
  /** 是否已注册某卡片类型 */
  has(type) {
    return this._map.has(type);
  }
  /** 移除已注册的卡片类型 */
  unregister(type) {
    this._map.delete(type);
  }
}
const cardComponentRegistry = new CardComponentRegistry();
export {
  CardComponentRegistry,
  cardComponentRegistry
};
