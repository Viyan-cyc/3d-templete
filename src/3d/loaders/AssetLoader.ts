import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * 资源加载器 —— 封装 GLTF / 纹理加载
 * 支持从 src/assets/ 或 public/ 加载资源
 */
export class AssetLoader {
  private _gltfLoader: GLTFLoader
  private _textureLoader: THREE.TextureLoader
  private _loadingManager: THREE.LoadingManager

  constructor(onProgress?: (url: string, loaded: number, total: number) => void) {
    this._loadingManager = new THREE.LoadingManager()
    if (onProgress) {
      this._loadingManager.onProgress = onProgress
    }
    this._gltfLoader = new GLTFLoader(this._loadingManager)
    this._textureLoader = new THREE.TextureLoader(this._loadingManager)
  }

  /** 加载 GLTF/GLB 模型 */
  async loadModel(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this._gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (error) => reject(error),
      )
    })
  }

  /** 加载贴图 */
  async loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this._textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace
          resolve(texture)
        },
        undefined,
        (error) => reject(error),
      )
    })
  }

  /** 加载 HDR / EXR 环境贴图 */
  async loadEnvMap(url: string): Promise<THREE.Texture> {
    const rgbeLoader = (await import('three/examples/jsm/loaders/RGBELoader.js')).RGBELoader
    const loader = new rgbeLoader(this._loadingManager)
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping
          resolve(texture)
        },
        undefined,
        (error) => reject(error),
      )
    })
  }

  /** 获取加载管理器 */
  get loadingManager(): THREE.LoadingManager {
    return this._loadingManager
  }
}

/** 单例 */
let _instance: AssetLoader | null = null
export function getAssetLoader(): AssetLoader {
  if (!_instance) {
    _instance = new AssetLoader()
  }
  return _instance
}
