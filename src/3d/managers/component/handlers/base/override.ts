/**
 * override — per-instance 材质/transform 覆盖的公共 apply 工具（handler 共用，勿各自重写）。
 *
 * handler 顶部声明自己的 SUB_OVERRIDES: Record<string, OverrideSpec> = {}（数据私有，
 * host patch 工具按 __id 读写它落盘）；create 循环建子物后调 applyOverride(SUB_OVERRIDES, m, cid)
 * 查表命中才盖（per-instance 改动盖默认值，不命中保持默认）。
 *
 * applySyncProps 复用 3d-components 材质写入标准（duck-type 守卫 + needsUpdate），
 * 与 createScene3D.ts 编辑态直改同源；跨 @types/three 双版本（本仓 0.185 vs 3d-components 0.183）
 * 须 as unknown as 桥接，勿删 cast。
 */
import type * as THREE from 'three';
import { applySyncProps, type MaterialConfig } from '@a3d/a3d-components/material';

export type OverrideSpec = {
  material?: MaterialConfig;
  transform?: { position?: number[]; rotation?: number[]; scale?: number[] };
};

/**
 * 查 override Map 命中项盖到实例 m（材质原地改字段 + transform fromArray/set）。
 * 不命中保持默认值。per-instance 材质须已独立（每实例 new / GLB shareMaterial:false）。
 * 多材质 mesh（material 为数组）跳过 material apply（对齐 createScene3D.applyMaterial）。
 */
export const applyOverride = (
  map: Record<string, OverrideSpec>,
  m: THREE.Object3D,
  cid: string,
): void => {
  const ov = map[cid];
  if (!ov) {
    return;
  }
  if (ov.material) {
    const mesh = m as THREE.Mesh;
    const raw = mesh.material;
    if (raw && !Array.isArray(raw)) {
      applySyncProps(
        raw as unknown as Parameters<typeof applySyncProps>[0],
        ov.material,
      );
    }
  }
  if (ov.transform?.position) {
    m.position.fromArray(ov.transform.position);
  }
  if (ov.transform?.rotation) {
    m.rotation.set(
      ov.transform.rotation[0] ?? 0,
      ov.transform.rotation[1] ?? 0,
      ov.transform.rotation[2] ?? 0,
    );
  }
  if (ov.transform?.scale) {
    m.scale.set(
      ov.transform.scale[0] ?? 1,
      ov.transform.scale[1] ?? 1,
      ov.transform.scale[2] ?? 1,
    );
  }
};
