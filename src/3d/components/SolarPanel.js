import * as THREE from "three";
const DEFAULTS = {
  panelWidth: 2,
  panelHeight: 1.2,
  panelThickness: 0.04,
  cellRows: 6,
  cellCols: 10,
  cellGap: 5e-3,
  cellColor: 1718876,
  frameWidth: 0.04,
  frameColor: 12632256,
  tiltAngle: 0,
  standHeight: 0
};
class SolarPanel extends THREE.Group {
  options;
  /** 光伏板主体（面板+电池片+边框） */
  panelGroup;
  /** 支架（可为空） */
  standGroup;
  /** 面板四个角的局部坐标（可用于调试或放置对象） */
  corners;
  constructor(options = {}) {
    super();
    this.options = { ...DEFAULTS, ...options };
    this.panelGroup = new THREE.Group();
    this.panelGroup.name = "SolarPanel-Body";
    this.standGroup = new THREE.Group();
    this.standGroup.name = "SolarPanel-Stand";
    this.add(this.panelGroup);
    this.add(this.standGroup);
    const { panelWidth, panelHeight } = this.options;
    const hw = panelWidth / 2;
    const hh = panelHeight / 2;
    this.corners = {
      topLeft: new THREE.Vector3(-hw, 0, hh),
      topRight: new THREE.Vector3(hw, 0, hh),
      bottomLeft: new THREE.Vector3(-hw, 0, -hh),
      bottomRight: new THREE.Vector3(hw, 0, -hh)
    };
    this._build();
    if (this.options.tiltAngle !== 0) {
      this.panelGroup.rotation.x = -this.options.tiltAngle;
    }
  }
  // ========== 公开 API ==========
  /** 面板总面积（㎡） */
  get area() {
    const { panelWidth, panelHeight } = this.options;
    return panelWidth * panelHeight;
  }
  /** 电池片总数 */
  get cellCount() {
    const { cellRows, cellCols } = this.options;
    return cellRows * cellCols;
  }
  /** 单个电池片的尺寸 */
  get cellSize() {
    const { panelWidth, panelHeight, cellRows, cellCols, cellGap, frameWidth } = this.options;
    const innerW = panelWidth - frameWidth * 2 - cellGap * (cellCols + 1);
    const innerH = panelHeight - frameWidth * 2 - cellGap * (cellRows + 1);
    return {
      width: innerW / cellCols,
      height: innerH / cellRows
    };
  }
  /**
   * 获取面板上某一点的 3D 局部坐标
   * @param u 水平归一化坐标 0~1（左→右）
   * @param v 垂直归一化坐标 0~1（下→上）
   */
  getPointOnPanel(u, v) {
    const { panelWidth, panelHeight, panelThickness } = this.options;
    const x = (u - 0.5) * panelWidth;
    const y = panelThickness / 2;
    const z = (v - 0.5) * panelHeight;
    return new THREE.Vector3(x, y, z);
  }
  dispose() {
    ;
    [this.panelGroup, this.standGroup].forEach((g) => {
      while (g.children.length > 0) {
        const child = g.children[0];
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
        g.remove(child);
      }
    });
    this.removeFromParent();
  }
  // ========== 构建 ==========
  _build() {
    this._buildCells();
    this._buildFrame();
    this._buildStand();
  }
  /** 光伏电池片阵列 — 深蓝色晶硅片带银色细栅线 */
  _buildCells() {
    const { panelWidth, panelHeight, panelThickness, cellRows, cellCols, cellGap, cellColor, frameWidth } = this.options;
    const innerW = panelWidth - frameWidth * 2;
    const innerH = panelHeight - frameWidth * 2;
    const cellW = (innerW - cellGap * (cellCols + 1)) / cellCols;
    const cellH = (innerH - cellGap * (cellRows + 1)) / cellRows;
    const cellMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cellColor),
      roughness: 0.25,
      metalness: 0.15
    });
    const gridLineMat = new THREE.MeshStandardMaterial({
      color: 13421772,
      roughness: 0.3,
      metalness: 0.7
    });
    const startX = -innerW / 2 + cellGap + cellW / 2;
    const startZ = -innerH / 2 + cellGap + cellH / 2;
    for (let row = 0; row < cellRows; row++) {
      for (let col = 0; col < cellCols; col++) {
        const cx = startX + col * (cellW + cellGap);
        const cz = startZ + row * (cellH + cellGap);
        const cell = new THREE.Mesh(
          new THREE.BoxGeometry(cellW - 4e-3, panelThickness * 0.3, cellH - 4e-3),
          cellMat
        );
        cell.position.set(cx, panelThickness / 2 + 1e-3, cz);
        cell.castShadow = true;
        cell.receiveShadow = true;
        cell.name = `Cell-r${row}c${col}`;
        this.panelGroup.add(cell);
        const lineCount = 2;
        for (let l = 0; l < lineCount; l++) {
          const lz = cz - cellH * 0.25 + l * cellH * 0.5;
          const line = new THREE.Mesh(
            new THREE.BoxGeometry((cellW - 4e-3) * 0.02, panelThickness * 0.32, cellH - 4e-3),
            gridLineMat
          );
          line.position.set(cx, panelThickness / 2 + 2e-3, lz);
          this.panelGroup.add(line);
        }
      }
    }
    const backMat = new THREE.MeshStandardMaterial({
      color: 2236962,
      roughness: 0.8,
      metalness: 0.1
    });
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, panelThickness * 0.6, innerH),
      backMat
    );
    back.position.set(0, -panelThickness * 0.15, 0);
    back.receiveShadow = true;
    back.name = "BackSheet";
    this.panelGroup.add(back);
  }
  /** 铝合金边框 */
  _buildFrame() {
    const { panelWidth, panelHeight, panelThickness, frameWidth, frameColor } = this.options;
    const frameMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(frameColor),
      roughness: 0.3,
      metalness: 0.85
    });
    const halfW = panelWidth / 2;
    const halfH = panelHeight / 2;
    const longLen = panelWidth + frameWidth * 2;
    const shortLen = panelHeight + frameWidth * 2;
    const createFrameBar = (length, z, rotY) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(length, panelThickness + 0.01, frameWidth),
        frameMat
      );
      bar.position.set(0, 0, z);
      bar.rotation.y = rotY;
      bar.castShadow = true;
      bar.receiveShadow = true;
      return bar;
    };
    this.panelGroup.add(createFrameBar(longLen, halfH, 0));
    this.panelGroup.add(createFrameBar(longLen, -halfH, 0));
    this.panelGroup.add(createFrameBar(shortLen, halfW, Math.PI / 2));
    this.panelGroup.add(createFrameBar(shortLen, -halfW, Math.PI / 2));
  }
  /** 地面支架（standHeight > 0 时生成） */
  _buildStand() {
    const { standHeight, standColor, panelWidth, panelHeight } = this.options;
    if (standHeight <= 0) return;
    const standColorVal = standColor ?? 5592405;
    const standMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(standColorVal),
      roughness: 0.5,
      metalness: 0.6
    });
    const poleRadius = 0.04;
    const positions = [
      { x: -panelWidth * 0.35, z: panelHeight * 0.35 },
      { x: panelWidth * 0.35, z: panelHeight * 0.35 },
      { x: -panelWidth * 0.35, z: -panelHeight * 0.35 },
      { x: panelWidth * 0.35, z: -panelHeight * 0.35 }
    ];
    positions.forEach(({ x, z }) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(poleRadius, poleRadius, standHeight, 8),
        standMat
      );
      pole.position.set(x, -standHeight / 2, z);
      pole.castShadow = true;
      pole.receiveShadow = true;
      pole.name = "StandPole";
      this.standGroup.add(pole);
    });
    const beamMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(standColorVal),
      roughness: 0.4,
      metalness: 0.7
    });
    const beamRadius = 0.025;
    const createBeam = (z) => {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(beamRadius, beamRadius, panelWidth * 0.7, 8),
        beamMat
      );
      beam.rotation.z = Math.PI / 2;
      beam.position.set(0, -standHeight + 0.05, z);
      beam.name = "Beam";
      this.standGroup.add(beam);
    };
    createBeam(panelHeight * 0.35);
    createBeam(-panelHeight * 0.35);
  }
}
export {
  SolarPanel
};
