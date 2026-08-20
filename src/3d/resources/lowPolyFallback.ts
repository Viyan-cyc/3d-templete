/**
 * lowPolyFallback — 混元失败 / 无密钥时的语义化低模兜底
 *
 * 按 prompt 关键词造风机 / 树 / 楼 / 车 / 默认方盒（three 原语低分段，MeshStandardMaterial PBR），
 * GLTFExporter → GLB bytes 喂 AssetCache（与混元真实 GLB 走同一消费路径）。
 * 原点约定：底面中心在 y=0，向上生长，对齐场景地面。
 * ResourceManager 传入的 prompt 已 toLowerCase().trim()，英文关键词按小写匹配。
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** 低模命中规则：首个关键词命中的形状胜出（顺序即优先级）。 */
interface ShapeRule {
  keys: string[];
  build: (prompt: string) => THREE.Object3D;
}

// 复用单个 exporter（parseAsync 无状态，跨调用共享安全）。
const exporter = new GLTFExporter();

// 确定性字符串哈希：用 prompt 给默认方盒配色（同 prompt 同色，跨实例一致）。
const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

// 风机：圆柱塔 + 机舱 + 3 片叶片（各转 120°，叶片几何上移使其从机舱向外伸）。
const buildWindTurbine = (): THREE.Object3D => {
  const group = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4, 8), shellMat);
  tower.position.y = 2;
  group.add(tower);
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), shellMat);
  nacelle.position.y = 4.1;
  group.add(nacelle);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.05), bladeMat);
    blade.geometry.translate(0, 0.8, 0);
    blade.position.set(0, 4.1, 0);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    group.add(blade);
  }
  return group;
};

// 树：圆柱干 + 3 层圆锥冠（逐层收窄拔高）。
const buildTree = (): THREE.Object3D => {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 2, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4f2a }),
  );
  trunk.position.y = 1;
  group.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1 - i * 0.22, 1.2, 8), leafMat);
    cone.position.y = 2 + i * 0.7;
    group.add(cone);
  }
  return group;
};

// 楼：4 层方盒堆叠（逐层抬升，等宽）。
const buildBuilding = (): THREE.Object3D => {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6 });
  for (let i = 0; i < 4; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), mat);
    box.position.y = 0.5 + i;
    group.add(box);
  }
  return group;
};

// 车：车身 + 顶舱 + 4 轮（圆柱绕 X 转 90°，轴向沿 Z）。
const buildCar = (): THREE.Object3D => {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1565c0 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1), mat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.9), mat);
  cabin.position.set(-0.1, 1, 0);
  group.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8);
  const wheelPos: [number, number, number][] = [
    [0.6, 0.25, 0.5],
    [0.6, 0.25, -0.5],
    [-0.6, 0.25, 0.5],
    [-0.6, 0.25, -0.5],
  ];
  for (const [x, y, z] of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.rotation.x = Math.PI / 2;
    group.add(wheel);
  }
  return group;
};

// 默认方盒 + 底座：用 prompt 哈希配色（有辨识度、确定性）。
const buildDefault = (prompt: string): THREE.Object3D => {
  const group = new THREE.Group();
  const hue = (hashString(prompt) % 360) / 360;
  const color = new THREE.Color();
  color.setHSL(hue, 0.5, 0.5);
  const mat = new THREE.MeshStandardMaterial({ color });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  box.position.y = 0.5;
  group.add(box);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 8), mat);
  base.position.y = 0.05;
  group.add(base);
  return group;
};

const SHAPES: ShapeRule[] = [
  { keys: ['风机', '风力', '风车', 'wind', 'turbine'], build: buildWindTurbine },
  { keys: ['树', '木', 'tree'], build: buildTree },
  { keys: ['楼', '建筑', 'building', 'tower', '大厦'], build: buildBuilding },
  { keys: ['车', '汽车', 'car', 'vehicle'], build: buildCar },
];

/** 按 prompt 关键词选低模形状；无命中回落默认方盒（同 prompt 同色）。 */
export const createLowPolyObject = (prompt: string): THREE.Object3D => {
  for (const rule of SHAPES) {
    if (rule.keys.some((k) => prompt.includes(k))) {
      return rule.build(prompt);
    }
  }
  return buildDefault(prompt);
};

/** 导出 GLB bytes：Object3D → GLTFExporter(binary) → ArrayBuffer。喂 AssetCache（与真实混元 GLB 同路径）。 */
export const lowPolyGlbBytes = async (prompt: string): Promise<{ bytes: ArrayBuffer }> => {
  const obj = createLowPolyObject(prompt);
  const result = await exporter.parseAsync(obj, { binary: true });
  return { bytes: result as ArrayBuffer };
};
