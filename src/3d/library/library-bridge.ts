/**
 * ============================================================
 *  library-bridge.ts — 把 @cyc/3d-components 的静态导出包成 name→Ctor 映射
 *
 *  3d-components 组件是 Three.js Object3D 子类（class），通过 `new Component(options)` 构造，
 *  options 是对象（继承 ComponentOptions）。本 bridge 维护 name→Ctor 映射，供 JSON 解析器
 *  按 component.name 字符串加载（resolver 链最高优先级）。
 *
 *  阶段1：只处理 Object3D 子类组件（BaseGroup/Grid/Wall/HeatMesh/Sky 等）。
 *  Material 子类（ShinyMaterial/MeshReflectorMaterial）不是 Object3D，此处不处理（留 TODO）。
 *
 *  引用方式（dev）：vite.config.ts alias 直指 ../3d-components/src。
 *  生产阶段改 npm install @cyc/3d-components 后移除 alias。
 * ============================================================
 */

import * as THREE from 'three'
import * as Core from '@cyc/3d-components/core'
import * as Heat from '@cyc/3d-components/heat'
import * as Material from '@cyc/3d-components/material'

/** 组件构造器类型：new (options?) => THREE.Object3D */
type ComponentCtor = new (options?: Record<string, unknown>) => THREE.Object3D

/** name → Ctor 映射 */
const registry = new Map<string, ComponentCtor>()

/** 是否已初始化（避免重复 register） */
let initialized = false

/**
 * 注册一个命名空间导出里所有"首字母大写的 class"。
 * 筛选条件：typeof === 'function' 且 key 首字母大写（排除 Util 等非 class 导出）。
 * 进一步过滤：仅 Object3D 子类（Material 类如 ShinyMaterial 被排除，阶段1 不处理）。
 */
function registerNamespace(mod: Record<string, unknown>, domain: string): void {
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== 'function') continue
    // 首字母大写 = class 候选（排除 default/__esModule 等）
    if (!/^[A-Z]/.test(name)) continue
    const Ctor = value as ComponentCtor
    // 仅注册 Object3D 子类；Material 子类（ShinyMaterial/MeshReflectorMaterial）跳过
    if (!(Ctor.prototype instanceof THREE.Object3D)) {
      // Material 子类：阶段1 不处理，留 TODO
      continue
    }
    if (registry.has(name)) {
      // 同名跨域冲突（理论不会发生），后者覆盖并 warn
      console.warn(`[library-bridge] 组件名冲突: ${name} 已注册，被 ${domain} 覆盖`)
    }
    registry.set(name, Ctor)
  }
}

/** 初始化：注册 core/heat/material 三个域。幂等。 */
export function initLibraryBridge(): void {
  if (initialized) return
  registerNamespace(Core as unknown as Record<string, unknown>, 'core')
  registerNamespace(Heat as unknown as Record<string, unknown>, 'heat')
  registerNamespace(Material as unknown as Record<string, unknown>, 'material')
  initialized = true
  console.log(`[library-bridge] 已注册 ${registry.size} 个 3d-components 组件:`, Array.from(registry.keys()))
}

/** 是否存在某名称的组件 */
export function hasComponent(name: string): boolean {
  if (!initialized) initLibraryBridge()
  return registry.has(name)
}

/** 按 name 取构造器 */
export function resolveComponent(name: string): ComponentCtor | undefined {
  if (!initialized) initLibraryBridge()
  return registry.get(name)
}

/**
 * 实例化一个 3d-components 组件为 Object3D。
 * @returns Object3D 实例；若 name 不存在或不是 Object3D 子类返回 null
 *
 * IUpdatable 处理：组件若有 update(delta) 方法（如 HeatMesh），在 userData.__updatable 标记，
 * 供 createScene3D 收集到 App3D 渲染循环每帧调用。
 */
export function createComponentObject(
  name: string,
  options?: Record<string, unknown>,
): THREE.Object3D | null {
  const Ctor = resolveComponent(name)
  if (!Ctor) return null

  try {
    const obj = new Ctor(options)
    // 标记 IUpdatable（有 update 方法且是 function）
    if (typeof (obj as { update?: unknown }).update === 'function') {
      obj.userData.__updatable = true
    }
    return obj
  } catch (err) {
    console.error(`[library-bridge] 实例化组件 "${name}" 失败:`, err)
    return null
  }
}

/** 列出所有已注册组件名（调试用） */
export function listComponents(): string[] {
  if (!initialized) initLibraryBridge()
  return Array.from(registry.keys())
}
