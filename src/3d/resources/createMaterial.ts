/**
 * createMaterial — 内联材质（模式A）创建辅助
 *
 * 组合 3d-components 导出的 createMaterial / applySyncProps / 贴图槽位工具，
 * 把一份 MaterialConfig 同步建成 THREE.Material，贴图经 AssetCache 异步回填同一实例。
 * 不重复实现工厂逻辑（类型映射 / 属性写入 / 槽位遍历都复用 3d-components）。
 */
import type * as THREE from 'three';
import type { AssetCache } from '@cyc/3d-components';
import {
  createMaterial,
  applySyncProps,
  getDeclaredSlots,
  assignTextureSlot,
  toLoadOpts,
  hasSlot,
  type MaterialConfig,
  type MaterialType,
} from '@cyc/3d-components/material';
import type { LiveDataMaterial } from '../scene/loader';

const VALID_TYPES = new Set<MaterialType>(['standard', 'basic', 'physical', 'phong', 'lambert']);

const isMaterialType = (t: string): t is MaterialType => VALID_TYPES.has(t as MaterialType);

/**
 * LiveDataMaterial（数据内联，map 是字符串 URL）→ MaterialConfig（map 是 TextureDescriptor）。
 * 物理扩展属性（transmission / clearcoat / sheen…）透传，lossless。
 */
export const liveMaterialToConfig = (def: LiveDataMaterial): MaterialConfig => {
  const cfg: MaterialConfig = { type: isMaterialType(def.type) ? def.type : 'standard' };
  if (def.color !== undefined) {
    cfg.color = def.color;
  }
  if (def.roughness !== undefined) {
    cfg.roughness = def.roughness;
  }
  if (def.metalness !== undefined) {
    cfg.metalness = def.metalness;
  }
  if (def.transmission !== undefined) {
    cfg.transmission = def.transmission;
  }
  if (def.ior !== undefined) {
    cfg.ior = def.ior;
  }
  if (def.thickness !== undefined) {
    cfg.thickness = def.thickness;
  }
  if (def.clearcoat !== undefined) {
    cfg.clearcoat = def.clearcoat;
  }
  if (def.clearcoatRoughness !== undefined) {
    cfg.clearcoatRoughness = def.clearcoatRoughness;
  }
  if (def.sheen !== undefined) {
    cfg.sheen = def.sheen;
  }
  if (def.sheenColor !== undefined) {
    cfg.sheenColor = def.sheenColor;
  }
  if (def.transparent !== undefined) {
    cfg.transparent = def.transparent;
  }
  if (def.opacity !== undefined) {
    cfg.opacity = def.opacity;
  }
  if (def.map) {
    cfg.map = { url: def.map };
  }
  return cfg;
};

/**
 * 由 MaterialConfig 同步创建材质：createMaterial + applySyncProps，贴图异步回填。
 * 贴图加载失败不抛（仅 console.error），材质仍可用（无贴图）。
 */
export const createMaterialFromConfig = (def: MaterialConfig, cache: AssetCache): THREE.Material => {
  const mat = createMaterial(def.type);
  applySyncProps(mat, def);
  for (const { slot, desc } of getDeclaredSlots(def)) {
    if (desc === null) {
      assignTextureSlot(mat, slot, null);
    } else {
      cache.loadTextureFromUrl(desc.url, toLoadOpts(desc))
        .then((tex) => {
          if (hasSlot(mat, slot)) {
            assignTextureSlot(mat, slot, tex);
          }
        })
        .catch((err) => {
          console.error(`[resources] 贴图加载失败: ${desc.url} (slot ${slot})`, err);
        });
    }
  }
  return mat;
};
