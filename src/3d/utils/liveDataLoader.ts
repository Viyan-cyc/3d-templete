/**
 * Live Data 场景加载器
 *
 * 解析 live-data.json 格式的场景配置，并应用到 App3D 实例。
 * 基于 octoAgents/src/utils/sceneLoader.ts，适配到 3d-templete 架构。
 *
 * 支持：
 *  - 摄像机：perspective / orthographic
 *  - 几何体：box / plane / sphere / cylinder / cone / torus / circle / ring / text
 *  - 材质：standard / phong / basic / physical（含 transmission / ior）
 *  - 灯光：ambient / hemisphere / directional（含阴影）
 *  - 对象层级树：group / mesh / light，通过 parentId 建立父子关系
 */

import * as THREE from 'three'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import type { App3D } from '../App3D'
import { ComponentRegistry, AssetPool, registerAllBuilders } from '../components'
import { loadModel } from '../loaders/ModelLoader'
import { hasComponent, createComponentObject, initLibraryBridge } from '../library/library-bridge'

// 全局组件注册表 + 资源缓存池（组件复用 Geometry/Material，相同参数只创建一次）
// ComponentRegistry 是单例实例（非类），registerAllBuilders() 已向其注册所有 builder
registerAllBuilders()
// 初始化 3d-components 桥（注册 name→Ctor 映射，幂等）
initLibraryBridge()
const assetPool = new AssetPool()

const DEG2RAD = Math.PI / 180

// text 几何用的字体缓存（懒加载）：仅 ASCII 文字需要；中文等非 ASCII 走 canvas 贴图，不依赖字体
// 本地字体（npm three 包不含 examples/fonts，故自托管到 public/fonts）
const FONT_URL = '/fonts/helvetiker_regular.typeface.json'
let fontCache: Font | null = null
let fontPromise: Promise<unknown> | undefined

/** 预加载字体（text 几何用）。在 applyLiveDataToApp 前调用，ASCII 文字才能渲染成立体字形。 */
export async function ensureFont(): Promise<void> {
  if (fontCache || fontPromise) return
  const loader = new FontLoader()
  fontPromise = loader
    .loadAsync(FONT_URL)
    .then((f) => {
      fontCache = f as Font
    })
    .catch(() => null)
  await fontPromise
}

// ══════════════════════════════════════════════════════════════
// 类型定义
// ══════════════════════════════════════════════════════════════

export interface LiveDataConfig {
  version: string
  angleUnit: string
  scene: {
    background?: string
    environment?: { preset: string; intensity: number }
    fog?: { type: string; color: string; near: number; far: number }
    renderStyle?: string
  }
  camera: LiveDataCamera
  lights?: LiveDataLight[]
  objects?: LiveDataObject[]
}

export interface LiveDataCamera {
  type: 'perspective' | 'orthographic'
  position: number[]
  lookAt: number[]
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
  /** 模型资源引用（type==='glb'/'model'，或 resolver 链中 component 未命中时回落用）。
   *  - 'asset:windmill' → 本地 modelRegistry（Vite ?url）+ GLTFLoader
   *  - 'http(s)://...' → 远程 + 按扩展名选 loader
   *  - 'hunyuan:风力发电机' → 混元单次生成缓存（占位 throw，回落 mesh）
   */
  src?: string
  castShadow?: boolean
  receiveShadow?: boolean
  /** 分区容器标记（由宿主 octoapp mergeSceneObjects 据 planner.slots 注入）。
   *  zone 身份权威来源，支持嵌套分区；无标记时下方标记逻辑回落到「root 直接子=zone」启发式。 */
  __zone?: boolean
}

export interface LiveDataComponent {
  /** 内置 builder 组件类型名（desk/rack 等 17 个），走 ComponentRegistry.createByBuilder */
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

// ══════════════════════════════════════════════════════════════
// 加载
// ══════════════════════════════════════════════════════════════

/** 从 URL 加载 live-data 场景配置 */
export async function loadLiveDataConfig(
  defaultFile = 'live-data.json',
): Promise<LiveDataConfig> {
  const params = new URLSearchParams(window.location.search)
  const dataParam = params.get('data')
  const url = dataParam
    ? /^https?:\/\//.test(dataParam)
      ? dataParam
      : `/${dataParam}`
    : `/${defaultFile}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`场景配置加载失败: ${res.status} ${url}`)
  const config = await res.json()
  console.dir(config, { depth: null })
  return config
}

// ══════════════════════════════════════════════════════════════
// 核心：将 live-data 配置应用到 App3D
// ══════════════════════════════════════════════════════════════

export interface ApplyLiveDataOptions {
  /** 视口尺寸，用于计算 OrthographicCamera 的 aspect */
  viewSize: { width: number; height: number }
  /** 是否保留 app.scene 中已有的物体（默认清空） */
  keepExisting?: boolean
}

/**
 * 将 live-data 场景配置应用到已有的 App3D 实例（一次性建场景）。
 *
 * 会：
 * 1. 设置背景色/雾
 * 2. 根据 camera.type 替换相机（支持 OrthographicCamera）
 * 3. 清空并重建 scene 中的物体和灯光
 *
 * @returns 所有 live-data 对象的 id → Object3D 索引（供增量更新使用）
 */
export function applyLiveDataToApp(
  app: App3D,
  config: LiveDataConfig,
  options: ApplyLiveDataOptions,
): Map<string, THREE.Object3D> {
  const { viewSize } = options

  // ── 1. 场景基础 ──
  if (config.scene.background) {
    app.scene.background = new THREE.Color(config.scene.background)
  }

  if (config.scene.fog && config.scene.fog.type === 'linear') {
    const f = config.scene.fog
    app.scene.fog = new THREE.Fog(f.color, f.near, f.far)
  }

  // ── 2. 清空现有场景（保留 scene 对象本身） ──
  if (!options.keepExisting) {
    while (app.scene.children.length > 0) {
      app.scene.remove(app.scene.children[0])
    }
  }

  // ── 3. 相机替换 ──
  const camCfg = config.camera
  const aspect = viewSize.width / Math.max(viewSize.height, 1)
  let newCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera

  if (camCfg.type === 'orthographic' && camCfg.orthographic) {
    const o = camCfg.orthographic
    const halfH = Math.max(Math.abs(o.top), Math.abs(o.bottom))
    const halfW = halfH * aspect
    newCamera = new THREE.OrthographicCamera(-halfW, halfW, o.top, o.bottom, o.near, o.far)
    if (o.zoom) newCamera.zoom = o.zoom
  } else {
    const p = camCfg.perspective ?? { fov: 50, near: 0.1, far: 100 }
    newCamera = new THREE.PerspectiveCamera(p.fov, aspect, p.near, p.far)
  }

  newCamera.position.set(
    ...(camCfg.position.slice(0, 3) as [number, number, number]),
  )
  newCamera.lookAt(...(camCfg.lookAt.slice(0, 3) as [number, number, number]))
  newCamera.updateProjectionMatrix()

  // 替换 app 上的 camera（通过 setCamera，正交相机 resize 时按 aspect 重算）
  app.setCamera(newCamera)

  // ── 4. 灯光 ──
  if (config.lights) {
    for (const lc of config.lights) {
      const light = createLiveLight(lc)
      if (light) app.scene.add(light)
    }
  }

  // ── 5. 对象层级树（两遍构建） ──
  const nodeMap = new Map<string, THREE.Object3D>()
  let createdCount = 0
  let skippedCount = 0
  const debug =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true'
  if (config.objects) {
    // 第一遍：创建
    for (const oc of config.objects) {
      const node = createLiveObject3D(oc)
      if (node) {
        createdCount++
        nodeMap.set(oc.id, node)
        // 组件节点:把展开的子节点也注册进 nodeMap,供其他物体的 parentId 引用
        if (oc.type === 'component') {
          node.traverse((child) => {
            if (child.userData?.id && child !== node) {
              nodeMap.set(child.userData.id, child)
            }
          })
        }
      } else {
        // 解析失败（如 type:component 的 builder 名不存在、无可识别的 geometry/src）：
        // 原先静默跳过会导致"空场景只有背景"，这里打 warn 便于定位。
        skippedCount++
        console.warn(
          `[liveDataLoader] 无法创建物体，跳过: id=${oc.id} type=${oc.type}` +
            ` component.name=${oc.component?.name} component.type=${oc.component?.type}` +
            ` src=${oc.src ?? '-'} geometry=${oc.geometry?.type ?? '-'}`,
        )
      }
    }

    // 第二遍：挂载父节点
    for (const oc of config.objects) {
      const node = nodeMap.get(oc.id)
      if (!node) continue
      if (oc.parentId) {
        const parent = nodeMap.get(oc.parentId)
        if (parent) {
          parent.add(node)
        } else {
          app.scene.add(node)
        }
      } else {
        app.scene.add(node)
      }
    }

    // ── 标记分区(__zone) / 逻辑物体根(__logicalRoot)，供 ScenePicker「整体/部件」选中模式 ──
    // zone 身份优先读宿主注入的 o.__zone（权威源 = octoapp planner.slots.element_id，支持嵌套分区，
    //   如 tableAndPropsZone 挂在 platformAndGroundZone 下——两者都是 zone）；无任何 __zone 标记时
    //   （旧场景/示例/SAMPLE_SCENE）回落到「root 的直接子=zone」启发式。
    // logicalRoot = zone 的直接子（用户视角的"一个整体"，如一棵树/一张桌子）；排除自身也是 zone 的节点
    //   （嵌套分区下子 zone 不应被当 logicalRoot，否则点中其子孙会整体选中整个子分区——曾发的 bug）。
    // 纯 parentId 图计算，不依赖 Three 挂载结果；命中后 ScenePicker whole 模式沿父子链找 __logicalRoot。
    {
      const rootIds = new Set<string>()
      for (const o of config.objects) if (!o.parentId) rootIds.add(o.id)
      const zoneIds = new Set<string>()
      for (const o of config.objects) if (o.__zone) zoneIds.add(o.id)
      if (zoneIds.size === 0) {
        // 回落：无 __zone 标记的旧场景，用「root 的直接子」启发式
        for (const o of config.objects) if (o.parentId && rootIds.has(o.parentId)) zoneIds.add(o.id)
      }
      for (const id of zoneIds) {
        const n = nodeMap.get(id)
        if (n) n.userData.__zone = true
      }
      for (const o of config.objects) {
        if (o.parentId && zoneIds.has(o.parentId) && !zoneIds.has(o.id)) {
          const n = nodeMap.get(o.id)
          if (n) n.userData.__logicalRoot = true
        }
      }
    }

    if (debug) {
      console.log(
        `[liveDataLoader] 场景构建完成: 创建 ${createdCount}/${config.objects.length} 物体` +
          (skippedCount > 0 ? `，跳过 ${skippedCount} 个（见上方 warn）` : ''),
      )
    }
  }

  return nodeMap
}

// ══════════════════════════════════════════════════════════════
// Object3D 工厂
// ══════════════════════════════════════════════════════════════

export function createLiveObject3D(
  cfg: LiveDataObject,
): THREE.Object3D | null {
  let obj: THREE.Object3D | null = null

  // ── resolver 链（优先级：component.name(3d-components) > component.type(内置builder) > src(model) > geometry(mesh) > group）──
  // ① 3d-components 组件（最高优先级）：component.name 命中 library-bridge
  if (cfg.component?.name && hasComponent(cfg.component.name)) {
    obj = createComponentObject(cfg.component.name, cfg.component.options ?? {})
    if (obj) {
      obj.name = cfg.id
      applyTransform(obj, cfg)
      if (cfg.castShadow) obj.castShadow = true
      if (cfg.receiveShadow) obj.receiveShadow = true
    }
  }

  // ② 内置 builder 组件：component.type 走 ComponentRegistry（保留 rack/desk 等 17 个）
  if (!obj && cfg.component?.type) {
    obj = createLiveComponent(cfg)
  }

  // ③ 外部模型：src 走 ModelLoader（占位 Group，异步填充）
  if (!obj && cfg.src) {
    obj = createModelPlaceholder(cfg)
  }

  // ④ mesh 兜底：原生几何体
  if (!obj && (cfg.geometry || cfg.type === 'mesh')) {
    obj = createLiveMesh(cfg)
  }

  // ⑤ group 兜底
  if (!obj && cfg.type === 'group') {
    obj = new THREE.Group()
    obj.name = cfg.id
    applyTransform(obj, cfg)
  }

  // 统一写入 userData.__id：覆盖所有 resolver 路径（component/builder/model占位/mesh/group）。
  // ScenePicker raycast 命中后沿父子链向上查找 userData.__id 拿到所属 object id（阶段3）。
  // sceneUpdate.upsertObjects 新建对象也走本函数，故增量 patch 新增的物体也带 __id。
  if (obj && cfg.id) {
    obj.userData.__id = cfg.id
  }

  return obj
}

// ── Component 工厂 ──

function createLiveComponent(cfg: LiveDataObject): THREE.Object3D | null {
  const compDef = cfg.component
  if (!compDef) return null

  const compType = compDef.type
  const compParams = (compDef.params ?? {}) as Record<string, number | string>
  const mat = createLiveMaterial(cfg.material)

  const group = ComponentRegistry.createByBuilder(compType, compParams, mat, assetPool)
  if (!group) return null

  // 给子节点设置 userData.id，供 parentId 引用 + raycaster 识别
  const prefix = cfg.id
  for (const child of group.children) {
    child.userData.id = `${prefix}_${child.name}`
  }

  group.name = cfg.id
  applyTransform(group, cfg)
  return group
}

// ── 模型工厂（占位 + 异步填充，复用 ModelLoader）──

/**
 * 为带 src 的对象创建占位 Group。
 * 实际模型由 loadModelObjects() 异步加载后填充到此 Group 中（走 ModelLoader provider 链）。
 */
function createModelPlaceholder(cfg: LiveDataObject): THREE.Group {
  const group = new THREE.Group()
  group.name = cfg.id
  // 标记为模型占位节点，供异步加载识别
  group.userData.__modelSrc = cfg.src ?? ''
  group.userData.__modelId = cfg.id
  applyTransform(group, cfg)
  if (cfg.castShadow) group.castShadow = true
  if (cfg.receiveShadow) group.receiveShadow = true
  return group
}

/**
 * 异步加载场景中所有带 src 的模型（type='glb'/'model'，或 component 未命中回落 src）。
 * 在 applyLiveDataToApp 同步构建场景后调用，将模型填充到占位 Group 中。
 *
 * 走 ModelLoader provider 链（asset/http/hunyuan），内置原型缓存 + clone 复用。
 * hunyuan: 前缀走单次生成缓存（见 hunyuan-provider.ts），失败回落 mesh 兜底 + SCENE_ERROR。
 *
 * @returns 加载完成的模型对象 id → Object3D 映射
 */
export async function loadModelObjects(
  nodeMap: Map<string, THREE.Object3D>,
  objects?: LiveDataObject[],
  onError?: (id: string, message: string) => void,
): Promise<Map<string, THREE.Object3D>> {
  if (!objects) return new Map()

  // 收集所有需要异步加载模型的配置（有 src 且 src 非空）
  const modelDefs = objects.filter((o) => o.src)
  if (modelDefs.length === 0) return new Map()

  const loaded = new Map<string, THREE.Object3D>()

  // 并行加载所有模型
  const tasks = modelDefs.map(async (def) => {
    const src = def.src!
    // 找到占位 Group
    const placeholder = nodeMap.get(def.id)
    if (!placeholder) return

    try {
      const model = await loadModel(src, {
        castShadow: def.castShadow,
        receiveShadow: def.receiveShadow,
      })

      // 将模型内容添加到占位 Group
      placeholder.add(model)
      // 清除占位标记
      delete placeholder.userData.__modelSrc
      delete placeholder.userData.__modelId

      // 注册子节点到 nodeMap（供 parentId 引用）
      model.traverse((child) => {
        if (child !== model && child.name) {
          child.userData.id = `${def.id}_${child.name}`
          nodeMap.set(child.userData.id, child)
        }
      })

      loaded.set(def.id, placeholder)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[liveDataLoader] 模型加载失败: ${src} (${def.id})`, msg)
      // 回落：占位 Group 内放一个 box 兜底，不阻塞其余物体
      const fallbackGeo = new THREE.BoxGeometry(1, 1, 1)
      const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xff4444 })
      const fallback = new THREE.Mesh(fallbackGeo, fallbackMat)
      fallback.name = `${def.id}_fallback`
      placeholder.add(fallback)
      delete placeholder.userData.__modelSrc
      delete placeholder.userData.__modelId
      onError?.(def.id, `模型加载失败 ${src}: ${msg}`)
      loaded.set(def.id, placeholder)
    }
  })

  await Promise.all(tasks)
  return loaded
}

/** @deprecated 用 loadModelObjects 代替。保留旧名兼容外部调用方（如 index.ts 导出）。 */
export async function loadGlbObjects(
  _scene: THREE.Scene,
  nodeMap: Map<string, THREE.Object3D>,
  objects?: LiveDataObject[],
  onError?: (id: string, message: string) => void,
): Promise<Map<string, THREE.Object3D>> {
  return loadModelObjects(nodeMap, objects, onError)
}

// ── Mesh 工厂 ──

function createLiveMesh(cfg: LiveDataObject): THREE.Mesh | null {
  const geoDef = cfg.geometry
  if (!geoDef) return null

  // text 几何特殊处理：ASCII 用 TextGeometry(立体)，非 ASCII（中文等）用 canvas 贴图
  if (geoDef.type === 'text') {
    return createLiveTextMesh(cfg)
  }

  const geo = createLiveGeometry(geoDef)
  if (!geo) return null

  const mat = createLiveMaterial(cfg.material)

  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = cfg.id

  // 位置 / 旋转 / 缩放 / 阴影
  applyTransform(mesh, cfg)

  if (cfg.castShadow) mesh.castShadow = true
  if (cfg.receiveShadow) mesh.receiveShadow = true

  return mesh
}

/**
 * 创建文字 mesh。
 * - ASCII 文字：TextGeometry 立体字（需 ensureFont 已加载字体）
 * - 非 ASCII（中文等）：canvas 绘制文字 → CanvasTexture 贴到 PlaneGeometry
 *   （helvetiker 字体不含中文，故中文一律走贴图）
 */
function createLiveTextMesh(cfg: LiveDataObject): THREE.Mesh | null {
  const tp = (cfg.geometry?.params ?? {}) as Record<string, unknown>
  const text = String(tp.text ?? 'Text')
  const size = Number(tp.size) > 0 ? Number(tp.size) : 1
  const isAscii = /^[\x00-\x7F]*$/.test(text)

  let geo: THREE.BufferGeometry
  let mat: THREE.Material

  if (isAscii && fontCache) {
    geo = new TextGeometry(text, {
      font: fontCache,
      size,
      depth: Number(tp.depth) > 0 ? Number(tp.depth) : 0.2,
      curveSegments: 6,
      bevelEnabled: false,
    })
    mat = createLiveMaterial(cfg.material)
  } else {
    // 中文等：canvas 贴图
    const cv = document.createElement('canvas')
    const ctx = cv.getContext('2d')!
    const fs = 128
    ctx.font = `bold ${fs}px sans-serif`
    const m = ctx.measureText(text)
    cv.width = Math.ceil(m.width) + 32
    cv.height = fs + 32
    // canvas 尺寸变更后需重新设置 font
    ctx.font = `bold ${fs}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cv.width / 2, cv.height / 2)

    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    geo = new THREE.PlaneGeometry(size * (cv.width / cv.height), size)
    const matColor = cfg.material?.color ?? '#ffffff'
    mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      color: new THREE.Color(matColor),
      side: THREE.DoubleSide,
    })
  }

  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = cfg.id
  applyTransform(mesh, cfg)
  if (cfg.castShadow) mesh.castShadow = true
  if (cfg.receiveShadow) mesh.receiveShadow = true
  return mesh
}

// ── 几何体工厂 ──

export function createLiveGeometry(
  geoDef: LiveDataGeometry,
): THREE.BufferGeometry | null {
  const p = (geoDef.params ?? {}) as Record<string, number>

  switch (geoDef.type) {
    case 'box':
      return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1)
    case 'plane':
      return new THREE.PlaneGeometry(p.width ?? 1, p.height ?? 1)
    case 'sphere':
      return new THREE.SphereGeometry(
        p.radius ?? 1,
        p.widthSegments ?? 32,
        p.heightSegments ?? 16,
      )
    case 'cylinder':
      return new THREE.CylinderGeometry(
        p.radiusTop ?? 1,
        p.radiusBottom ?? 1,
        p.height ?? 1,
        p.radialSegments ?? 32,
      )
    case 'cone':
      return new THREE.ConeGeometry(
        p.radius ?? 1,
        p.height ?? 1,
        p.radialSegments ?? 16,
      )
    case 'torus': {
      const inner = p.innerRadius ?? 1
      const outer = p.outerRadius ?? 2
      const radius = (inner + outer) / 2
      const tube = (outer - inner) / 2
      return new THREE.TorusGeometry(
        radius,
        tube,
        p.radialSegments ?? 12,
        p.thetaSegments ?? 64,
        p.arc ?? Math.PI * 2,
      )
    }
    case 'circle':
      return new THREE.CircleGeometry(p.radius ?? 1, p.segments ?? 32)
    case 'ring':
      return new THREE.RingGeometry(
        p.innerRadius ?? 0.5,
        p.outerRadius ?? 1,
        p.thetaSegments ?? 64,
        p.phiSegments ?? 1,
      )
    default:
      console.warn(`[liveDataLoader] 未知几何体类型: ${geoDef.type}`)
      return null
  }
}

// ── 材质工厂（带 AssetPool 缓存） ──

/** 根据材质参数生成缓存 key */
function materialKey(matDef: LiveDataMaterial): string {
  const parts = [matDef.type, matDef.color ?? '#fff', String(matDef.roughness ?? ''), String(matDef.metalness ?? '')]
  if (matDef.transmission !== undefined) parts.push(`tm:${matDef.transmission}`)
  if (matDef.clearcoat !== undefined) parts.push(`cc:${matDef.clearcoat}`)
  if (matDef.ior !== undefined) parts.push(`ior:${matDef.ior}`)
  if (matDef.transparent) parts.push('tr')
  if (matDef.opacity !== undefined) parts.push(`op:${matDef.opacity}`)
  return parts.join('|')
}

export function createLiveMaterial(
  matDef?: LiveDataMaterial,
): THREE.Material {
  if (!matDef) return new THREE.MeshNormalMaterial()

  // 缓存：相同参数共享同一个 Material 实例
  const key = materialKey(matDef)
  return assetPool.getMaterial(key, () => createLiveMaterialInner(matDef))
}

/** 实际创建材质（仅缓存未命中时调用） */
function createLiveMaterialInner(matDef: LiveDataMaterial): THREE.Material {
  const type = matDef.type
  let mat: THREE.Material

  switch (type) {
    case 'standard':
      mat = new THREE.MeshStandardMaterial({
        color: matDef.color ?? '#ffffff',
        roughness: matDef.roughness ?? 0.5,
        metalness: matDef.metalness ?? 0,
      })
      break
    case 'phong':
      mat = new THREE.MeshPhongMaterial({
        color: matDef.color ?? '#ffffff',
      })
      break
    case 'basic':
      mat = new THREE.MeshBasicMaterial({
        color: matDef.color ?? '#ffffff',
      })
      break
    case 'physical': {
      mat = new THREE.MeshPhysicalMaterial({
        color: matDef.color ?? '#ffffff',
        roughness: matDef.roughness ?? 0.5,
        metalness: matDef.metalness ?? 0,
      })
      const pm = mat as THREE.MeshPhysicalMaterial
      if (matDef.transmission !== undefined) pm.transmission = matDef.transmission
      if (matDef.thickness !== undefined) pm.thickness = matDef.thickness
      if (matDef.ior !== undefined) pm.ior = matDef.ior
      if (matDef.clearcoat !== undefined) pm.clearcoat = matDef.clearcoat
      if (matDef.clearcoatRoughness !== undefined) pm.clearcoatRoughness = matDef.clearcoatRoughness
      if (matDef.sheen !== undefined) pm.sheen = matDef.sheen
      if (matDef.sheenColor !== undefined) pm.sheenColor = new THREE.Color(matDef.sheenColor)
      break
    }
    default:
      return new THREE.MeshNormalMaterial()
  }

  if (matDef.transparent) {
    mat.transparent = true
    if (matDef.opacity !== undefined) mat.opacity = matDef.opacity
  }

  return mat
}

// ── 灯光工厂 ──

function createLiveLight(cfg: LiveDataLight): THREE.Light | null {
  const color = cfg.color
  const intensity = cfg.intensity ?? 1
  const pos = parseVec3(cfg.position)

  switch (cfg.type) {
    case 'ambient':
      return new THREE.AmbientLight(color ?? '#ffffff', intensity)

    case 'hemisphere': {
      const sky = cfg.skyColor ?? cfg.color ?? color ?? '#ffffff'
      const ground = cfg.groundColor ?? '#222222'
      const light = new THREE.HemisphereLight(sky, ground, intensity)
      if (pos) light.position.set(...pos)
      return light
    }

    case 'directional': {
      const light = new THREE.DirectionalLight(color ?? '#ffffff', intensity)
      if (pos) light.position.set(...pos)
      const target = parseVec3(cfg.target)
      if (target) light.target.position.set(...target)
      if (cfg.castShadow) {
        light.castShadow = true
        const shadow = cfg.shadow
        if (shadow) {
          if (shadow.mapSize) {
            light.shadow.mapSize.width = shadow.mapSize
            light.shadow.mapSize.height = shadow.mapSize
          }
          const sc = shadow.camera
          if (sc) {
            light.shadow.camera.near = sc.near
            light.shadow.camera.far = sc.far
            light.shadow.camera.left = sc.left
            light.shadow.camera.right = sc.right
            light.shadow.camera.top = sc.top
            light.shadow.camera.bottom = sc.bottom
            ;(light.shadow.camera as THREE.OrthographicCamera).updateProjectionMatrix()
          }
        }
      }
      return light
    }

    default:
      return null
  }
}

// ══════════════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════════════

/** 给 Object3D 应用 position / rotation / scale */
export function applyTransform(
  obj: THREE.Object3D,
  cfg: { position?: number[]; rotation?: number[]; scale?: number[] },
): void {
  const pos = parseVec3(cfg.position)
  if (pos) obj.position.set(...pos)
  const rot = parseVec3(cfg.rotation, true)
  if (rot) obj.rotation.set(...rot)
  const scl = parseVec3(cfg.scale)
  if (scl) obj.scale.set(...scl)
}

/** 解析三元组数组，toRadians 开启时角度→弧度 */
function parseVec3(
  value: unknown,
  toRadians = false,
): [number, number, number] | null {
  let arr: number[] | null = null

  if (Array.isArray(value) && value.length >= 3) {
    arr = value.slice(0, 3).map(Number)
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.length >= 3) {
        arr = parsed.slice(0, 3).map(Number)
      }
    } catch {
      return null
    }
  }

  if (!arr) return null
  return toRadians
    ? [arr[0] * DEG2RAD, arr[1] * DEG2RAD, arr[2] * DEG2RAD]
    : [arr[0], arr[1], arr[2]]
}
