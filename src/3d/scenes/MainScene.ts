import * as THREE from 'three'
import type { App3D } from '../App3D'
import type { SceneData } from '../types'
import type { I3DComponent } from '../components/I3DComponent'
import type { CardManager } from '../cards/CardManager'
import { createGridHelper, createPlane, createAxesHelper, createObjectFromDef } from '../objects'
import { createDefaultLights, createLight } from '../lights'
import { createOrbitControls } from '../controls/OrbitControls'

export interface MainSceneOptions {
  app: App3D
  data?: SceneData
  /** CardManager 实例（由 initScene 传入） */
  cardManager?: CardManager
  debug?: boolean
}

/**
 * 主场景 —— 数据驱动场景搭建 + 卡片注册
 */
export class MainScene {
  readonly app: App3D

  private _controls: ReturnType<typeof createOrbitControls> | null = null
  private _objects: THREE.Object3D[] = []
  private _components: I3DComponent[] = []
  private _cardManager: CardManager | null = null

  constructor(options: MainSceneOptions) {
    const { app, data, cardManager, debug = true } = options
    this.app = app
    this._cardManager = cardManager ?? null

    // ---- 1. 灯光 ----
    if (data?.lights && data.lights.length > 0) {
      data.lights.forEach((def) => app.scene.add(createLight(def)))
    } else {
      createDefaultLights().forEach((l) => app.scene.add(l))
    }

    // ---- 2. 地面 ----
    const hasGround = data?.models?.some((m) => m.type === 'plane')
    if (!hasGround) {
      app.scene.add(createPlane())
    }

    // ---- 3. 模型 / 物体 + 卡片 ----
    if (data?.models) {
      data.models.forEach((def) => {
        const result = createObjectFromDef(def, app)
        if (result) {
          result.objects.forEach((obj) => {
            app.scene.add(obj)
            this._objects.push(obj)
          })
          if (result.component) {
            this._components.push(result.component)
          }

          // 如果该物体声明了卡片，注册到 CardManager
          if (def.card && this._cardManager) {
            const cardType = def.card.cardType || def.componentName || def.type || 'default'
            this._cardManager.addCard(
              `${def.id}-card`,       // cardId
              cardType,                // type（Vue 卡片组件按此类型匹配）
              result.objects[0],       // 关联的 3D 物体
              def.card,                // 卡片配置
            )
          }
        }
      })
    } else {
      this._buildDefaultDemo()
    }

    // ---- 4. 调试 ----
    if (debug) {
      app.scene.add(createGridHelper())
      app.scene.add(createAxesHelper(5))
    }

    // ---- 5. 控制器 ----
    this._controls = createOrbitControls(app.camera, app.canvas)
  }

  update(): void {
    this._controls?.update()
    this._components.forEach((c) => c.update?.(this.app.delta, this.app.elapsed))
  }

  dispose(): void {
    this._controls?.dispose()
    this._components.forEach((c) => c.dispose?.())
    this._objects = []
    this._components = []
  }

  get controls() { return this._controls }
  get objects(): readonly THREE.Object3D[] { return this._objects }

  private _buildDefaultDemo(): void {
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1)
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.3, metalness: 0.1 })
    const cube = new THREE.Mesh(cubeGeo, cubeMat)
    cube.position.set(-1.5, 0.5, 0)
    cube.castShadow = true; cube.receiveShadow = true; cube.name = 'DemoCube'
    this.app.scene.add(cube); this._objects.push(cube)

    const sphereGeo = new THREE.SphereGeometry(0.8, 64, 64)
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0x4ecdc4, roughness: 0.2, metalness: 0.3 })
    const sphere = new THREE.Mesh(sphereGeo, sphereMat)
    sphere.position.set(1.5, 0.8, 0)
    sphere.castShadow = true; sphere.receiveShadow = true; sphere.name = 'DemoSphere'
    this.app.scene.add(sphere); this._objects.push(sphere)

    this._components.push({
      name: 'DemoAnimator', setup: () => {},
      update: (_d, elapsed) => {
        cube.rotation.x = Math.sin(elapsed * 0.7) * 0.3; cube.rotation.y += 0.01
        sphere.position.y = 0.8 + Math.sin(elapsed * 1.5) * 0.3
      },
      dispose: () => {},
    })
  }
}
