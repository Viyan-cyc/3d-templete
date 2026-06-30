import * as THREE from 'three'
import type { App3D } from '../App3D'
import type { SceneData } from '../types'
import type { CardManager } from '../cards/CardManager'
import { createGridHelper, createPlane, createAxesHelper, createObjectFromDef } from '../objects'
import { createDefaultLights, createLight } from '../lights'
import { createOrbitControls } from '../controls/OrbitControls'

export interface MainSceneOptions {
  app: App3D
  data?: SceneData
  cardManager?: CardManager
  debug?: boolean
}

/**
 * 主场景 — 数据驱动场景搭建 + 卡片注册
 *
 * update / dispose 采用鸭子类型：
 * 对象只需有 update(delta, elapsed) 或 dispose() 方法即可自动调用。
 */
export class MainScene {
  readonly app: App3D

  private _controls: ReturnType<typeof createOrbitControls> | null = null
  private _objects: THREE.Object3D[] = []
  private _updatables: Array<{
    update?(delta: number, elapsed: number): void
    dispose?(): void
  }> = []
  private _cardManager: CardManager | null = null

  constructor(options: MainSceneOptions) {
    const { app, data, cardManager, debug = true } = options
    this.app = app
    this._cardManager = cardManager ?? null

    // 1. 灯光
    if (data?.lights && data.lights.length > 0) {
      data.lights.forEach((def) => app.scene.add(createLight(def)))
    } else {
      createDefaultLights().forEach((l) => app.scene.add(l))
    }

    // 2. 地面
    if (!data?.models?.some((m) => m.type === 'plane')) {
      app.scene.add(createPlane())
    }

    // 3. 模型 + 卡片
    if (data?.models) {
      data.models.forEach((def) => {
        const result = createObjectFromDef(def)
        if (result) {
          result.objects.forEach((obj) => {
            app.scene.add(obj)
            this._trackObject(obj)
          })

          if (def.card && this._cardManager) {
            const cardType = def.card.cardType || def.componentName || def.type || 'default'
            this._cardManager.addCard(
              `${def.id}-card`,
              cardType,
              result.objects[0],
              def.card,
            )
          }
        }
      })
    } else {
      this._buildDefaultDemo()
    }

    // 4. 调试
    if (debug) {
      app.scene.add(createGridHelper())
      app.scene.add(createAxesHelper(5))
    }

    // 5. 控制器
    this._controls = createOrbitControls(app.camera, app.canvas)
  }

  update(): void {
    this._controls?.update()
    const delta = this.app.delta
    const elapsed = this.app.elapsed
    this._updatables.forEach((u) => u.update?.(delta, elapsed))
  }

  dispose(): void {
    this._controls?.dispose()
    this._updatables.forEach((u) => u.dispose?.())
    this._objects = []
    this._updatables = []
  }

  get controls() { return this._controls }
  get objects(): readonly THREE.Object3D[] { return this._objects }

  /** 手动追踪一个对象，纳入 update/dispose 生命周期 */
  trackObject(obj: THREE.Object3D): void {
    this._trackObject(obj)
  }

  private _trackObject(obj: THREE.Object3D): void {
    this._objects.push(obj)
    const u = obj as unknown as { update?(...a: unknown[]): void; dispose?(): void }
    if (u.update || u.dispose) {
      this._updatables.push(u)
    }
  }

  private _buildDefaultDemo(): void {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.3, metalness: 0.1 }),
    )
    cube.position.set(-1.5, 0.5, 0)
    cube.castShadow = true; cube.receiveShadow = true; cube.name = 'DemoCube'
    this.app.scene.add(cube); this._objects.push(cube)

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 64, 64),
      new THREE.MeshStandardMaterial({ color: 0x4ecdc4, roughness: 0.2, metalness: 0.3 }),
    )
    sphere.position.set(1.5, 0.8, 0)
    sphere.castShadow = true; sphere.receiveShadow = true; sphere.name = 'DemoSphere'
    this.app.scene.add(sphere); this._objects.push(sphere)

    this._updatables.push({
      update: (_delta: number, elapsed: number) => {
        cube.rotation.x = Math.sin(elapsed * 0.7) * 0.3
        cube.rotation.y += 0.01
        sphere.position.y = 0.8 + Math.sin(elapsed * 1.5) * 0.3
      },
    })
  }
}
