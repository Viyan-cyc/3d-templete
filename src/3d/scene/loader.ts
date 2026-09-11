/**
 * loader — 树形场景配置加载 + 类型定义
 *
 * 只负责取 JSON 和定义数据结构；环境装配在 environment.ts，物体生命周期在 objects.ts。
 *
 * 数据格式（分组扁平 + parentId）：
 *   顶层 = type 分组字典（key 是 type 名，value 一律是 TreeNode[]）+ 可选环境字段 + remove。
 *   节点 = { id, params, parentId }（无 type 字段——type = 分组 key；无 children 字段——父子靠 parentId）。
 *   只有根节点 parentId=null；子节点 parentId 指向父（可跨分组）。
 */

/**
 * 单个树节点（内部展开后）。
 * raw JSON 节点只有 {id, params, parentId}（无 type——type = 分组 key）；
 * buildNodeIndex 展开 raw JSON 时把分组 key 作为 type 附上，故内部流转的 TreeNode 带 type。
 */
export interface TreeNode {

  /** 节点 type（= 所在分组 key，buildNodeIndex 展开 raw JSON 时附上） */
  type: string

  /** 节点 id（CRUD 幂等键，写入 userData.__id） */
  id: string

  /** 实例属性（业务字段 + 可选 position/rotation/scale/castShadow/receiveShadow） */
  params: Record<string, unknown>

  /** 父节点 id；根节点为 null。handler 通过 ctx.getChildren(id) 查 children 递归建子树 */
  parentId: string | null
}

/** 场景环境配置（背景/雾/PMREM） */
export interface TreeSceneEnv {
  background?: string
  environment?: { preset: string; intensity: number }

  /** fog.type: 'linear'（near/far）| 'exp'（density，FogExp2） */
  fog?: { type: string; color: string; near: number; far: number; density?: number }
  renderStyle?: string
}

/**
 * 树形场景：顶层 type 分组字典 + 环境字段 + remove。
 * - version/scene/camera/lights/renderer/controls/remove 是保留 key；
 * - 其余每个 key 是一个 type 分组（TreeNode[]），type = key 名。
 * - 索引签名让任意 type 分组都能通过类型检查。
 */
export interface TreeScene {
  version?: string
  scene?: TreeSceneEnv
  camera?: LiveDataCamera
  lights?: LiveDataLight[]
  renderer?: LiveDataRenderer
  controls?: LiveDataControls

  /** 按 id 删除（update 时先于分组处理） */
  remove?: string[]

  /** type 分组：key=type 名，value=该 type 的节点数组。单个实例也包一层数组 */
  [type: string]: unknown
}

/** 渲染器运行时可变配置（构造参数 antialias/alpha/powerPreference 不在此；缺省走 templete 默认） */
export interface LiveDataRenderer {

  /** 色调映射，见 TONE_MAPPINGS 键（RendererManager） */
  toneMapping?: string
  toneMappingExposure?: number

  /** 阴影贴图类型：'BasicShadowMap'|'PCFShadowMap'|'PCFSoftShadowMap'|'VSMShadowMap' */
  shadowMapType?: string

  /** 输出色彩空间：'srgb' | 'linear' */
  outputColorSpace?: string
  autoClear?: boolean
}

/** 轨道控制器运行时可变配置（缺省走 OrbitControls 默认） */
export interface LiveDataControls {
  enableDamping?: boolean
  dampingFactor?: number
  minDistance?: number
  maxDistance?: number

  /** 极角上限（弧度，防穿地下） */
  maxPolarAngle?: number
  enableRotate?: boolean
  enableZoom?: boolean
  enablePan?: boolean
  autoRotate?: boolean
  autoRotateSpeed?: number
  target?: { x: number; y: number; z: number }
}

export interface LiveDataCamera {

  /** 相机类型，默认 'perspective'（透视） */
  type?: 'perspective' | 'orthographic'
  position?: number[]
  lookAt?: number[]
  perspective?: { fov: number; near: number; far: number }
  orthographic?: {
    left: number
    right: number
    top: number
    bottom: number
    near: number
    far: number
    zoom?: number
  }
}

export interface LiveDataLight {
  type: 'ambient' | 'hemisphere' | 'directional' | 'point' | 'spot' | 'rectarea'
  color?: string
  skyColor?: string
  groundColor?: string
  intensity: number
  position?: number[]
  target?: number[]
  castShadow?: boolean

  /** point/spot：物理衰减距离与衰减系数 */
  distance?: number
  decay?: number

  /** spot：光锥半角（弧度）与半影软边（0-1） */
  angle?: number
  penumbra?: number

  /** rectarea：发光面尺寸 */
  width?: number
  height?: number
  shadow?: {
    mapSize?: number

    /** 阴影偏移（消痤疮条纹）；normalBias 消缝隙，radius 软化（PCFSoft/VSM） */
    bias?: number
    normalBias?: number
    radius?: number
    camera?: {
      near: number
      far: number
      left: number
      right: number
      top: number
      bottom: number
    }
  }
}

export interface LiveDataGeometry {
  type: string
  params?: Record<string, unknown>
}

export interface LiveDataMaterial {
  type: string
  color?: string
  roughness?: number
  metalness?: number
  transmission?: number
  ior?: number
  thickness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  sheen?: number
  sheenColor?: string
  transparent?: boolean
  opacity?: number
  map?: string
}

export interface ApplyLiveDataOptions {

  /** 视口尺寸，用于计算 OrthographicCamera 的 aspect */
  viewSize: { width: number; height: number }

  /** 是否保留 app.scene 中已有的物体（默认清空） */
  keepExisting?: boolean

  /** 场景预设名称，数据缺 scene/camera/lights 时回落到预设配置。默认 'dark' */
  preset?: string
}

/** 解析场景配置 URL：?fetch=<file> 指定文件，无参数回落 defaultFile */
const resolveFetchUrl = (fetchParam: string | null, defaultFile: string): string => {
  if (!fetchParam) {
    return `/${defaultFile}`;
  }
  return /^https?:\/\//.test(fetchParam) ? fetchParam : `/${fetchParam}`;
};

// 从 URL 加载树形场景配置。
//  URL 参数 `?fetch=<file>` 指定场景文件（与 pattern 实时预览协议一致）；
//  无参数时回落到 defaultFile（默认 live-data.json）。
export const loadLiveDataConfig = async (defaultFile = 'live-data.json'): Promise<TreeScene> => {
  const params = new URLSearchParams(window.location.search);
  const fetchParam = params.get('fetch');
  const url = resolveFetchUrl(fetchParam, defaultFile);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`场景配置加载失败: ${res.status} ${url}`);
  }
  const config = await res.json();
  console.dir(config, { depth: null });
  return config;
};
