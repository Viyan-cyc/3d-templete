import * as THREE from 'three'
import type { ModelDef } from '../types'
import { ComponentRegistry } from '../components/ComponentRegistry'
import type { App3D } from '../App3D'

// ---- 基础几何体 ----

export function createGridHelper(
  size: number = 20,
  divisions: number = 20,
  colorCenterLine: number = 0x444444,
  colorGrid: number = 0x333333,
): THREE.GridHelper {
  const grid = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid)
  grid.name = 'GridHelper'
  return grid
}

export function createCube(
  size: number = 1,
  color: number | string = 0xff6b6b,
  position: THREE.Vector3Like = { x: 0, y: 0.5, z: 0 },
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size, size, size)
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.3,
    metalness: 0.1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position as THREE.Vector3)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'Cube'
  return mesh
}

export function createSphere(
  radius: number = 0.8,
  color: number | string = 0x4ecdc4,
  position: THREE.Vector3Like = { x: 2, y: 1, z: 0 },
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 64, 64)
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.2,
    metalness: 0.3,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position as THREE.Vector3)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'Sphere'
  return mesh
}

export function createPlane(
  size: number = 20,
  color: number | string = 0x2a2a3e,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(size, size)
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.8,
    metalness: 0.1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -0.01
  mesh.receiveShadow = true
  mesh.name = 'Ground'
  return mesh
}

export function createAxesHelper(size: number = 5): THREE.AxesHelper {
  return new THREE.AxesHelper(size)
}

// ---- 从 ModelDef 创建物体 ----

export interface CreateObjectResult {
  /** 创建的物体 */
  objects: THREE.Object3D[]
  /** 若为 component 类型，返回组件引用（用于 update/dispose 钩子） */
  component?: import('../components/I3DComponent').I3DComponent
}

/**
 * 根据 ModelDef 创建 3D 物体。
 * 支持内置类型 (cube/sphere/plane/gltf) 和注册组件 (type: 'component')。
 */
export function createObjectFromDef(
  def: ModelDef,
  app: App3D,
): CreateObjectResult | null {
  const pos = def.position ?? [0, 0, 0]
  const rot = def.rotation ?? [0, 0, 0]
  const scl = def.scale ?? [1, 1, 1]

  switch (def.type) {
    case 'cube': {
      const mesh = createCube(1, def.color ?? 0xff6b6b)
      mesh.name = def.id
      mesh.position.set(...pos)
      mesh.rotation.set(...rot)
      mesh.scale.set(...scl)
      return { objects: [mesh] }
    }

    case 'sphere': {
      const mesh = createSphere(0.8, def.color ?? 0x4ecdc4)
      mesh.name = def.id
      mesh.position.set(...pos)
      mesh.rotation.set(...rot)
      mesh.scale.set(...scl)
      return { objects: [mesh] }
    }

    case 'plane': {
      const mesh = createPlane(20, def.color ?? 0x2a2a3e)
      mesh.name = def.id
      mesh.position.set(...pos)
      mesh.rotation.set(...rot)
      mesh.scale.set(...scl)
      return { objects: [mesh] }
    }

    case 'gltf': {
      if (!def.filePath) {
        console.warn(`[objects] gltf "${def.id}" 缺少 filePath`)
        return null
      }
      const group = new THREE.Group()
      group.name = def.id
      group.position.set(...pos)
      group.rotation.set(...rot)
      group.scale.set(...scl)

      import('../loaders/AssetLoader')
        .then(({ getAssetLoader }) => {
          getAssetLoader().loadModel(def.filePath!).then((gltf) => {
            group.add(gltf.scene)
          })
        })
        .catch((err) => console.error(`[objects] 加载模型失败: ${def.filePath}`, err))

      return { objects: [group] }
    }

    case 'component': {
      const componentName = def.componentName
      if (!componentName) {
        console.warn(`[objects] "component" 类型缺少 componentName`)
        return null
      }
      const component = ComponentRegistry.get(componentName)
      if (!component) {
        console.warn(`[objects] 组件 "${componentName}" 未注册，可用组件: ${ComponentRegistry.list().join(', ')}`)
        return null
      }
      const result = component.setup(app, def.props ?? {})
      if (!result) return { objects: [], component }

      const arr = Array.isArray(result) ? result : [result]
      arr.forEach((obj) => {
        obj.name = def.id
        obj.position.set(...pos)
        obj.rotation.set(...rot)
        obj.scale.set(...scl)
      })
      return { objects: arr, component }
    }

    default:
      console.warn(`[objects] 未知类型: ${(def as ModelDef).type}`)
      return null
  }
}
