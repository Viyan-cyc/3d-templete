/**
 * registerModels — 模式B 静态资源注册（模型 + 贴图）
 *
 * 模型来自资源库 manifest（assetsLibrary/manifest.ts 的 ASSET_MANIFEST）：
 * 遍历条目批量 registerModel(id, src) + setAssetManifest（供 searchAssets 检索）。
 * 数据 / handler 里用
 *   src='asset:example'  或  ctx.loadModel('asset:example')           // 便捷（对齐文档 API）
 *                          ctx.shared.resources.cloneModel('asset:example')  // 直接门面
 *   ctx.shared.resources.loadTexture(key)                              // 贴图
 * 引用。混元（按需生成）走 setHunyuanGenerator，src='hunyuan:prompt' 触发。
 *
 * 新增静态模型：把 .glb/.gltf 放到 assetsLibrary/models/，在 manifest.ts 里
 * `import xxxUrl from './models/xxx.glb?url'` + 加一条 ASSET_MANIFEST 条目即可（本文件无需改）。
 * 新增静态贴图：把图放到 src/3d/assets/textures/，import '?url'，加进下方 textureRegistry。
 */
import { ASSET_MANIFEST } from '../../../assetsLibrary/manifest';
import { getResourceManager } from './ResourceManager';
import { hunyuanGenerator } from './hunyuan';

/**
 * 贴图注册表：key → 资源 URL。组件用 loadTexture(key) 取独立贴图。
 * 注：example.jpg 走主题材质（registerMaterials.ts 的 map:{url}），不在此按 key 注册。
 */
const textureRegistry: Record<string, string> = {};

/** 注册所有静态模型（manifest 驱动）+ 贴图 + 混元生成器（幂等）。在 createScene3D step0 调用。 */
export const registerModels = (): void => {
  const r = getResourceManager();
  // manifest 驱动批量注册模型 + 注入 manifest 供 searchAssets 检索
  r.setAssetManifest(ASSET_MANIFEST);
  for (const entry of ASSET_MANIFEST) {
    r.registerModel(entry.id, entry.src);
  }
  for (const [key, url] of Object.entries(textureRegistry)) {
    r.registerTexture(key, url);
  }
  r.setHunyuanGenerator(hunyuanGenerator);
};
