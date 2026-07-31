import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
class AssetLoader {
  _gltfLoader;
  _textureLoader;
  _loadingManager;
  constructor(onProgress) {
    this._loadingManager = new THREE.LoadingManager();
    if (onProgress) {
      this._loadingManager.onProgress = onProgress;
    }
    this._gltfLoader = new GLTFLoader(this._loadingManager);
    this._textureLoader = new THREE.TextureLoader(this._loadingManager);
  }
  /** 加载 GLTF/GLB 模型 */
  async loadModel(url) {
    return new Promise((resolve, reject) => {
      this._gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        void 0,
        (error) => reject(error)
      );
    });
  }
  /** 加载贴图 */
  async loadTexture(url) {
    return new Promise((resolve, reject) => {
      this._textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          resolve(texture);
        },
        void 0,
        (error) => reject(error)
      );
    });
  }
  /** 加载 HDR / EXR 环境贴图 */
  async loadEnvMap(url) {
    const rgbeLoader = (await import("three/examples/jsm/loaders/RGBELoader.js")).RGBELoader;
    const loader = new rgbeLoader(this._loadingManager);
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          resolve(texture);
        },
        void 0,
        (error) => reject(error)
      );
    });
  }
  /** 获取加载管理器 */
  get loadingManager() {
    return this._loadingManager;
  }
}
let _instance = null;
function getAssetLoader() {
  if (!_instance) {
    _instance = new AssetLoader();
  }
  return _instance;
}
export {
  AssetLoader,
  getAssetLoader
};
