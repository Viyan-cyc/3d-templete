/**
 * geometry — 按 geoDef.type 创建 BufferGeometry（8 种基础几何体）
 *
 * 从原 liveDataLoader.createLiveGeometry 拆出。供 primitive 组件与 scene/objects.ts 的 patchObject 复用。
 * 契约：返回 BufferGeometry | null。text 不在此（text 在 TextComponent 单独处理，返回完整 Mesh），
 * 故 patch 路径遇 text 返回 null 跳过，行为与原实现一致。
 */
import * as THREE from 'three';
import type { LiveDataGeometry } from '../../scene/loader';

/** 从参数表取一个数值，缺省时回落到 def */
const num = (p: Record<string, number>, key: string, def: number): number => p[key] ?? def;

export const createGeometry = (geoDef: LiveDataGeometry): THREE.BufferGeometry | null => {
  const p = (geoDef.params ?? {}) as Record<string, number>;

  switch (geoDef.type) {
    case 'box':
      return new THREE.BoxGeometry(num(p, 'width', 1), num(p, 'height', 1), num(p, 'depth', 1));
    case 'plane':
      return new THREE.PlaneGeometry(num(p, 'width', 1), num(p, 'height', 1));
    case 'sphere':
      return new THREE.SphereGeometry(
        num(p, 'radius', 1),
        num(p, 'widthSegments', 32),
        num(p, 'heightSegments', 16),
      );
    case 'cylinder':
      return new THREE.CylinderGeometry(
        num(p, 'radiusTop', 1),
        num(p, 'radiusBottom', 1),
        num(p, 'height', 1),
        num(p, 'radialSegments', 32),
      );
    case 'cone':
      return new THREE.ConeGeometry(
        num(p, 'radius', 1),
        num(p, 'height', 1),
        num(p, 'radialSegments', 16),
      );
    case 'torus': {
      const inner = num(p, 'innerRadius', 1);
      const outer = num(p, 'outerRadius', 2);
      const radius = (inner + outer) / 2;
      const tube = (outer - inner) / 2;
      return new THREE.TorusGeometry(
        radius,
        tube,
        num(p, 'radialSegments', 12),
        num(p, 'thetaSegments', 64),
        num(p, 'arc', Math.PI * 2),
      );
    }
    case 'circle':
      return new THREE.CircleGeometry(num(p, 'radius', 1), num(p, 'segments', 32));
    case 'ring':
      return new THREE.RingGeometry(
        num(p, 'innerRadius', 0.5),
        num(p, 'outerRadius', 1),
        num(p, 'thetaSegments', 64),
        num(p, 'phiSegments', 1),
      );
    default:
      console.warn(`[geometry] 未知几何体类型: ${geoDef.type}`);
      return null;
  }
};
