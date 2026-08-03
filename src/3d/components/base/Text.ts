import * as THREE from 'three'
import type { ComponentOptions } from './types'
import { applyTransform, applyShadow } from './transform'

/**
 * text 几何体组件：canvas 绘制文字 → CanvasTexture 贴到 PlaneGeometry。
 *
 * 原 ASCII TextGeometry 立体字路径已移除（需自托管 helvetiker 字体且从未接 ensureFont，
 * 实际一直走 canvas）。中英文统一 canvas 贴图。直接 extends THREE.Mesh 自建。
 */
export class TextComponent extends THREE.Mesh {
  constructor(opts: ComponentOptions) {
    const tp = (opts.geometry?.params ?? {}) as Record<string, unknown>
    const text = String(tp.text ?? 'Text')
    const size = Number(tp.size) > 0 ? Number(tp.size) : 1

    const cv = document.createElement('canvas')
    const ctx = cv.getContext('2d')!
    const fs = 128
    ctx.font = `bold ${fs}px sans-serif`
    const m = ctx.measureText(text)
    cv.width = Math.ceil(m.width) + 32
    cv.height = fs + 32
    // canvas 尺寸变更后需重新设置 font
    ctx.font = `bold ${fs}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cv.width / 2, cv.height / 2)

    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const geo = new THREE.PlaneGeometry(size * (cv.width / cv.height), size)
    const matColor = opts.material?.color ?? '#ffffff'
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      color: new THREE.Color(matColor),
      side: THREE.DoubleSide,
    })

    super(geo, mat)
    if (opts.id) this.name = opts.id
    applyTransform(this, opts)
    applyShadow(this, opts)
  }
}
