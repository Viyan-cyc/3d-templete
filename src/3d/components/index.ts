/**
 * components — 组件层入口
 *
 * 结构（两种组件来源都在此）：
 *   base/              本地通用底座（工具 + 通用组件 Primitive/Text/Model，无业务属性）
 *   @a3d/a3d-components npm 组件（Wall/Grid/HeatMap/MeshReflectorMaterial… 直接 import + new）
 *   AssetPool.ts       Geometry/Material 缓存
 *
 * 所有组件（本地 + npm）统一 barrel import + 直接 new，无工厂中间层。
 */

export { AssetPool } from './AssetPool';

// ---- 本地通用底座（base）----
export * from './base';

// ---- npm 组件 barrel（@a3d/a3d-components，直接 import + new）----
export * from '@a3d/a3d-components/core';
export * from '@a3d/a3d-components/heat';
export * from '@a3d/a3d-components/material';
