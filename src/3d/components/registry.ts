import * as THREE from 'three'
import type { AssetPool } from './AssetPool'

/**
 * ============================================================
 *  ComponentCtor — 旧版类构造器约定（ModelDef.componentName 驱动）
 *  任何符合此签名的类都可以注册：
 *    constructor(props?: Record<string, unknown>): THREE.Object3D
 * ============================================================
 */
export type ComponentCtor = new (props?: Record<string, unknown>) => THREE.Object3D

/**
 * ComponentBuilder — 新版函数构建器约定（liveData component.type 驱动）
 * 支持 AssetPool 缓存，适合大量组件复用场景。
 */
export type ComponentBuilder = (
  params: Record<string, number | string>,
  material: THREE.Material,
  pool: AssetPool,
) => THREE.Group

class ComponentRegistryImpl {
  private _ctors: Map<string, ComponentCtor> = new Map()
  private _builders: Map<string, ComponentBuilder> = new Map()

  /** 旧版：注册类构造器（ModelDef.componentName 驱动） */
  register(name: string, ctor: ComponentCtor): void {
    if (this._ctors.has(name)) {
      console.warn(`[ComponentRegistry] "${name}" 已存在，将被覆盖。`)
    }
    this._ctors.set(name, ctor)
  }

  registerAll(entries: Array<[string, ComponentCtor]>): void {
    entries.forEach(([name, ctor]) => this.register(name, ctor))
  }

  get(name: string): ComponentCtor | undefined {
    return this._ctors.get(name)
  }

  has(name: string): boolean {
    return this._ctors.has(name) || this._builders.has(name)
  }

  list(): string[] {
    return [...Array.from(this._ctors.keys()), ...Array.from(this._builders.keys())]
  }

  create(name: string, props?: Record<string, unknown>): THREE.Object3D | null {
    const Ctor = this._ctors.get(name)
    if (!Ctor) {
      console.warn(`[ComponentRegistry] "${name}" 未注册，可用: ${this.list().join(', ')}`)
      return null
    }
    return new Ctor(props)
  }

  // ---- 新版：函数构建器（liveData component.type 驱动 + AssetPool 缓存） ----

  /** 注册组件构建函数 */
  registerBuilder(type: string, builder: ComponentBuilder): void {
    if (this._builders.has(type)) {
      console.warn(`[ComponentRegistry] builder "${type}" 已存在，将被覆盖`)
    }
    this._builders.set(type, builder)
  }

  /** 按类型创建组件（通过 builder + pool） */
  createByBuilder(
    type: string,
    params: Record<string, number | string>,
    material: THREE.Material,
    pool: AssetPool,
  ): THREE.Group | null {
    const builder = this._builders.get(type)
    if (!builder) {
      console.warn(`[ComponentRegistry] builder "${type}" 未注册，可用: ${this.list().join(', ')}`)
      return null
    }
    return builder(params, material, pool)
  }
}

export const ComponentRegistry = new ComponentRegistryImpl()
