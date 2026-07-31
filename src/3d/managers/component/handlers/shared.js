import * as THREE from "three";
class ComponentSharedState {
  // ── 颜色映射（可运行时修改）──
  /** 设备状态 → 颜色 */
  deviceStatusColors = {
    running: "#00ff88",
    stopped: "#ff4444",
    warning: "#ffaa00",
    offline: "#666666"
  };
  /** 季节 → 颜色 */
  seasonColors = {
    spring: "#4caf50",
    summer: "#2e7d32",
    autumn: "#ff8f00",
    winter: "#90a4ae"
  };
  // ── 材质缓存（同类材质复用，避免 GPU 冗余）──
  /** 缓存的 MeshStandardMaterial，key = 颜色+粗糙度+金属度 */
  _materialCache = /* @__PURE__ */ new Map();
  /** 获取或创建缓存的 MeshStandardMaterial */
  getMaterial(color, roughness = 0.5, metalness = 0) {
    const key = `${color}|${roughness}|${metalness}`;
    let mat = this._materialCache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this._materialCache.set(key, mat);
    }
    return mat;
  }
  // ── 跨 handler 状态 ──
  /** 当前选中的实体 id（可由 device handler 写、其他 handler 读） */
  selectedComponentId = null;
  /** 自由格式的 key-value 存储，handler 可随意读写 */
  store = {};
  // ── 资源引用 ──
  /** AssetPool 引用（由 createScene3D 注入，handler 可用来缓存 Geometry/Material） */
  assetPool = null;
  // ── 生命周期 ──
  /** 释放所有缓存材质 */
  dispose() {
    for (const mat of this._materialCache.values()) {
      mat.dispose();
    }
    this._materialCache.clear();
    this.store = {};
  }
}
const sharedState = new ComponentSharedState();
export {
  ComponentSharedState,
  sharedState
};
