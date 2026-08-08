/**
 * resources — 资源注册 + 统一门面
 *
 * ResourceManager 持有全局唯一 AssetCache + MaterialManager，统一模式A（数据内联）
 * 与模式B（代码注册）两种资源。handler 经 ctx.shared.resources 访问模型 / 材质。
 *
 * 接入：
 *   - 静态模型 / 混元生成器 → registerModels.ts
 *   - 主题材质 → registerMaterials.ts
 *   - 两者均在 createScene3D step0 由 registerModels() / registerMaterials() 调用一次
 */
export { getResourceManager } from './ResourceManager';
export type { ResourceManager, CloneModelOpts, HunyuanGenerator } from './ResourceManager';
export { registerModels } from './registerModels';
export { registerMaterials } from './registerMaterials';
export { liveMaterialToConfig, createMaterialFromConfig } from './createMaterial';
