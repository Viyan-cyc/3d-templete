class AssetPool {
  _geos = /* @__PURE__ */ new Map();
  _mats = /* @__PURE__ */ new Map();
  /** 获取或创建 Geometry（按 key 缓存） */
  getGeometry(key, factory) {
    let geo = this._geos.get(key);
    if (!geo) {
      geo = factory();
      this._geos.set(key, geo);
    }
    return geo;
  }
  /** 获取或创建 Material（按 key 缓存） */
  getMaterial(key, factory) {
    let mat = this._mats.get(key);
    if (!mat) {
      mat = factory();
      this._mats.set(key, mat);
    }
    return mat;
  }
  /** 释放所有缓存资源 */
  dispose() {
    for (const geo of this._geos.values()) geo.dispose();
    for (const mat of this._mats.values()) mat.dispose();
    this._geos.clear();
    this._mats.clear();
  }
}
export {
  AssetPool
};
