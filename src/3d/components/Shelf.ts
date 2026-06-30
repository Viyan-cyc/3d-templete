import * as THREE from 'three'

// ============================================================
//  Shelf — 货架 3D 组件（继承 THREE.Group）
//
//  用法 1：直接 new（纯 TS/JS）
//    const shelf = new Shelf({ rows: 3, cols: 5, layers: 4 })
//    scene.add(shelf)
//
//  用法 2：通过 ShelfComponent 包装 → 注册到 ComponentRegistry → JSON 驱动
//    { type: 'component', componentName: 'Shelf', props: { rows: 3, cols: 5, layers: 4 } }
// ============================================================

export interface ShelfCellCoord {
  /** 行索引（0-based，从左到右） */
  row: number
  /** 列索引（0-based，从前往后） */
  col: number
  /** 层索引（0-based，从下往上） */
  layer: number
}

export interface ShelfOptions {
  /** 行数（X 方向） */
  rows?: number
  /** 列数（Z 方向，深度） */
  cols?: number
  /** 层数（Y 方向） */
  layers?: number

  /** 单个货格的宽度（X），默认 1 */
  cellWidth?: number
  /** 单个货格的高度（Y），默认 0.8 */
  cellHeight?: number
  /** 单个货格的深度（Z），默认 1 */
  cellDepth?: number

  /** 立柱粗细，默认 0.06 */
  postThickness?: number
  /** 层板厚度，默认 0.04 */
  shelfThickness?: number
  /** 隔板厚度（列之间的竖板），默认 0.02，设为 0 不生成 */
  dividerThickness?: number

  /** 整体颜色，默认 #8B7355（木色） */
  color?: number | string
  /** 层板颜色，默认同 color */
  shelfColor?: number | string
  /** 立柱颜色，默认 #555555 */
  postColor?: number | string
}

const DEFAULT_OPTIONS: Required<Omit<ShelfOptions, 'shelfColor' | 'postColor'>> = {
  rows: 3,
  cols: 1,
  layers: 3,
  cellWidth: 1,
  cellHeight: 0.8,
  cellDepth: 1,
  postThickness: 0.06,
  shelfThickness: 0.04,
  dividerThickness: 0.02,
  color: 0x8b7355,
}

export class Shelf extends THREE.Group {
  readonly shelfOptions: Required<ShelfOptions> & Partial<Pick<ShelfOptions, 'shelfColor' | 'postColor'>>

  /** 立柱组（方便单独控制显隐） */
  readonly posts: THREE.Group
  /** 层板组 */
  readonly shelves: THREE.Group
  /** 隔板组 */
  readonly dividers: THREE.Group

  /** 预计算的每个货格中心的世界坐标（相对于 Shelf） */
  readonly cellPositions: THREE.Vector3[] = []

  /** cellKey → cellIndex 映射，key 格式 "row-col-layer" */
  private _cellIndexMap: Map<string, number> = new Map()

  constructor(options: ShelfOptions = {}) {
    super()

    this.shelfOptions = { ...DEFAULT_OPTIONS, ...options } as Shelf['shelfOptions']

    this.posts = new THREE.Group()
    this.posts.name = 'Posts'
    this.shelves = new THREE.Group()
    this.shelves.name = 'Shelves'
    this.dividers = new THREE.Group()
    this.dividers.name = 'Dividers'

    this.add(this.posts)
    this.add(this.shelves)
    this.add(this.dividers)

    this._build()
  }

  // ---- 公开 API ----

  /** 根据行列层索引获取货格中心坐标 */
  getCellPosition(row: number, col: number, layer: number): THREE.Vector3 {
    return this._computeCellCenter(row, col, layer)
  }

  /** 根据行列层索引获取 cellIndex */
  getCellIndex(row: number, col: number, layer: number): number {
    const key = `${row}-${col}-${layer}`
    const idx = this._cellIndexMap.get(key)
    return idx ?? -1
  }

  /** 货格总数 */
  get cellCount(): number {
    return this.cellPositions.length
  }

  /** 总宽度 */
  get totalWidth(): number {
    const { rows, cellWidth } = this.shelfOptions
    return rows * cellWidth
  }

  /** 总深度 */
  get totalDepth(): number {
    const { cols, cellDepth } = this.shelfOptions
    return cols * cellDepth
  }

  /** 总高度 */
  get totalHeight(): number {
    const { layers, cellHeight, shelfThickness } = this.shelfOptions
    return layers * cellHeight + (layers + 1) * shelfThickness
  }

  /**
   * 重置颜色
   */
  setColors(shelfColor?: number | string, postColor?: number | string): void {
    if (shelfColor !== undefined) {
      this.shelfOptions.shelfColor = shelfColor
    }
    if (postColor !== undefined) {
      this.shelfOptions.postColor = postColor
    }

    // 重建
    this._clearMeshGroups()
    this._build()
  }

  // ---- 构建 ----

  private _build(): void {
    this._cellIndexMap.clear()
    this.cellPositions.length = 0

    this._buildPosts()
    this._buildShelves()
    this._buildDividers()
    this._computeCellPositions()
  }

  /** 四角立柱 */
  private _buildPosts(): void {
    const { postThickness, postColor } =
      this.shelfOptions

    const totalH = this.totalHeight
    const totalW = this.totalWidth
    const totalD = this.totalDepth

    const postMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(postColor ?? 0x555555),
      roughness: 0.6,
      metalness: 0.4,
    })

    const halfW = totalW / 2
    const halfD = totalD / 2

    // 四角位置
    const corners: [number, number][] = [
      [-halfW, -halfD],
      [halfW, -halfD],
      [-halfW, halfD],
      [halfW, halfD],
    ]

    corners.forEach(([cx, cz]) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(postThickness, totalH, postThickness),
        postMat,
      )
      post.position.set(cx, totalH / 2, cz)
      post.castShadow = true
      post.receiveShadow = true
      post.name = 'Post'
      this.posts.add(post)
    })
  }

  /** 每层的水平层板 */
  private _buildShelves(): void {
    const { layers, cellHeight, shelfThickness, shelfColor, color } =
      this.shelfOptions

    const sColor = shelfColor ?? color
    const shelfMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(sColor),
      roughness: 0.5,
      metalness: 0.1,
    })

    const totalW = this.totalWidth
    const totalD = this.totalDepth

    // 层板：底部 + 每层之上
    for (let l = 0; l <= layers; l++) {
      const y = l * (cellHeight + shelfThickness)
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(totalW, shelfThickness, totalD),
        shelfMat,
      )
      board.position.set(0, y, 0)
      board.castShadow = true
      board.receiveShadow = true
      board.name = `ShelfBoard-L${l}`
      this.shelves.add(board)
    }
  }

  /** 列之间的竖隔板 */
  private _buildDividers(): void {
    const { rows, cols, cellWidth, cellDepth, dividerThickness, color } =
      this.shelfOptions

    if (dividerThickness <= 0) return

    const dividerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.5,
      metalness: 0.1,
    })

    const halfW = this.totalWidth / 2
    const totalH = this.totalHeight
    const halfD = this.totalDepth / 2

    // Y 方向不需要隔板（因为层板已经充当）

    // X 方向隔板（行之间）—— 竖板沿 Z 方向
    for (let r = 1; r < rows; r++) {
      const x = -halfW + r * cellWidth
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(dividerThickness, totalH, this.totalDepth),
        dividerMat,
      )
      board.position.set(x, totalH / 2, 0)
      board.castShadow = true
      board.receiveShadow = true
      board.name = `Divider-Row${r}`
      this.dividers.add(board)
    }

    // Z 方向隔板（列之间）—— 竖板沿 X 方向
    for (let c = 1; c < cols; c++) {
      const z = -halfD + c * cellDepth
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(this.totalWidth, totalH, dividerThickness),
        dividerMat,
      )
      board.position.set(0, totalH / 2, z)
      board.castShadow = true
      board.receiveShadow = true
      board.name = `Divider-Col${c}`
      this.dividers.add(board)
    }
  }

  /** 预计算所有货格的 3D 中心坐标 */
  private _computeCellPositions(): void {
    const { rows, cols, layers } = this.shelfOptions

    let idx = 0
    for (let layer = 0; layer < layers; layer++) {
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          const center = this._computeCellCenter(row, col, layer)
          const key = `${row}-${col}-${layer}`
          this._cellIndexMap.set(key, idx)
          this.cellPositions.push(center)
          idx++
        }
      }
    }
  }

  /** 计算单个货格中心坐标 */
  private _computeCellCenter(row: number, col: number, layer: number): THREE.Vector3 {
    const { cellWidth, cellDepth, cellHeight, shelfThickness } = this.shelfOptions

    const halfW = this.totalWidth / 2
    const halfD = this.totalDepth / 2

    // X: row
    const x = -halfW + row * cellWidth + cellWidth / 2
    // Z: col
    const z = -halfD + col * cellDepth + cellDepth / 2
    // Y: layer（层板在 layer 底部，货格中心 = 层板上方 + 半格高）
    const y = layer * (cellHeight + shelfThickness) + shelfThickness + cellHeight / 2

    return new THREE.Vector3(x, y, z)
  }

  private _clearMeshGroups(): void {
    ;[this.posts, this.shelves, this.dividers].forEach((g) => {
      while (g.children.length > 0) {
        const child = g.children[0]
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          const mat = child.material
          if (mat instanceof THREE.Material) {
            mat.dispose()
          }
        }
        g.remove(child)
      }
    })
  }

  dispose(): void {
    this._clearMeshGroups()
    this.removeFromParent()
  }
}
