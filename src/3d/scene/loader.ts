/**
 * loader — live-data 场景配置加载 + 类型定义
 *
 * 只负责取 JSON 和定义数据结构;环境装配在 environment.ts,物体生命周期在 objects.ts。
 */

export interface LiveDataConfig {
  version?: string
  scene?: {
    background?: string
    environment?: { preset: string; intensity: number }
    fog?: { type: string; color: string; near: number; far: number }
    renderStyle?: string
  }
  camera?: LiveDataCamera
  lights?: LiveDataLight[]
  objects?: LiveDataObject[]
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
  type: 'ambient' | 'hemisphere' | 'directional'
  color?: string
  skyColor?: string
  groundColor?: string
  intensity: number
  position?: number[]
  target?: number[]
  castShadow?: boolean
  shadow?: {
    mapSize?: number
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

export interface LiveDataObject {
  id: string
  type: 'group' | 'mesh' | 'component' | 'glb' | 'model'
  parentId: string | null
  position?: number[]
  rotation?: number[]
  scale?: number[]
  geometry?: LiveDataGeometry
  material?: LiveDataMaterial
  component?: LiveDataComponent

  // 模型资源引用（type==='glb'/'model'，或 resolver 链中 component 未命中时回落用）。
  //  - 'asset:windmill' → 本地 modelRegistry（Vite ?url）+ GLTFLoader
  //  - 'http(s)://...' → 远程 + 按扩展名选 loader
  //  - 'hunyuan:风力发电机' → 混元单次生成缓存（占位 throw，回落 mesh）
  //
  src?: string
  castShadow?: boolean
  receiveShadow?: boolean

  // 分区容器标记（由宿主 octoapp mergeSceneObjects 据 planner.slots 注入）。
  //  zone 身份权威来源，支持嵌套分区；无标记时下方标记逻辑回落到「root 直接子=zone」启发式。
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 宿主注入的 JSON 契约字段，不可改名
  __zone?: boolean
}

export interface LiveDataComponent {

  /** 内置 builder 组件类型名（如 rack），走对应垂域 handler（如 rackHandler） */
  type: string
  params?: Record<string, number | string>

  /** 3d-components 组件类名（Grid/Wall/HeatMesh 等），resolver 链最高优先级，走 library-bridge */
  name?: string

  /** 透传给 3d-components 组件构造器的 options（对齐 ComponentOptions 对象模式） */
  options?: Record<string, unknown>
}

export interface LiveDataGeometry {
  type: string
  params?: Record<string, number | string>
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

// 从 URL 加载 live-data 场景配置。
//  URL 参数 `?fetch=<file>` 指定场景文件（与 pattern 实时预览协议一致）；
//  无参数时回落到 defaultFile（默认 live-data.json）。
export const loadLiveDataConfig = async (defaultFile = 'live-data.json'): Promise<LiveDataConfig> => {
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
