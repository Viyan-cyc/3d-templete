/**
 * ResourceManager — 全局唯一的资源门面
 *
 * 持有唯一 AssetCache + 唯一 MaterialManager，统一两种资源模式：
 *  - 模式A（数据内联）：模型 src（asset: / http(s): / hunyuan:）→ cloneModel；
 *    材质 MaterialConfig / LiveDataMaterial → createMaterial
 *  - 模式B（代码注册）：registerModels / registerMaterials 注册 key + themes，
 *    cloneModel(key) 取模型、copy(key) / clone(key) 取主题材质，setTheme 一键换肤
 *
 * 方法名对齐 3d-components（cloneModel / copy / clone / createMaterial / loadTexture），
 * 不另造门面专用名，降低开发者心智成本。
 *
 * handler 通过 ctx.shared.resources 访问；非 handler 代码用 getResourceManager()。
 * AssetCache 全局只 new 一次（本单例持有），MaterialManager 同理。
 */
import * as THREE from 'three';
import {
  AssetCache, type CloneOptions, type ModelLoadOptions, type ModelGenerator,
} from '@cyc/3d-components';
import {
  MaterialManager,
  type MaterialChangeCallback,
  type MaterialConfig,
  type MaterialManagerOptions,
  type Unsubscriber,
} from '@cyc/3d-components/material';
import { createMaterialFromConfig, liveMaterialToConfig } from './createMaterial';
import type { LiveDataMaterial } from '../scene/loader';

/** 模型克隆选项（阴影 + 克隆粒度），透传 AssetCache.cloneModel。 */
export interface CloneModelOpts {
  castShadow?: boolean;
  receiveShadow?: boolean;

  /** 模型克隆选项（透传 AssetCache.cloneModel）：控制几何/材质/贴图是否共享，默认全共享（最省内存）。 */
  clone?: CloneOptions;
}

/** 混元生成器：按 prompt 生成一次，返回 glb bytes 或远程 src。 */
export type HunyuanGenerator = (prompt: string) => Promise<{ bytes?: ArrayBuffer; src?: string }>;

export class ResourceManager {
  private readonly cache = new AssetCache();
  private mm: MaterialManager | null = null;
  private hunyuanGenerator: HunyuanGenerator | null = null;

  // ────────────── 模型（模式A + 模式B 统一） ──────────────

  /** 注册静态模型（key → url），供 src='asset:key' 或 cloneModel(key) 使用。 */
  registerModel(key: string, url: string, options?: ModelLoadOptions): this {
    this.cache.registerModel(key, url, options);
    return this;
  }

  /** 注册按需生成器（非混元场景的通用入口），首次 cloneModel(key) 时调用一次并缓存。 */
  registerModelGenerator(key: string, generator: ModelGenerator, options?: ModelLoadOptions): this {
    this.cache.registerModelGenerator(key, generator, options);
    return this;
  }

  /** 配置混元生成器（src='hunyuan:prompt' 时按 prompt 注册并调用）。 */
  setHunyuanGenerator(fn: HunyuanGenerator): this {
    this.hunyuanGenerator = fn;
    return this;
  }

  /** 后台预加载模型（fire-and-forget，写入缓存）。 */
  preloadModel(src: string): void {
    const key = this.modelKeyOf(src);
    this.ensureModelRegistered(src, key);
    this.cache.preloadModel(key);
  }

  /**
   * 克隆模型并返回可放入场景的实例（对齐 AssetCache.cloneModel）。统一处理三种 src：
   *  - 'asset:example' → 已注册 key example
   *  - 'hunyuan:风力发电机' → 按 prompt 按需注册 generator（调用 hunyuanGenerator）
   *  - 'http(s)://...' 或 '/raw.glb' → 按需注册为 url key
   *
   * AssetCache 去重 + 缓存，cloneModel 多实例安全（SkeletonUtils.clone）。
   */
  async cloneModel(src: string, opts?: CloneModelOpts): Promise<THREE.Object3D> {
    const key = this.modelKeyOf(src);
    this.ensureModelRegistered(src, key);
    const obj = await this.cache.cloneModel(key, opts?.clone);
    this.applyShadows(obj, opts);
    return obj;
  }

  // ────────────── 贴图 ──────────────

  /** 注册静态贴图（key → url），供 loadTexture(key) 或材质 map 取用。 */
  registerTexture(key: string, url: string): this {
    this.cache.registerTexture(key, url);
    return this;
  }

  /** 按已注册 key 加载贴图（AssetCache 去重缓存，多实例复用同一份）。 */
  loadTexture(key: string): Promise<THREE.Texture> {
    return this.cache.loadTexture(key);
  }

  // ────────────── 材质（模式A + 模式B 统一） ──────────────

  /** 配置主题材质（构造唯一 MaterialManager，幂等）。由 registerMaterials 调用。 */
  configureMaterials(options: MaterialManagerOptions): this {
    if (this.mm) {
      return this;
    }
    this.mm = new MaterialManager({ ...options, assetCache: this.cache });
    return this;
  }

  /** 切换主题（原地改写已发出的材质实例，引用不变）。需先 configureMaterials。 */
  setTheme(name: string): Promise<void> {
    if (!this.mm) {
      return Promise.reject(new Error('MaterialManager 未配置：先调 configureMaterials'));
    }
    return this.mm.setTheme(name);
  }

  /** 当前主题名；未配置 MaterialManager 时返回空串。 */
  getTheme(): string {
    return this.mm?.getTheme() ?? '';
  }

  /**
   * 内联材质（模式A）：同步返回 THREE.Material，贴图异步回填同一实例。
   * 用于数据里的 material 字段（MaterialConfig 形态）。对齐 materialFactory.createMaterial。
   */
  createMaterial(def: MaterialConfig): THREE.Material {
    return createMaterialFromConfig(def, this.cache);
  }

  /** 便捷：LiveDataMaterial（数据内联）→ MaterialConfig → 材质；undefined 回落 NormalMaterial。 */
  createMaterialFromLive(def: LiveDataMaterial | undefined): THREE.Material {
    if (!def) {
      return new THREE.MeshNormalMaterial();
    }
    return this.createMaterial(liveMaterialToConfig(def));
  }

  /**
   * 共享材质实例（模式B，对齐 MaterialManager.copy）：多次 copy 同 key 共用同一 material，
   * setTheme 换肤原地改写、引用不变。适合「同款组件统一换肤」。
   * 回调里赋一次 mesh.material 即可。需先 configureMaterials。
   */
  copy(key: string, cb: MaterialChangeCallback): Unsubscriber {
    if (!this.mm) {
      throw new Error('MaterialManager 未配置：先调 configureMaterials');
    }
    return this.mm.copy(key, cb);
  }

  /**
   * 独立材质实例（模式B，对齐 MaterialManager.clone）：各实例材质互不影响（改色不串），
   * 换肤时同样原地改写、引用不变。shareTexture=false 连贴图也独立（可各自 repeat/offset）。
   * 适合「同款组件各自配色」。需先 configureMaterials。
   */
  clone(key: string, cb: MaterialChangeCallback, shareTexture = true): Unsubscriber {
    if (!this.mm) {
      throw new Error('MaterialManager 未配置：先调 configureMaterials');
    }
    return this.mm.clone(key, cb, shareTexture);
  }

  // ────────────── 生命周期 ──────────────

  /** 释放 MaterialManager + AssetCache（共享贴图 / 模型缓存一并释放）。 */
  dispose(): void {
    this.mm?.dispose();
    this.mm = null;
    this.cache.disposeAll();
  }

  // ────────────── 内部 ──────────────

  /** 把 src 归一成 AssetCache 的 model key。 */
  private modelKeyOf(src: string): string {
    if (src.startsWith('asset:')) {
      return src.slice(6);
    }
    if (/^hunyuan:/i.test(src)) {
      return decodeURIComponent(src.replace(/^hunyuan:/i, '')).trim().toLowerCase();
    }
    return src;
  }

  /** 按 src 类型确保 key 已注册（asset: 假定已注册；hunyuan: 按需注册 generator；url 按需注册）。 */
  private ensureModelRegistered(src: string, key: string): void {
    if (/^hunyuan:/i.test(src)) {
      if (!this.cache.hasModelGenerator(key) && !this.cache.hasModel(key)) {
        const gen = this.hunyuanGenerator;
        if (!gen) {
          throw new Error('混元生成器未配置：调 setHunyuanGenerator');
        }
        this.cache.registerModelGenerator(key, async () => {
          const r = await gen(key);
          return r.bytes === undefined ? { src: r.src } : { bytes: r.bytes };
        });
      }
      return;
    }
    if (src.startsWith('asset:')) {
      // 已由 registerModels 注册；未注册则 cloneModel 抛错（符合预期，上层回落兜底）
      return;
    }
    if (!this.cache.hasModel(key)) {
      this.cache.registerModel(key, src);
    }
  }

  /** 应用阴影到模型子树（与旧 models/loader.ts applyShadows 行为一致）。 */
  private applyShadows(obj: THREE.Object3D, opts?: CloneModelOpts): void {
    if (!opts) {
      return;
    }
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        if (opts.castShadow) {
          mesh.castShadow = true;
        }
        if (opts.receiveShadow) {
          mesh.receiveShadow = true;
        }
      }
    });
  }
}

let instance: ResourceManager | null = null;

/** 全局单例：AssetCache / MaterialManager 全程只 new 一次。 */
export const getResourceManager = (): ResourceManager => {
  if (!instance) {
    instance = new ResourceManager();
  }
  return instance;
};
