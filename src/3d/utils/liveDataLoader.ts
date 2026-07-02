/**
 * Live Data 场景加载器
 *
 * 解析 live-data.json 格式的场景配置，并应用到 App3D 实例。
 * 基于 octoAgents/src/utils/sceneLoader.ts，适配到 3d-templete 架构。
 *
 * 支持：
 *  - 摄像机：perspective / orthographic
 *  - 几何体：box / plane / sphere / cylinder / cone / torus / circle / ring
 *  - 材质：standard / phong / basic / physical（含 transmission / ior）
 *  - 灯光：ambient / hemisphere / directional（含阴影）
 *  - 对象层级树：group / mesh / light，通过 parentId 建立父子关系
 */

import * as THREE from 'three'
import type { App3D } from '../App3D'

const DEG2RAD = Math.PI / 180

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
  type: 'group' | 'mesh'
  parentId: string | null
  position?: number[]
  rotation?: number[]
  scale?: number[]
  geometry?: LiveDataGeometry
  material?: LiveDataMaterial
  castShadow?: boolean
  receiveShadow?: boolean
}

export interface LiveDataGeometry {
  type: string
  params?: Record<string, number>
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
  return res.json()
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
      if (node) nodeMap.set(oc.id, node)
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
  }

  return obj
}

// ── Mesh 工厂 ──

function createLiveMesh(cfg: LiveDataObject): THREE.Mesh | null {
  const geoDef = cfg.geometry
  if (!geoDef) return null

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

// ── 几何体工厂 ──

export function createLiveGeometry(
  geoDef: LiveDataGeometry,
): THREE.BufferGeometry | null {
  const p = geoDef.params ?? {}

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

// ── 材质工厂 ──

export function createLiveMaterial(
  matDef?: LiveDataMaterial,
): THREE.Material {
  if (!matDef) return new THREE.MeshNormalMaterial()

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
