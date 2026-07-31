import * as THREE from "three";
import * as Core from "@cyc/3d-components/core";
import * as Heat from "@cyc/3d-components/heat";
import * as Material from "@cyc/3d-components/material";
const registry = /* @__PURE__ */ new Map();
let initialized = false;
function registerNamespace(mod, domain) {
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== "function") continue;
    if (!/^[A-Z]/.test(name)) continue;
    const Ctor = value;
    if (!(Ctor.prototype instanceof THREE.Object3D)) {
      continue;
    }
    if (registry.has(name)) {
      console.warn(`[library-bridge] \u7EC4\u4EF6\u540D\u51B2\u7A81: ${name} \u5DF2\u6CE8\u518C\uFF0C\u88AB ${domain} \u8986\u76D6`);
    }
    registry.set(name, Ctor);
  }
}
function initLibraryBridge() {
  if (initialized) return;
  registerNamespace(Core, "core");
  registerNamespace(Heat, "heat");
  registerNamespace(Material, "material");
  initialized = true;
  console.log(`[library-bridge] \u5DF2\u6CE8\u518C ${registry.size} \u4E2A 3d-components \u7EC4\u4EF6:`, Array.from(registry.keys()));
}
function hasComponent(name) {
  if (!initialized) initLibraryBridge();
  return registry.has(name);
}
function resolveComponent(name) {
  if (!initialized) initLibraryBridge();
  return registry.get(name);
}
function createComponentObject(name, options) {
  const Ctor = resolveComponent(name);
  if (!Ctor) return null;
  try {
    const obj = new Ctor(options);
    if (typeof obj.update === "function") {
      obj.userData.__updatable = true;
    }
    return obj;
  } catch (err) {
    console.error(`[library-bridge] \u5B9E\u4F8B\u5316\u7EC4\u4EF6 "${name}" \u5931\u8D25:`, err);
    return null;
  }
}
function listComponents() {
  if (!initialized) initLibraryBridge();
  return Array.from(registry.keys());
}
export {
  createComponentObject,
  hasComponent,
  initLibraryBridge,
  listComponents,
  resolveComponent
};
