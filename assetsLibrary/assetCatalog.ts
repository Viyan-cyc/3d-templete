/**
 * assetsLibrary/assetCatalog —— 资产目录（元数据 + src，单一维护源）
 *
 * 供 host codegen 读 workspace 注入 plan prompt（[可用资产清单]）+ manifest.ts 据此构造
 * ASSET_MANIFEST。host 整文件注入（不解析）——LLM 读源码即知可用 asset:<id> + 名称 + tags +
 * 描述，永随本文件同步（manifest 对 codegen 不可变，LLM 只改 handler、overlayVersionCode
 * 不碰 assetsLibrary，故 workspace 本文件 == 母版，无陈旧）。
 *
 * 新增静态资产（全在此文件）：
 *   1) .glb/.gltf 放 assetsLibrary/models/
 *   2) 顶部 `import xxxUrl from './models/xxx.glb?url'`
 *   3) ASSET_CATALOG 加一条 { id:'xxx', name, category, tags, format, description, src: xxxUrl }
 * src 必填——漏写 TS 编译报错（比 SRC_BY_ID 映射漏写致 src:undefined 静默失败更安全）。
 * 扩充模板勿留 ASSET_CATALOG（会误导 LLM 用未注册 id），放下方注释。
 */
import exampleUrl from './models/example.glb?url';
import rackUrl from './models/rack.glb?url';

/**
 * 资源条目（元数据 + src）。manifest.ts 据此 ASSET_MANIFEST 注册 + 检索（检索剥 src）。
 */
export interface AssetCatalogEntry {

  /** 资源 id，即 `asset:<id>` 的 key（如 'rack'）。全库唯一。 */
  id: string;

  /** 显示名（中文，LLM/人读）。 */
  name: string;

  /** 类别：'demo' | 'equipment' | 'building' | 'vegetation' | 'vehicle' | ... */
  category: string;

  /** 检索标签（小写英文为主，可混中文）。 */
  tags: string[];

  /** 缩略图 URL（多模态选资源，先全 undefined）。 */
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

/**
 * 真实已注册条目（host 读此注入 plan prompt）。
 * 注释模板勿留此——会混淆 LLM 用未注册 id。扩充模板见下方注释。
 */
export const ASSET_CATALOG: AssetCatalogEntry[] = [
  {
    id: 'example',
    name: '示例模型',
    category: 'demo',
    tags: ['example', 'glb', 'demo'],
    format: 'glb',
    description: '引擎自带示例 GLB，exampleField handler 用（验证资源加载链路）。',
    src: exampleUrl,
  },
  {
    id: 'rack',
    name: '机柜',
    category: 'equipment',
    tags: ['rack', '机柜', 'server', 'cabinet', '机房', '设备'],
    format: 'glb',
    description: '标准服务器机柜模型，机房 / 数据中心场景用。',
    src: rackUrl,
  },
];

// ── 扩充模板（3 步启用：① 顶部 import ?url ② 取消注释填实条目 ③ src 填 xxxUrl）──
// { id: 'tree01', name: '低面树', category: 'vegetation',
//   tags: ['tree','low-poly','植物'], format: 'glb', polycount: 200,
//   description: '低面数树木，场景绿化用。', src: tree01Url }   // 需顶部 import tree01Url
// { id: 'building01', name: '办公楼', category: 'building',
//   tags: ['building','建筑','office'], format: 'glb', polycount: 5000,
//   description: '现代办公楼模型。', src: building01Url }
// { id: 'car01', name: '轿车', category: 'vehicle',
//   tags: ['car','车辆','sedan'], format: 'glb', polycount: 3000,
//   description: '家用轿车模型。', src: car01Url }
