import * as THREE from 'three';
import type { ComponentOptions } from '../base/types';
import { createLiveMaterial } from '../base/material';
import { assetPool } from '../base/assets';
import { applyTransform } from '../base/transform';

/**
 * Rack 货架组件 —— 程序化生成多层置物架（4 根立柱 + N 层搁板）。
 * 与 UXAI scene-protocol 的 rack 组件保持一致。子节点带 name（postBL/shelf0…），
 * 构造末尾据此写子节点 userData.id 供 parentId 引用 + raycaster 识别。
 */
export class RackComponent extends THREE.Group {
  constructor(opts: ComponentOptions) {
    super();
    const p = opts.params ?? {};
    const levels = Math.max(2, Math.min(20, Math.floor(Number(p.levels) || 4)));
    const width = Number(p.width) > 0 ? Number(p.width) : 2;
    const height = Number(p.height) > 0 ? Number(p.height) : 2;
    const depth = Number(p.depth) > 0 ? Number(p.depth) : 0.6;
    const mat = createLiveMaterial(opts.material);

    const postSize = 0.08;
    const shelfThick = 0.04;
    const halfW = width / 2 - postSize / 2;
    const halfD = depth / 2 - postSize / 2;

    const postGeo = assetPool.getGeometry(
      `rack:post:${postSize},${height},${postSize}`,
      () => new THREE.BoxGeometry(postSize, height, postSize),
    );
    const corners: Array<[string, number, number]> = [
      ['postBL', -halfW, -halfD],
      ['postBR', halfW, -halfD],
      ['postTL', -halfW, halfD],
      ['postTR', halfW, halfD],
    ];
    for (const [name, cx, cz] of corners) {
      const post = new THREE.Mesh(postGeo, mat);
      post.name = name;
      post.position.set(cx, height / 2, cz);
      post.castShadow = true;
      post.receiveShadow = true;
      this.add(post);
    }

    const shelfGeo = assetPool.getGeometry(
      `rack:shelf:${width},${shelfThick},${depth}`,
      () => new THREE.BoxGeometry(width, shelfThick, depth),
    );
    for (let i = 0; i < levels; i++) {
      const y = levels > 1 ? (i / (levels - 1)) * height : 0;
      const shelf = new THREE.Mesh(shelfGeo, mat);
      shelf.name = `shelf${i}`;
      shelf.position.set(0, y, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      this.add(shelf);
    }

    // name + transform + 子节点 userData.id
    if (opts.id) {
      this.name = opts.id;
    }
    applyTransform(this, opts);
    const prefix = opts.id ?? '';
    for (const child of this.children) {
      child.userData.id = `${prefix}_${child.name}`;
    }
  }
}
