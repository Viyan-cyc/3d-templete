/**
 * ============================================================
 *  hunyuan-provider.ts — 混元 3D 模型生成 provider（单次生成 + 缓存）
 *
 *  核心约束（补充要求1）：每个模型按 prompt 归一化 key 只调用混元一次，
 *  生成结果缓存，后续命中直接复用，绝不重复调用。
 *
 *  三层防重复：
 *    ① normalizeKey 归一大小写/空格/编码差异 → 同一 prompt 只一个 key
 *    ② inFlight Map 让同 key 并发共享一个 promise（防一个场景里同 prompt 多次 / 多次 upsert 并发）
 *    ③ cache Map 存结果（bytes 解析成原型 object，后续 clone(true) 复用，避免重复 parse glb）
 *
 *  阶段1：callHunyuanGenerate 占位 throw（走回落链 → mesh 兜底 + SCENE_ERROR）。
 *  缓存/去重/IndexedDB 接口已就绪，后续接真实混元 API 只补 callHunyuanGenerate。
 *  详见 3D_PAGE_DESIGN.md §1.5。
 * ============================================================
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ModelProvider, LoadOpts } from './loader'

/** 混元生成产物 */
interface HunyuanResult {
  bytes?: ArrayBuffer // 混元返回 glb bytes
  src?: string // 混元返回远程 url（不再缓存 bytes，只记 src）
}

/** 缓存条目 */
interface HunyuanCacheEntry {
  status: 'pending' | 'done' | 'error'
  bytes?: ArrayBuffer
  src?: string
  prototype?: THREE.Object3D // 已解析的原型，多实例 clone 复用
  err?: unknown
}

const cache = new Map<string, HunyuanCacheEntry>()
const inFlight = new Map<string, Promise<THREE.Object3D>>()

let gltfLoader: GLTFLoader | null = null
function getGltfLoader(): GLTFLoader {
  if (!gltfLoader) gltfLoader = new GLTFLoader()
  return gltfLoader
}

/** 归一化 key：hunyuan:风力发电机 → '风力发电机' trim + lowercase */
export function normalizeKey(src: string): string {
  return decodeURIComponent(src.replace(/^hunyuan:/i, '')).trim().toLowerCase()
}

/**
 * 调混元生成 API（占位）。
 * 阶段1：直接 throw，上层 catch 走 mesh 回落。
 * 后续接入：实现真实混元调用，返回 { bytes } 或 { src }。
 */
async function callHunyuanGenerate(_key: string): Promise<HunyuanResult> {
  // TODO: 接入真实混元 API
  //   const res = await fetch('https://hunyuan.../generate', { body: JSON.stringify({ prompt: _key }) })
  //   return { bytes: await res.arrayBuffer() }
  console.warn(`[hunyuan-provider] 混元未接入（占位），prompt="${_key}"，将回落 mesh 兜底`)
  throw new Error('HUNYUAN_NOT_IMPLEMENTED')
}

/** 把 glb bytes 解析成 THREE.Object3D 原型 */
async function parseGlbBytes(bytes: ArrayBuffer): Promise<THREE.Object3D> {
  const gltf: GLTF = await new Promise((resolve, reject) => {
    getGltfLoader().parse(bytes, '', resolve, reject)
  })
  return gltf.scene
}

/** 加载远程 src（混元返回 url 的情况） */
async function loadRemoteSrc(src: string): Promise<THREE.Object3D> {
  // 复用 httpProvider 的加载逻辑（见 ModelLoader），此处简单用 GLTFLoader
  const gltf: GLTF = await new Promise((resolve, reject) => {
    getGltfLoader().load(src, resolve, undefined, reject)
  })
  return gltf.scene
}

/**
 * IndexedDB 持久化接口（阶段1 留空实现，TODO 接混元时补）。
 * 跨会话复用：key=normalizeKey, value=bytes。刷新后命中即跳过混元调用。
 */
async function loadFromDisk(_key: string): Promise<ArrayBuffer | null> {
  // TODO: indexedDB.get('hunyuan-cache', key)
  return null
}
async function saveToDisk(_key: string, _bytes: ArrayBuffer): Promise<void> {
  // TODO: indexedDB.put('hunyuan-cache', key, bytes)
}

/** 混元 provider：match hunyuan: 前缀 */
export const hunyuanProvider: ModelProvider = {
  match: (src) => /^hunyuan:/i.test(src),

  async load(src: string, _opts?: LoadOpts): Promise<THREE.Object3D> {
    const key = normalizeKey(src)

    // ① 已完成：直接复用缓存
    const hit = cache.get(key)
    if (hit?.status === 'done') {
      return hit.prototype ? hit.prototype.clone(true) : await parseGlbBytes(hit.bytes!)
    }
    // ①b 已失败：直接 re-throw 存的错误，不再重复调混元（同会话内防重复消耗配额）
    if (hit?.status === 'error') {
      console.log(`[hunyuan-provider] 命中 error 缓存(不再重复调用混元): "${key}"`)
      throw hit.err ?? new Error(`HUNYUAN_FAILED: ${key}`)
    }

    // ② 进行中：共享同一个 in-flight promise，绝不并发重复调混元
    if (inFlight.has(key)) return inFlight.get(key)!

    // ③ 首次：尝试从磁盘恢复（跨会话）
    const p = (async () => {
      // 先查磁盘
      const diskBytes = await loadFromDisk(key)
      if (diskBytes) {
        const prototype = await parseGlbBytes(diskBytes)
        cache.set(key, { status: 'done', bytes: diskBytes, prototype })
        return prototype.clone(true)
      }

      // 发起一次生成
      try {
        const result = await callHunyuanGenerate(key)
        const entry: HunyuanCacheEntry = { status: 'done' }
        if (result.bytes) {
          entry.bytes = result.bytes
          entry.prototype = await parseGlbBytes(result.bytes) // 解析一次存原型
          await saveToDisk(key, result.bytes) // 落盘跨会话复用
        } else if (result.src) {
          entry.src = result.src
          entry.prototype = await loadRemoteSrc(result.src)
        }
        cache.set(key, entry)
        return entry.prototype ? entry.prototype.clone(true) : new THREE.Group()
      } catch (err) {
        cache.set(key, { status: 'error', err })
        throw err // 上层 resolver catch → 落 mesh 兜底 + SCENE_ERROR
      } finally {
        inFlight.delete(key)
      }
    })()
    inFlight.set(key, p)
    return p
  },
}
