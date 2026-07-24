/**
 * ============================================================
 *  ModelLoader.ts — 外部模型加载 provider 抽象
 *
 *  按 src 前缀路由到不同 provider，顺序即优先级：
 *    assetProvider  (^asset:)   → 本地 modelRegistry + GLTFLoader
 *    httpProvider    (^https?:/) → 远程 + 按扩展名选 loader（阶段1 只 GLTF）
 *    hunyuanProvider (^hunyuan:) → 混元单次生成缓存（占位 throw，见 hunyuan-provider.ts）
 *
 *  所有 provider 返回 THREE.Object3D，内置原型缓存 + clone(true) 多实例复用。
 *  详见 3D_PAGE_DESIGN.md §1.5。
 * ============================================================
 */

import * as THREE from 'three'
import { getAssetLoader } from '../loaders/AssetLoader'
import { resolveModelSrc } from './registry'
import { hunyuanProvider } from './hunyuan'

export interface LoadOpts {
  castShadow?: boolean
  receiveShadow?: boolean
}

export interface ModelProvider {
  /** 是否匹配该 src */
  match(src: string): boolean
  /** 加载为 Object3D（已 clone，调用方可直接 add） */
  load(src: string, opts?: LoadOpts): Promise<THREE.Object3D>
}

/** 原型缓存：url → 解析过的原型 Object3D，多实例 clone(true) 复用，避免重复 parse */
const prototypeCache = new Map<string, THREE.Object3D>()

/** 应用阴影到模型子树 */
function applyShadows(obj: THREE.Object3D, opts?: LoadOpts): void {
  if (!opts) return
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh) {
      if (opts.castShadow) mesh.castShadow = true
      if (opts.receiveShadow) mesh.receiveShadow = true
    }
  })
}

/** asset: 前缀 → 本地 modelRegistry（Vite ?url） */
export const assetProvider: ModelProvider = {
  match: (src) => src.startsWith('asset:'),
  async load(src: string, opts?: LoadOpts): Promise<THREE.Object3D> {
    const url = resolveModelSrc(src) // asset:windmill → modelRegistry[windmill] 的带 hash URL
    let prototype = prototypeCache.get(url)
    if (!prototype) {
      const gltf = await getAssetLoader().loadModel(url)
      prototype = gltf.scene
      prototypeCache.set(url, prototype)
    }
    const obj = prototype.clone(true)
    applyShadows(obj, opts)
    return obj
  },
}

/** http(s): 前缀 → 远程加载，按扩展名选 loader（阶段1 只 GLTF；OBJ/FBX 留 TODO） */
export const httpProvider: ModelProvider = {
  match: (src) => /^https?:\/\//i.test(src),
  async load(src: string, opts?: LoadOpts): Promise<THREE.Object3D> {
    // TODO 阶段后续：按扩展名选 GLTF/OBJ/FBX loader
    //   .gltf/.glb → GLTFLoader, .obj → OBJLoader, .fbx → FBXLoader
    let prototype = prototypeCache.get(src)
    if (!prototype) {
      const gltf = await getAssetLoader().loadModel(src)
      prototype = gltf.scene
      prototypeCache.set(src, prototype)
    }
    const obj = prototype.clone(true)
    applyShadows(obj, opts)
    return obj
  },
}

/** provider 链，顺序即优先级 */
export const providers: ModelProvider[] = [assetProvider, httpProvider, hunyuanProvider]

/**
 * 加载模型：找匹配 provider，无匹配默认 httpProvider。
 * 失败抛错，上层 catch 走 mesh 兜底 + SCENE_ERROR。
 */
export async function loadModel(src: string, opts?: LoadOpts): Promise<THREE.Object3D> {
  const provider = providers.find((p) => p.match(src)) ?? httpProvider
  return provider.load(src, opts)
}

/** 释放原型缓存（场景销毁时用） */
export function disposeModelCache(): void {
  prototypeCache.forEach((obj) => {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      }
    })
  })
  prototypeCache.clear()
}
