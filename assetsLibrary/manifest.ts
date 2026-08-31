/**
 * assetsLibrary/manifest — 3D 资源库清单（静态模型 manifest）
 *
 * 设计文档 3D_CODEGEN_DESIGN.md §3D 资源库：每资源一条元数据（id / 名称 / 类别 / 标签 /
 * 缩略图URL / 路径 / 格式 / 多边形数 / 描述），二进制不喂。handler 经
 *   ctx.loadModel('asset:example')          // 便捷（对齐文档 API，Step 3 加）
 *   ctx.shared.resources.cloneModel('asset:example')   // 直接门面（exampleHandler 用）
 * 引用；ResourceManager 解析 `asset:` → key → AssetCache 加载。
 *
 * 为什么是 .ts 不是 .json：assetCatalog.ts 的 GLB 走 Vite `?url` 导入（构建期 emit 带
 * hash URL），必须在模块里 import 才能拿到解析后的 URL；JSON 无法 import ?url。src 直接
 * 写在每个 ASSET_CATALOG 条目里（assetCatalog.ts 单一维护源），本文件 import 消费即可。
 *
 * 新增静态资产：全在 assetCatalog.ts（单一维护源，3 步：放 models/ + import ?url +
 * ASSET_CATALOG 加条目含 src）。本文件不改。
 * registerModels 会遍历 ASSET_MANIFEST 批量 registerModel + setAssetManifest（供 searchAssets）。
 *
 * 动态资源（混元生成 GLB）不走本 manifest，走 src='hunyuan:prompt'（Step 5 接入）。
 */
import { ASSET_CATALOG, type AssetCatalogEntry } from './assetCatalog';

/**
 * 资源库条目（manifest 内部用）= AssetCatalogEntry（src 已含其内）。
 * assetCatalog.ts 的 ASSET_CATALOG 条目自带 src，本类型即其别名（注册 + 检索共用）。
 */
export type AssetEntry = AssetCatalogEntry;

/** 检索结果（同 AssetEntry 但剥 src——给 LLM/host 看的元数据，不含内部 URL）。 */
export interface AssetSearchResult {
  id: string;
  name: string;
  category: string;
  tags: string[];
  thumbnail?: string;
  format: 'glb' | 'gltf';
  polycount?: number;
  description?: string;
}

/**
 * 资源库 manifest（注册源 + 检索数据源）= assetCatalog.ts 的 ASSET_CATALOG（条目自带 src）。
 * registerModels 遍历批量 registerModel + setAssetManifest（供 searchAssets 检索）。
 */
export const ASSET_MANIFEST: AssetEntry[] = ASSET_CATALOG;

/**
 * 纯函数检索：按 query 在 entries 里找匹配，返回元数据（剥 src）。
 *
 * - query 按空白/逗号拆词、小写、滤空；
 * - haystack = name + category + tags + description（小写）；
 * - **任一词命中即返回**（OR，宽召回；小库优先召回率，LLM 从结果里精选）；
 * - 空 query 返回全部；返回时剥 src。
 */
/** AssetEntry → AssetSearchResult（剥 src）。 */
const toSearchResult = (e: AssetEntry): AssetSearchResult => ({
  // 显式列字段，避免意外带出 src（不用解构 + rest，因 rest 会保留 src）。
  id: e.id,
  name: e.name,
  category: e.category,
  tags: e.tags,
  thumbnail: e.thumbnail,
  format: e.format,
  polycount: e.polycount,
  description: e.description,
});

export const searchAssetEntries = (
  entries: AssetEntry[],
  query: string,
): AssetSearchResult[] => {
  const terms = query.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (terms.length === 0) {
    return entries.map(toSearchResult);
  }
  return entries
    .filter((e) => {
      const haystack = [e.name, e.category, ...e.tags, e.description ?? '']
        .join(' ')
        .toLowerCase();
      return terms.some((t) => haystack.includes(t));
    })
    .map(toSearchResult);
};
