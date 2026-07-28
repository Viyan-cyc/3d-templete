import * as THREE from "three";
const DEFAULT_OPTIONS = {
  rows: 3,
  cols: 1,
  layers: 3,
  cellWidth: 1,
  cellHeight: 0.8,
  cellDepth: 1,
  postThickness: 0.06,
  shelfThickness: 0.04,
  dividerThickness: 0.02,
  color: 9139029
};
class Shelf extends THREE.Group {
  shelfOptions;
  /** 立柱组（方便单独控制显隐） */
  posts;
  /** 层板组 */
  shelves;
  /** 隔板组 */
  dividers;
  /** 预计算的每个货格中心的世界坐标（相对于 Shelf） */
  cellPositions = [];
  /** cellKey → cellIndex 映射，key 格式 "row-col-layer" */
  _cellIndexMap = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this.shelfOptions = { ...DEFAULT_OPTIONS, ...options };
    this.posts = new THREE.Group();
    this.posts.name = "Posts";
    this.shelves = new THREE.Group();
    this.shelves.name = "Shelves";
    this.dividers = new THREE.Group();
    this.dividers.name = "Dividers";
    this.add(this.posts);
    this.add(this.shelves);
    this.add(this.dividers);
    this._build();
  }
  // ---- 公开 API ----
  /** 根据行列层索引获取货格中心坐标 */
  getCellPosition(row, col, layer) {
    return this._computeCellCenter(row, col, layer);
  }
  /** 根据行列层索引获取 cellIndex */
  getCellIndex(row, col, layer) {
    const key = `${row}-${col}-${layer}`;
    const idx = this._cellIndexMap.get(key);
    return idx ?? -1;
  }
  /** 货格总数 */
  get cellCount() {
    return this.cellPositions.length;
  }
  /** 总宽度 */
  get totalWidth() {
    const { rows, cellWidth } = this.shelfOptions;
    return rows * cellWidth;
  }
  /** 总深度 */
  get totalDepth() {
    const { cols, cellDepth } = this.shelfOptions;
    return cols * cellDepth;
  }
  /** 总高度 */
  get totalHeight() {
    const { layers, cellHeight, shelfThickness } = this.shelfOptions;
    return layers * cellHeight + (layers + 1) * shelfThickness;
  }
  /**
   * 重置颜色
   */
  setColors(shelfColor, postColor) {
    if (shelfColor !== void 0) {
      this.shelfOptions.shelfColor = shelfColor;
    }
    if (postColor !== void 0) {
      this.shelfOptions.postColor = postColor;
    }
    this._clearMeshGroups();
    this._build();
  }
  // ---- 构建 ----
  _build() {
    this._cellIndexMap.clear();
    this.cellPositions.length = 0;
    this._buildPosts();
    this._buildShelves();
    this._buildDividers();
    this._computeCellPositions();
  }
  /** 四角立柱 */
  _buildPosts() {
    const { postThickness, postColor } = this.shelfOptions;
    const totalH = this.totalHeight;
    const totalW = this.totalWidth;
    const totalD = this.totalDepth;
    const postMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(postColor ?? 5592405),
      roughness: 0.6,
      metalness: 0.4
    });
    const halfW = totalW / 2;
    const halfD = totalD / 2;
    const corners = [
      [-halfW, -halfD],
      [halfW, -halfD],
      [-halfW, halfD],
      [halfW, halfD]
    ];
    corners.forEach(([cx, cz]) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(postThickness, totalH, postThickness),
        postMat
      );
      post.position.set(cx, totalH / 2, cz);
      post.castShadow = true;
      post.receiveShadow = true;
      post.name = "Post";
      this.posts.add(post);
    });
  }
  /** 每层的水平层板 */
  _buildShelves() {
    const { layers, cellHeight, shelfThickness, shelfColor, color } = this.shelfOptions;
    const sColor = shelfColor ?? color;
    const shelfMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(sColor),
      roughness: 0.5,
      metalness: 0.1
    });
    const totalW = this.totalWidth;
    const totalD = this.totalDepth;
    for (let l = 0; l <= layers; l++) {
      const y = l * (cellHeight + shelfThickness);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(totalW, shelfThickness, totalD),
        shelfMat
      );
      board.position.set(0, y, 0);
      board.castShadow = true;
      board.receiveShadow = true;
      board.name = `ShelfBoard-L${l}`;
      this.shelves.add(board);
    }
  }
  /** 列之间的竖隔板 */
  _buildDividers() {
    const { rows, cols, cellWidth, cellDepth, dividerThickness, color } = this.shelfOptions;
    if (dividerThickness <= 0) return;
    const dividerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.5,
      metalness: 0.1
    });
    const halfW = this.totalWidth / 2;
    const totalH = this.totalHeight;
    const halfD = this.totalDepth / 2;
    for (let r = 1; r < rows; r++) {
      const x = -halfW + r * cellWidth;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(dividerThickness, totalH, this.totalDepth),
        dividerMat
      );
      board.position.set(x, totalH / 2, 0);
      board.castShadow = true;
      board.receiveShadow = true;
      board.name = `Divider-Row${r}`;
      this.dividers.add(board);
    }
    for (let c = 1; c < cols; c++) {
      const z = -halfD + c * cellDepth;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(this.totalWidth, totalH, dividerThickness),
        dividerMat
      );
      board.position.set(0, totalH / 2, z);
      board.castShadow = true;
      board.receiveShadow = true;
      board.name = `Divider-Col${c}`;
      this.dividers.add(board);
    }
  }
  /** 预计算所有货格的 3D 中心坐标 */
  _computeCellPositions() {
    const { rows, cols, layers } = this.shelfOptions;
    let idx = 0;
    for (let layer = 0; layer < layers; layer++) {
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          const center = this._computeCellCenter(row, col, layer);
          const key = `${row}-${col}-${layer}`;
          this._cellIndexMap.set(key, idx);
          this.cellPositions.push(center);
          idx++;
        }
      }
    }
  }
  /** 计算单个货格中心坐标 */
  _computeCellCenter(row, col, layer) {
    const { cellWidth, cellDepth, cellHeight, shelfThickness } = this.shelfOptions;
    const halfW = this.totalWidth / 2;
    const halfD = this.totalDepth / 2;
    const x = -halfW + row * cellWidth + cellWidth / 2;
    const z = -halfD + col * cellDepth + cellDepth / 2;
    const y = layer * (cellHeight + shelfThickness) + shelfThickness + cellHeight / 2;
    return new THREE.Vector3(x, y, z);
  }
  _clearMeshGroups() {
    ;
    [this.posts, this.shelves, this.dividers].forEach((g) => {
      while (g.children.length > 0) {
        const child = g.children[0];
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mat = child.material;
          if (mat instanceof THREE.Material) {
            mat.dispose();
          }
        }
        g.remove(child);
      }
    });
  }
  dispose() {
    this._clearMeshGroups();
    this.removeFromParent();
  }
}
export {
  Shelf
};
