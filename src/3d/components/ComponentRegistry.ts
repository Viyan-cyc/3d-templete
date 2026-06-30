import type * as THREE from 'three'

/**
 * ============================================================
 *  ComponentCtor — 组件构造器约定
 *
 *  任何符合此签名的类都可以注册：
 *    constructor(props?: Record<string, unknown>): THREE.Object3D
 *
 *  npm 包不需要实现任何接口，构造函数接受可选 props 即可。
 * ============================================================
 */
export type ComponentCtor = new (props?: Record<string, unknown>) => THREE.Object3D

class ComponentRegistryImpl {
  private _ctors: Map<string, ComponentCtor> = new Map()

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
    return this._ctors.has(name)
  }

  list(): string[] {
    return Array.from(this._ctors.keys())
  }

  create(name: string, props?: Record<string, unknown>): THREE.Object3D | null {
    const Ctor = this._ctors.get(name)
    if (!Ctor) {
      console.warn(`[ComponentRegistry] "${name}" 未注册，可用: ${this.list().join(', ')}`)
      return null
    }
    return new Ctor(props)
  }
}

export const ComponentRegistry = new ComponentRegistryImpl()
