import * as THREE from 'three'

/**
 * ============================================================
 *  SolarPanel — 光伏板 3D 组件（继承 THREE.Group）
 *
 *  模拟真实光伏组件的外观：
 *    - 铝合金边框（银色金属）
 *    - 光伏电池片阵列（深蓝色晶硅片，带微反光）
 *    - 可选倾角支架（地面/屋顶安装场景）
 *
 *  用法 1：直接 new
 *    const panel = new SolarPanel({ panelWidth: 2, panelHeight: 1.2 })
 *    scene.add(panel)
 *
 *  用法 2：通过 SolarPanelComponent 包装 → ComponentRegistry → JSON 驱动
 * ============================================================
 */

export interface SolarPanelOptions {
  /** 光伏板宽度（m），默认 2 */
  panelWidth?: number
  /** 光伏板高度（m），默认 1.2 */
  panelHeight?: number
  /** 光伏板厚度（m），默认 0.04 */
  panelThickness?: number

  /** 电池片行数，默认 6 */
  cellRows?: number
  /** 电池片列数，默认 10 */
  cellCols?: number
  /** 电池片间隙（m），默认 0.005 */
  cellGap?: number
  /** 电池片颜色，默认深蓝 #1a3a5c */
  cellColor?: number | string

  /** 边框宽度（m），默认 0.04 */
  frameWidth?: number
  /** 边框颜色，默认银色 #C0C0C0 */
  frameColor?: number | string

  /** 倾角（弧度），默认 0（水平），如 Math.PI/6 ≈ 30° */
  tiltAngle?: number
  /** 支架高度（m），默认 0，>0 时生成地面支撑杆 */
  standHeight?: number
  /** 支架颜色，默认深灰 #555555 */
  standColor?: number | string
}

const DEFAULTS: Required<Omit<SolarPanelOptions, 'standColor'>> = {
  panelWidth: 2,
  panelHeight: 1.2,
  panelThickness: 0.04,
  cellRows: 6,
  cellCols: 10,
  cellGap: 0.005,
  cellColor: 0x1a3a5c,
  frameWidth: 0.04,
  frameColor: 0xc0c0c0,
  tiltAngle: 0,
  standHeight: 0,
}

export class SolarPanel extends THREE.Group {
  readonly options: Required<SolarPanelOptions> & Partial<Pick<SolarPanelOptions, 'standColor'>>

  /** 光伏板主体（面板+电池片+边框） */
  readonly panelGroup: THREE.Group
  /** 支架（可为空） */
  readonly standGroup: THREE.Group

  /** 面板四个角的局部坐标（可用于调试或放置对象） */
  readonly corners: { topLeft: THREE.Vector3; topRight: THREE.Vector3; bottomLeft: THREE.Vector3; bottomRight: THREE.Vector3 }

  constructor(options: SolarPanelOptions = {}) {
    super()
    this.options = { ...DEFAULTS, ...options } as SolarPanel['options']

    this.panelGroup = new THREE.Group()
    this.panelGroup.name = 'SolarPanel-Body'
    this.standGroup = new THREE.Group()
    this.standGroup.name = 'SolarPanel-Stand'

    this.add(this.panelGroup)
    this.add(this.standGroup)

    const { panelWidth, panelHeight } = this.options
    const hw = panelWidth / 2
    const hh = panelHeight / 2

    this.corners = {
      topLeft: new THREE.Vector3(-hw, 0, hh),
      topRight: new THREE.Vector3(hw, 0, hh),
      bottomLeft: new THREE.Vector3(-hw, 0, -hh),
      bottomRight: new THREE.Vector3(hw, 0, -hh),
    }

    this._build()

    // 倾角
    if (this.options.tiltAngle !== 0) {
      this.panelGroup.rotation.x = -this.options.tiltAngle
    }
  }

  // ========== 公开 API ==========

  /** 面板总面积（㎡） */
  get area(): number {
    const { panelWidth, panelHeight } = this.options
    return panelWidth * panelHeight
  }

  /** 电池片总数 */
  get cellCount(): number {
    const { cellRows, cellCols } = this.options
    return cellRows * cellCols
  }

  /** 单个电池片的尺寸 */
  get cellSize(): { width: number; height: number } {
    const { panelWidth, panelHeight, cellRows, cellCols, cellGap, frameWidth } = this.options
    const innerW = panelWidth - frameWidth * 2 - cellGap * (cellCols + 1)
    const innerH = panelHeight - frameWidth * 2 - cellGap * (cellRows + 1)
    return {
      width: innerW / cellCols,
      height: innerH / cellRows,
    }
  }

  /**
   * 获取面板上某一点的 3D 局部坐标
   * @param u 水平归一化坐标 0~1（左→右）
   * @param v 垂直归一化坐标 0~1（下→上）
   */
  getPointOnPanel(u: number, v: number): THREE.Vector3 {
    const { panelWidth, panelHeight, panelThickness } = this.options
    const x = (u - 0.5) * panelWidth
    const y = panelThickness / 2
    const z = (v - 0.5) * panelHeight
    return new THREE.Vector3(x, y, z)
  }

  dispose(): void {
    ;[this.panelGroup, this.standGroup].forEach((g) => {
      while (g.children.length > 0) {
        const child = g.children[0]
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          const mat = child.material
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose())
          } else {
            mat.dispose()
          }
        }
        g.remove(child)
      }
    })
    this.removeFromParent()
  }

  // ========== 构建 ==========

  private _build(): void {
    this._buildCells()    // 电池片阵列
    this._buildFrame()    // 铝合金边框
    this._buildStand()    // 支架
  }

  /** 光伏电池片阵列 — 深蓝色晶硅片带银色细栅线 */
  private _buildCells(): void {
    const { panelWidth, panelHeight, panelThickness, cellRows, cellCols, cellGap, cellColor, frameWidth } = this.options

    const innerW = panelWidth - frameWidth * 2
    const innerH = panelHeight - frameWidth * 2
    const cellW = (innerW - cellGap * (cellCols + 1)) / cellCols
    const cellH = (innerH - cellGap * (cellRows + 1)) / cellRows

    // 电池片材质 — 深蓝底
    const cellMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cellColor),
      roughness: 0.25,
      metalness: 0.15,
    })

    // 栅线材质 — 银色细线
    const gridLineMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.3,
      metalness: 0.7,
    })

    const startX = -innerW / 2 + cellGap + cellW / 2
    const startZ = -innerH / 2 + cellGap + cellH / 2

    for (let row = 0; row < cellRows; row++) {
      for (let col = 0; col < cellCols; col++) {
        const cx = startX + col * (cellW + cellGap)
        const cz = startZ + row * (cellH + cellGap)

        // 电池片主体
        const cell = new THREE.Mesh(
          new THREE.BoxGeometry(cellW - 0.004, panelThickness * 0.3, cellH - 0.004),
          cellMat,
        )
        cell.position.set(cx, panelThickness / 2 + 0.001, cz)
        cell.castShadow = true
        cell.receiveShadow = true
        cell.name = `Cell-r${row}c${col}`
        this.panelGroup.add(cell)

        // 主栅线（沿 Z 方向，2 条竖线）
        const lineCount = 2
        for (let l = 0; l < lineCount; l++) {
          const lz = cz - cellH * 0.25 + l * cellH * 0.5
          const line = new THREE.Mesh(
            new THREE.BoxGeometry((cellW - 0.004) * 0.02, panelThickness * 0.32, cellH - 0.004),
            gridLineMat,
          )
          line.position.set(cx, panelThickness / 2 + 0.002, lz)
          this.panelGroup.add(line)
        }
      }
    }

    // 背板
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
      metalness: 0.1,
    })
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, panelThickness * 0.6, innerH),
      backMat,
    )
    back.position.set(0, -panelThickness * 0.15, 0)
    back.receiveShadow = true
    back.name = 'BackSheet'
    this.panelGroup.add(back)
  }

  /** 铝合金边框 */
  private _buildFrame(): void {
    const { panelWidth, panelHeight, panelThickness, frameWidth, frameColor } = this.options

    const frameMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(frameColor),
      roughness: 0.3,
      metalness: 0.85,
    })

    const halfW = panelWidth / 2
    const halfH = panelHeight / 2
    const longLen = panelWidth + frameWidth * 2    // 长边框（沿 X）
    const shortLen = panelHeight + frameWidth * 2   // 短边框（沿 Z）

    // 四边边框 — 上下各一条
    const createFrameBar = (length: number, z: number, rotY: number): THREE.Mesh => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(length, panelThickness + 0.01, frameWidth),
        frameMat,
      )
      bar.position.set(0, 0, z)
      bar.rotation.y = rotY
      bar.castShadow = true
      bar.receiveShadow = true
      return bar
    }

    // 前边框 (Z = +halfH)
    this.panelGroup.add(createFrameBar(longLen, halfH, 0))
    // 后边框 (Z = -halfH)
    this.panelGroup.add(createFrameBar(longLen, -halfH, 0))
    // 左边框 (X = -halfW)
    this.panelGroup.add(createFrameBar(shortLen, halfW, Math.PI / 2))
    // 右边框 (X = +halfW)
    this.panelGroup.add(createFrameBar(shortLen, -halfW, Math.PI / 2))
  }

  /** 地面支架（standHeight > 0 时生成） */
  private _buildStand(): void {
    const { standHeight, standColor, panelWidth, panelHeight } = this.options
    if (standHeight <= 0) return

    const standColorVal = standColor ?? 0x555555
    const standMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(standColorVal),
      roughness: 0.5,
      metalness: 0.6,
    })
    const poleRadius = 0.04

    const positions = [
      { x: -panelWidth * 0.35, z: panelHeight * 0.35 },
      { x: panelWidth * 0.35, z: panelHeight * 0.35 },
      { x: -panelWidth * 0.35, z: -panelHeight * 0.35 },
      { x: panelWidth * 0.35, z: -panelHeight * 0.35 },
    ]

    positions.forEach(({ x, z }) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(poleRadius, poleRadius, standHeight, 8),
        standMat,
      )
      pole.position.set(x, -standHeight / 2, z)
      pole.castShadow = true
      pole.receiveShadow = true
      pole.name = 'StandPole'
      this.standGroup.add(pole)
    })

    // 横梁连接前两柱和后两柱
    const beamMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(standColorVal),
      roughness: 0.4,
      metalness: 0.7,
    })
    const beamRadius = 0.025

    const createBeam = (z: number): void => {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(beamRadius, beamRadius, panelWidth * 0.7, 8),
        beamMat,
      )
      beam.rotation.z = Math.PI / 2
      beam.position.set(0, -standHeight + 0.05, z)
      beam.name = 'Beam'
      this.standGroup.add(beam)
    }

    createBeam(panelHeight * 0.35)
    createBeam(-panelHeight * 0.35)
  }
}
