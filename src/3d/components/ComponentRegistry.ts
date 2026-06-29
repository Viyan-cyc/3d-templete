import type { I3DComponent } from './I3DComponent'

/**
 * ============================================================
 *  ComponentRegistry — 3D 组件注册中心
 *
 *  外部可通过 register() 注册自定义组件（npm 包或本地）。
 *  场景初始化时，遇到 type: 'component' 的 ModelDef，
 *  会从此注册表中查找对应组件并调用其 setup()。
 * ============================================================
 */
class ComponentRegistryImpl {
  private _components: Map<string, I3DComponent> = new Map()

  /** 注册一个组件 */
  register(component: I3DComponent): void {
    if (this._components.has(component.name)) {
      console.warn(`[ComponentRegistry] 组件 "${component.name}" 已存在，将被覆盖。`)
    }
    this._components.set(component.name, component)
  }

  /** 批量注册 */
  registerAll(components: I3DComponent[]): void {
    components.forEach((c) => this.register(c))
  }

  /** 获取组件 */
  get(name: string): I3DComponent | undefined {
    return this._components.get(name)
  }

  /** 检查组件是否存在 */
  has(name: string): boolean {
    return this._components.has(name)
  }

  /** 列出所有已注册的组件名 */
  list(): string[] {
    return Array.from(this._components.keys())
  }
}

/** 全局单例 */
export const ComponentRegistry = new ComponentRegistryImpl()
