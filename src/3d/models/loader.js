import { getAssetLoader } from "../loaders/AssetLoader";
import { resolveModelSrc } from "./registry";
import { hunyuanProvider } from "./hunyuan";
const prototypeCache = /* @__PURE__ */ new Map();
function applyShadows(obj, opts) {
  if (!opts) return;
  obj.traverse((child) => {
    const mesh = child;
    if (mesh.isMesh) {
      if (opts.castShadow) mesh.castShadow = true;
      if (opts.receiveShadow) mesh.receiveShadow = true;
    }
  });
}
const assetProvider = {
  match: (src) => src.startsWith("asset:"),
  async load(src, opts) {
    const url = resolveModelSrc(src);
    let prototype = prototypeCache.get(url);
    if (!prototype) {
      const gltf = await getAssetLoader().loadModel(url);
      prototype = gltf.scene;
      prototypeCache.set(url, prototype);
    }
    const obj = prototype.clone(true);
    applyShadows(obj, opts);
    return obj;
  }
};
const httpProvider = {
  match: (src) => /^https?:\/\//i.test(src),
  async load(src, opts) {
    let prototype = prototypeCache.get(src);
    if (!prototype) {
      const gltf = await getAssetLoader().loadModel(src);
      prototype = gltf.scene;
      prototypeCache.set(src, prototype);
    }
    const obj = prototype.clone(true);
    applyShadows(obj, opts);
    return obj;
  }
};
const providers = [assetProvider, httpProvider, hunyuanProvider];
async function loadModel(src, opts) {
  const provider = providers.find((p) => p.match(src)) ?? httpProvider;
  return provider.load(src, opts);
}
function disposeModelCache() {
  prototypeCache.forEach((obj) => {
    obj.traverse((child) => {
      const mesh = child;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  });
  prototypeCache.clear();
}
export {
  assetProvider,
  disposeModelCache,
  httpProvider,
  loadModel,
  providers
};
