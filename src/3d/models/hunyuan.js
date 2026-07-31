import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const cache = /* @__PURE__ */ new Map();
const inFlight = /* @__PURE__ */ new Map();
let gltfLoader = null;
function getGltfLoader() {
  if (!gltfLoader) gltfLoader = new GLTFLoader();
  return gltfLoader;
}
function normalizeKey(src) {
  return decodeURIComponent(src.replace(/^hunyuan:/i, "")).trim().toLowerCase();
}
async function callHunyuanGenerate(_key) {
  console.warn(`[hunyuan-provider] \u6DF7\u5143\u672A\u63A5\u5165\uFF08\u5360\u4F4D\uFF09\uFF0Cprompt="${_key}"\uFF0C\u5C06\u56DE\u843D mesh \u515C\u5E95`);
  throw new Error("HUNYUAN_NOT_IMPLEMENTED");
}
async function parseGlbBytes(bytes) {
  const gltf = await new Promise((resolve, reject) => {
    getGltfLoader().parse(bytes, "", resolve, reject);
  });
  return gltf.scene;
}
async function loadRemoteSrc(src) {
  const gltf = await new Promise((resolve, reject) => {
    getGltfLoader().load(src, resolve, void 0, reject);
  });
  return gltf.scene;
}
async function loadFromDisk(_key) {
  return null;
}
async function saveToDisk(_key, _bytes) {
}
const hunyuanProvider = {
  match: (src) => /^hunyuan:/i.test(src),
  async load(src, _opts) {
    const key = normalizeKey(src);
    const hit = cache.get(key);
    if (hit?.status === "done") {
      return hit.prototype ? hit.prototype.clone(true) : await parseGlbBytes(hit.bytes);
    }
    if (hit?.status === "error") {
      console.log(`[hunyuan-provider] \u547D\u4E2D error \u7F13\u5B58(\u4E0D\u518D\u91CD\u590D\u8C03\u7528\u6DF7\u5143): "${key}"`);
      throw hit.err ?? new Error(`HUNYUAN_FAILED: ${key}`);
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const p = (async () => {
      const diskBytes = await loadFromDisk(key);
      if (diskBytes) {
        const prototype = await parseGlbBytes(diskBytes);
        cache.set(key, { status: "done", bytes: diskBytes, prototype });
        return prototype.clone(true);
      }
      try {
        const result = await callHunyuanGenerate(key);
        const entry = { status: "done" };
        if (result.bytes) {
          entry.bytes = result.bytes;
          entry.prototype = await parseGlbBytes(result.bytes);
          await saveToDisk(key, result.bytes);
        } else if (result.src) {
          entry.src = result.src;
          entry.prototype = await loadRemoteSrc(result.src);
        }
        cache.set(key, entry);
        return entry.prototype ? entry.prototype.clone(true) : new THREE.Group();
      } catch (err) {
        cache.set(key, { status: "error", err });
        throw err;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, p);
    return p;
  }
};
export {
  hunyuanProvider,
  normalizeKey
};
