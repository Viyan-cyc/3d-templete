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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { App3D } from '../App3D'
import { ComponentRegistry, AssetPool, registerAllBuilders } from '../components'
import { resolveModelSrc } from '../models'

// 全局组件注册表 + 资源缓存池（组件复用 Geometry/Material，相同参数只创建一次）
// ComponentRegistry 是单例实例（非类），registerAllBuilders() 已向其注册所有 builder
registerAllBuilders()
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
  type: 'group' | 'mesh' | 'component' | 'glb'
  parentId: string | null
  position?: number[]
  rotation?: number[]
  scale?: number[]
  geometry?: LiveDataGeometry
  material?: LiveDataMaterial
  component?: LiveDataComponent
  /** 当 type === 'glb' 时，模型资源引用。
   *  - 'asset:windmill' → 从 src/3d/models/ 注册表查找（Vite import 编译后的 URL）
   *  - '/models/xxx.glb' 或 'https://...' → 原始 URL 路径
   */
  src?: string
  castShadow?: boolean
  receiveShadow?: boolean
}

export interface LiveDataComponent {
  type: string
  params?: Record<string, number | string>
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
  if (config.objects) {
    // 第一遍：创建
    for (const oc of config.objects) {
      const node = createLiveObject3D(oc)
      if (node) {
        nodeMap.set(oc.id, node)
        // 组件节点:把展开的子节点也注册进 nodeMap,供其他物体的 parentId 引用
        if (oc.type === 'component') {
          node.traverse((child) => {
            if (child.userData?.id && child !== node) {
              nodeMap.set(child.userData.id, child)
            }
          })
        }
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

  switch (cfg.type) {
    case 'group':
      obj = new THREE.Group()
      applyTransform(obj, cfg)
      break
    case 'mesh':
      obj = createLiveMesh(cfg)
      break
    case 'component':
      obj = createLiveComponent(cfg)
      break
    case 'glb':
      obj = createLiveGlbPlaceholder(cfg)
      break
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

// ── GLB 模型工厂 ──

/** GLB 模型缓存：src → GLTF，避免重复加载同一模型 */
const glbCache = new Map<string, GLTF>()

/** 共享 GLTFLoader 实例 */
let _gltfLoader: GLTFLoader | null = null
function getGltfLoader(): GLTFLoader {
  if (!_gltfLoader) _gltfLoader = new GLTFLoader()
  return _gltfLoader
}

/**
 * 为 type='glb' 的对象创建占位 Group。
 * 实际模型由 loadGlbObjects() 异步加载后填充到此 Group 中。
 */
function createLiveGlbPlaceholder(cfg: LiveDataObject): THREE.Group {
  const group = new THREE.Group()
  group.name = cfg.id
  // 标记为 GLB 占位节点，供异步加载识别
  group.userData.__glbSrc = cfg.src ?? ''
  group.userData.__glbId = cfg.id
  applyTransform(group, cfg)
  if (cfg.castShadow) group.castShadow = true
  if (cfg.receiveShadow) group.receiveShadow = true
  return group
}

/**
 * 异步加载场景中所有 type='glb' 的模型。
 * 在 applyLiveDataToApp 同步构建场景后调用，将 GLB 模型填充到占位 Group 中。
 *
 * @returns 加载完成的 GLB 对象 id → Object3D 映射
 */
export async function loadGlbObjects(
  _scene: THREE.Scene,
  nodeMap: Map<string, THREE.Object3D>,
  objects?: LiveDataObject[],
): Promise<Map<string, THREE.Object3D>> {
  if (!objects) return nodeMap

  // 收集所有 glb 类型的配置
  const glbDefs = objects.filter((o) => o.type === 'glb')
  if (glbDefs.length === 0) return nodeMap

  const loader = getGltfLoader()
  const loaded = new Map<string, THREE.Object3D>()

  // 并行加载所有 GLB 模型
  const tasks = glbDefs.map(async (def) => {
    const src = def.src
    if (!src) {
      console.warn(`[liveDataLoader] glb 对象 "${def.id}" 缺少 src 字段`)
      return
    }

    const url = resolveModelSrc(src)

    // 缓存：相同 src 只加载一次
    let gltf = glbCache.get(url)
    if (!gltf) {
      try {
        gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject)
        })
        glbCache.set(url, gltf)
      } catch (err) {
        console.error(`[liveDataLoader] GLB 加载失败: ${url}`, err)
        return
      }
    }

    // 找到占位 Group
    const placeholder = nodeMap.get(def.id)
    if (!placeholder) return

    // 克隆场景（同一 GLB 被多个对象引用时各自独立）
    const model = gltf.scene.clone()

    // 应用阴影设置
    if (def.castShadow) {
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) child.castShadow = true
      })
    }
    if (def.receiveShadow) {
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) child.receiveShadow = true
      })
    }

    // 将模型内容添加到占位 Group
    placeholder.add(model)
    // 清除占位标记
    delete placeholder.userData.__glbSrc
    delete placeholder.userData.__glbId

    // 注册子节点到 nodeMap（供 parentId 引用）
    model.traverse((child) => {
      if (child !== model && child.name) {
        child.userData.id = `${def.id}_${child.name}`
        nodeMap.set(child.userData.id, child)
      }
    })

    loaded.set(def.id, placeholder)
  })

  await Promise.all(tasks)
  return loaded
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
