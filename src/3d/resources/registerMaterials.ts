/**
 * registerMaterials — 模式B 材质注册（主题）
 *
 * themes：theme 名 → { 材质 key → MaterialConfig }。
 * handler 用 copy('example', cb) / clone('example', cb) 取主题材质；setTheme 切换原地改写（引用不变）。
 * 未配置任何 theme 时跳过（仅用模式A 内联材质）。
 */
import exampleJpgUrl from '../assets/textures/example.jpg?url';
import { getResourceManager } from './ResourceManager';
import type { MaterialConfig, Theme } from '@cyc/3d-components/material';

// example 主题材质：贴图固定 example.jpg，主题调 roughness / metalness / color。
const exampleDefault: MaterialConfig = {
  type: 'standard', map: { url: exampleJpgUrl }, roughness: 0.6, metalness: 0.1,
};
const exampleDark: MaterialConfig = {
  type: 'standard', map: { url: exampleJpgUrl }, roughness: 0.8, metalness: 0.2, color: 0x888888,
};
// exampleFlat：纯色材质（无贴图），对照 example（带贴图）——去掉 map 字段、用 color 配色即为纯色。
const exampleFlatDefault: MaterialConfig = {
  type: 'standard', color: 0x4488ff, roughness: 0.5, metalness: 0.2,
};
const exampleFlatDark: MaterialConfig = {
  type: 'standard', color: 0x224488, roughness: 0.7, metalness: 0.3,
};

const themes: Record<string, Theme> = {
  default: { example: exampleDefault, exampleFlat: exampleFlatDefault },
  dark: { example: exampleDark, exampleFlat: exampleFlatDark },
};

/** 配置主题材质（幂等：构造唯一 MaterialManager）。在 createScene3D step0 调用。 */
export const registerMaterials = (): void => {
  const keys = Object.keys(themes);
  if (keys.length === 0) {
    return;
  }
  getResourceManager().configureMaterials({ themes, current: keys[0] });
};
