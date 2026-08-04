import * as THREE from 'three';
import type { ComponentOptions } from './types';
import { createLiveMaterial } from './material';
import { applyTransform, applyShadow } from './transform';

/**
 * 基础几何体组件：box/plane/sphere/cylinder/cone/torus/circle/ring 统一一个类，
 * 替代原先 8 个近似 primitive 类。geometry 由 primitiveHandler 经 createGeometry(...)
 * 算好传入（分支在 createGeometry，与 patchObject 共用）。text 不在此（走 TextComponent）。
 */
export class PrimitiveComponent extends THREE.Mesh {
  constructor(opts: ComponentOptions, geo: THREE.BufferGeometry) {
    super(geo, createLiveMaterial(opts.material));
    if (opts.id) {
      this.name = opts.id;
    }
    applyTransform(this, opts);
    applyShadow(this, opts);
  }
}
