import * as THREE from 'three'
import type { ComponentOptions } from './types'
import { applyTransform, applyShadow } from './transform'

/**
 * model 组件：带 src 的占位 Group。
 * 实际模型由 loadModelObjects() 异步加载后填充到此 Group（走 ModelLoader provider 链）。
 * 迁自 createModelPlaceholder。
 */
export class ModelComponent extends THREE.Group {
  constructor(opts: ComponentOptions) {
    super()
    if (opts.id) this.name = opts.id
    // 标记为模型占位节点，供异步加载识别
    this.userData.__modelSrc = opts.src ?? ''
    this.userData.__modelId = opts.id ?? ''
    applyTransform(this, opts)
    applyShadow(this, opts)
  }
}
