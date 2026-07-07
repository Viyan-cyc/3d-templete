/**
 * DebugOverlay — 右上角 HUD 面板，实时显示 Three.js 渲染参数 + FPS
 *
 * 纯 DOM 实现，不依赖 Vue，方便在 3D 包内闭环。
 * 由 App3D 每帧驱动 update()，内部按 rAF 节流更新 DOM。
 */

export interface DebugOverlayOptions {
  /** 更新间隔（毫秒），默认 250ms */
  interval?: number
}

export class DebugOverlay {
  private _el: HTMLDivElement
  private _fields: Record<string, HTMLSpanElement> = {}
  private _interval: number
  private _lastTime = 0

  /** FPS 计算 */
  private _frameCount = 0
  private _fpsAccum = 0
  private _fps = 0

  constructor(options: DebugOverlayOptions = {}) {
    this._interval = options.interval ?? 250

    const el = document.createElement('div')
    el.className = 'debug3d-overlay'
    Object.assign(el.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      zIndex: '9999',
      background: 'rgba(0, 0, 0, 0.72)',
      color: '#0ff',
      fontFamily: '"Consolas", "Menlo", "Courier New", monospace',
      fontSize: '12px',
      lineHeight: '1.7',
      padding: '10px 14px',
      borderRadius: '8px',
      pointerEvents: 'none',
      userSelect: 'none',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      border: '1px solid rgba(0, 255, 255, 0.15)',
      minWidth: '220px',
    })

    const rows: Array<{ key: string; label: string; color: string }> = [
      { key: 'fps', label: 'FPS', color: '#0f0' },
      { key: 'frameTime', label: 'Frame', color: '#0f0' },
      { key: 'calls', label: 'Calls', color: '#0ff' },
      { key: 'triangles', label: 'Triangles', color: '#0ff' },
      { key: 'points', label: 'Points', color: '#0ff' },
      { key: 'lines', label: 'Lines', color: '#0ff' },
      { key: 'geometries', label: 'Geometries', color: '#ff0' },
      { key: 'textures', label: 'Textures', color: '#ff0' },
      { key: 'programs', label: 'Programs', color: '#f80' },
    ]

    for (const { key, label, color } of rows) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        display: 'flex',
        justifyContent: 'space-between',
        gap: '16px',
      })

      const lbl = document.createElement('span')
      lbl.textContent = label
      Object.assign(lbl.style, { color: '#888' })

      const val = document.createElement('span')
      Object.assign(val.style, { color, fontWeight: 'bold', textAlign: 'right' })
      val.textContent = '—'

      row.appendChild(lbl)
      row.appendChild(val)
      el.appendChild(row)
      this._fields[key] = val
    }

    document.body.appendChild(el)
    this._el = el
  }

  /**
   * 每帧调用，传入 renderer.info 数据。
   * 内部按 interval 节流 DOM 更新；FPS 按实际间隔计算。
   */
  update(
    info: {
      render: { calls: number; triangles: number; points: number; lines: number }
      memory: { geometries: number; textures: number }
      programs: unknown[] | null
    },
    deltaMs: number,
  ): void {
    this._frameCount++
    this._fpsAccum += deltaMs

    const now = performance.now()
    if (now - this._lastTime < this._interval) return
    this._lastTime = now

    // FPS
    if (this._fpsAccum > 0) {
      this._fps = Math.round((this._frameCount / this._fpsAccum) * 1000)
    }
    this._frameCount = 0
    this._fpsAccum = 0

    const frameTime = deltaMs.toFixed(1)

    this._fields.fps.textContent = String(this._fps)
    this._fields.frameTime.textContent = `${frameTime}ms`
    this._fields.calls.textContent = String(info.render.calls)
    this._fields.triangles.textContent = this._formatNumber(info.render.triangles)
    this._fields.points.textContent = this._formatNumber(info.render.points)
    this._fields.lines.textContent = this._formatNumber(info.render.lines)
    this._fields.geometries.textContent = String(info.memory.geometries)
    this._fields.textures.textContent = String(info.memory.textures)
    this._fields.programs.textContent = String(info.programs?.length ?? '—')
  }

  /** 销毁，移除 DOM */
  dispose(): void {
    this._el.remove()
  }

  /** 显示 */
  show(): void {
    this._el.style.display = ''
  }

  /** 隐藏 */
  hide(): void {
    this._el.style.display = 'none'
  }

  /** 数字格式化：超过 1k 用 K 表示 */
  private _formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return String(n)
  }
}
