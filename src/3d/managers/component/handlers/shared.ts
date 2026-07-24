/**
 * ============================================================
 *  shared — handler 间共享的状态与工具函数
 *
 *  任何 handler 都可以通过 ctx.shared 读写这里的字段。
 *  典型场景：
 *    - 共享颜色/材质映射表，运行时可动态修改
 *    - 共享材质缓存，避免同类 handler 重复创建
 *    - 跨 handler 的状态标记（如「当前选中设备 id」）
 *
 *  新增共享字段只需在 ComponentSharedState 加属性 + 在此初始化。
 * ============================================================
 */

import * as THREE from 'three'
import type { AssetPool } from '../../../components/AssetPool'

/**
 * handler 间共享的状态容器。
 * 通过 ctx.shared 访问，所有 handler 读写同一个实例。
 */
export class ComponentSharedState {
  // ── 颜色映射（可运行时修改）──

  /** 设备状态 → 颜色 */
  deviceStatusColors: Record<string, string> = {
    running: '#00ff88',
    stopped: '#ff4444',
    warning: '#ffaa00',
    offline: '#666666',
  }

  /** 季节 → 颜色 */
  seasonColors: Record<string, string> = {
    spring: '#4caf50',
    summer: '#2e7d32',
    autumn: '#ff8f00',
    winter: '#90a4ae',
  }

  // ── 材质缓存（同类材质复用，避免 GPU 冗余）──

  /** 缓存的 MeshStandardMaterial，key = 颜色+粗糙度+金属度 */
  private _materialCache = new Map<string, THREE.MeshStandardMaterial>()

  /** 获取或创建缓存的 MeshStandardMaterial */
  getMaterial(color: string, roughness = 0.5, metalness = 0): THREE.MeshStandardMaterial {
    const key = `${color}|${roughness}|${metalness}`
    let mat = this._materialCache.get(key)
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness, metalness })
      this._materialCache.set(key, mat)
    }
    return mat
  }

  // ── 跨 handler 状态 ──

  /** 当前选中的实体 id（可由 device handler 写、其他 handler 读） */
  selectedComponentId: string | null = null

  /** 自由格式的 key-value 存储，handler 可随意读写 */
  store: Record<string, unknown> = {}

  // ── 资源引用 ──

  /** AssetPool 引用（由 createScene3D 注入，handler 可用来缓存 Geometry/Material） */
  assetPool: AssetPool | null = null

  // ── 生命周期 ──

  /** 释放所有缓存材质 */
  dispose(): void {
    for (const mat of this._materialCache.values()) {
      mat.dispose()
    }
    this._materialCache.clear()
    this.store = {}
  }
}

/** 全局共享状态单例 */
export const sharedState = new ComponentSharedState()
