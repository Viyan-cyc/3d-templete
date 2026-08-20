/**
 * assets-library/manifest — 3D 资源库清单（静态模型 manifest）
 *
 * 设计文档 3D_CODEGEN_DESIGN.md §3D 资源库：每资源一条元数据（id / 名称 / 类别 / 标签 /
 * 缩略图URL / 路径 / 格式 / 多边形数 / 描述），二进制不喂。handler 经
 *   ctx.loadModel('asset:example')          // 便捷（对齐文档 API，Step 3 加）
 *   ctx.shared.resources.cloneModel('asset:example')   // 直接门面（exampleHandler 用）
 * 引用；ResourceManager 解析 `asset:` → key → AssetCache 加载。
 *
 * 为什么是 .ts 不是 .json：GLB 走 Vite `?url` 导入（构建期 emit 带 hash URL），
 * 必须在模块里 import 才能拿到解析后的 URL；JSON 无法 import。故 manifest 即注册源。
 *
 * 新增静态资源（3 步）：
 *   1) 把 .glb/.gltf 放到 assets-library/models/
 *   2) 在下方 `import xxxUrl from './models/xxx.glb?url'`
 *   3) ASSET_MANIFEST 加一条 { id, name, category, tags, format, src: xxxUrl, ... }
 * registerModels 会遍历 ASSET_MANIFEST 批量 registerModel + setAssetManifest（供 searchAssets）。
 *
 * 动态资源（混元生成 GLB）不走本 manifest，走 src='hunyuan:prompt'（Step 5 接入）。
 */
import exampleUrl from './models/example.glb?url';

/** 资源库条目（manifest 内部用，含 src）。 */
export interface AssetEntry {

  /** 资源 id，即 `asset:<id>` 的 key（如 'example'）。全库唯一。 */
  id: string;

  /** 显示名（中文，LLM/人读）。 */
  name: string;

  /** 类别：'demo' | 'building' | 'vegetation' | 'vehicle' | 'prop' | 'furniture' | ... */
  category: string;

  /** 检索标签（小写英文为主，可混中文）。 */
  tags: string[];

  /** 缩略图 URL（GLM/DeepSeek 多模态看图选资源，Step 7 用；先全 undefined）。 */
  thumbnail?: string;

  /** 模型格式。 */
  format: 'glb' | 'gltf';

  /** 三角面数（性能预估用，可选）。 */
  polycount?: number;

  /** 描述（用途/特征，检索文本之一）。 */
  description?: string;

  /** Vite `?url` 解析 URL（内部注册用，**检索结果不返回**）。 */
  src: string;
}

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
 * 资源库 manifest（注册源 + 检索数据源）。
 * 真条目 + 注释模板（演示扩法，取消注释并填 src 即可用）。
 */
export const ASSET_MANIFEST: AssetEntry[] = [
  {
    id: 'example',
    name: '示例模型',
    category: 'demo',
    tags: ['example', 'glb', 'demo'],
    format: 'glb',
    description: '引擎自带的示例 GLB 模型，exampleField handler 用（验证资源加载链路）。',
    src: exampleUrl,
  },
  // ── 扩充模板（取消注释 + 填 src 即可启用）──
  // { id: 'tree01', name: '低面树', category: 'vegetation',
  //   tags: ['tree','low-poly','植物'], format: 'glb', polycount: 200,
  //   description: '低面数树木，场景绿化用。', src: tree01Url },
  // { id: 'building01', name: '办公楼', category: 'building',
  //   tags: ['building','建筑','office'], format: 'glb', polycount: 5000,
  //   description: '现代办公楼模型。', src: building01Url },
  // { id: 'car01', name: '轿车', category: 'vehicle',
  //   tags: ['car','车辆','sedan'], format: 'glb', polycount: 3000,
  //   description: '家用轿车模型。', src: car01Url },
];

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
