import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { CardDef, CardState } from './types'

interface CardEntry {
  id: string
  type: string
  object3D: THREE.Object3D
  def: CardDef
  css2d: CSS2DObject
  domEl: HTMLElement
  visible: boolean
}

export type CardStateCallback = (cards: CardState[]) => void

/**
 * ============================================================
 *  CardManager — CSS2D 卡片管理器
 *
 *  职责：
 *  - 为绑定了 CardDef 的 3D 物体创建 CSS2DObject（DOM 定位层）
 *  - 管理卡片的显示/隐藏（单个、按类型、全部）
 *  - 处理 click 交互模式（同组互斥显示）
 *  - 暴露 CardState[] 供 Vue 通过 Teleport 渲染卡片内容
 *  - 场景切换时整体隐藏/恢复
 *  - 销毁时清理 DOM
 * ============================================================
 */
export class CardManager {
  readonly css2DRenderer: CSS2DRenderer
  private _cards: Map<string, CardEntry> = new Map()
  private _stateListeners: Array<CardStateCallback> = []
  private _raycaster: THREE.Raycaster = new THREE.Raycaster()
  private _mouse: THREE.Vector2 = new THREE.Vector2()
  private _camera: THREE.Camera | null = null
  private _domElement: HTMLElement | null = null
  private _clickHandler: ((e: MouseEvent) => void) | null = null
  private _frozen: boolean = false

  constructor() {
    this.css2DRenderer = new CSS2DRenderer()
    this.css2DRenderer.domElement.style.position = 'absolute'
    this.css2DRenderer.domElement.style.top = '0'
    this.css2DRenderer.domElement.style.left = '0'
    this.css2DRenderer.domElement.style.pointerEvents = 'none' // 让点击穿透到 canvas
  }

  /** 挂载到 canvas 的父容器（与 WebGL canvas 同级） */
  attach(container: HTMLElement, camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    this._camera = camera
    this._domElement = canvas

    // CSS2D 层覆盖在 canvas 上方
    this.css2DRenderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(this.css2DRenderer.domElement)

    // 点击交互监听
    this._clickHandler = (e: MouseEvent) => {
      if (this._frozen) return
      const rect = canvas.getBoundingClientRect()
      this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      this._handleClick()
    }
    canvas.addEventListener('click', this._clickHandler)
  }

  /**
   * 注册一个卡片
   * @param id        卡片唯一ID（与关联物体对应）
   * @param type      卡片类型（如 'agv', 'container'）
   * @param object3D  关联的 3D 物体
   * @param def       卡片配置（来自 JSON）
   */
  addCard(
    id: string,
    type: string,
    object3D: THREE.Object3D,
    def: CardDef = {},
  ): void {
    if (this._cards.has(id)) {
      console.warn(`[CardManager] 卡片 "${id}" 已存在`)
      return
    }

    const domEl = document.createElement('div')
    domEl.className = `card-3d card-type-${type}`
    domEl.setAttribute('data-card-id', id)
    domEl.setAttribute('data-card-type', type)
    domEl.style.position = 'absolute'
    domEl.style.pointerEvents = 'auto' // 卡片内部需要响应点击
    domEl.style.transition = 'opacity 0.3s ease'

    const css2d = new CSS2DObject(domEl)
    css2d.name = `card-${id}`
    css2d.position.copy(object3D.position)
    if (def.offset) {
      css2d.position.x += def.offset[0] ?? 0
      css2d.position.y += def.offset[1] ?? 1.5
      css2d.position.z += def.offset[2] ?? 0
    } else {
      css2d.position.y += 1.5 // 默认在物体上方
    }

    // 挂到物体上，跟随物体移动
    object3D.add(css2d)

    const alwaysVisible = def.mode === 'always' || def.alwaysVisible === true
    domEl.style.opacity = alwaysVisible ? '1' : '0'
    domEl.style.visibility = alwaysVisible ? 'visible' : 'hidden'

    const entry: CardEntry = {
      id,
      type,
      object3D,
      def,
      css2d,
      domEl,
      visible: alwaysVisible,
    }

    this._cards.set(id, entry)
    this._notify()
  }

  /** 移除卡片 */
  removeCard(id: string): void {
    const entry = this._cards.get(id)
    if (!entry) return
    entry.css2d.removeFromParent()
    entry.domEl.remove()
    this._cards.delete(id)
    this._notify()
  }

  /** 显示卡片（带动画） */
  showCard(id: string): void {
    const entry = this._cards.get(id)
    if (!entry) return
    entry.visible = true
    entry.domEl.style.visibility = 'visible'
    entry.domEl.style.opacity = '1'
    this._notify()
    entry.def.props?.onShow
  }

  /** 隐藏卡片（带动画） */
  hideCard(id: string): void {
    const entry = this._cards.get(id)
    if (!entry) return
    entry.visible = false
    entry.domEl.style.opacity = '0'
    // 动画结束后隐藏
    const onDone = () => {
      entry.domEl.style.visibility = 'hidden'
      entry.domEl.removeEventListener('transitionend', onDone)
    }
    entry.domEl.addEventListener('transitionend', onDone, { once: true })
    this._notify()
  }

  /** 切换卡片显隐 */
  toggleCard(id: string): void {
    const entry = this._cards.get(id)
    if (!entry) return
    if (entry.visible) {
      this.hideCard(id)
    } else {
      this.showCard(id)
    }
  }

  /** 按类型显示全部 */
  showByType(type: string): void {
    this._cards.forEach((entry) => {
      if (entry.type === type) this.showCard(entry.id)
    })
  }

  /** 按类型隐藏全部 */
  hideByType(type: string): void {
    this._cards.forEach((entry) => {
      if (entry.type === type) this.hideCard(entry.id)
    })
  }

  /** 按类型切换 */
  toggleByType(type: string): void {
    const hasVisible = Array.from(this._cards.values())
      .some((e) => e.type === type && e.visible)
    if (hasVisible) {
      this.hideByType(type)
    } else {
      this.showByType(type)
    }
  }

  /** 冻结/解冻所有卡片交互（场景切换时使用） */
  freeze(): void {
    this._frozen = true
    this._cards.forEach((entry) => {
      entry.domEl.style.display = 'none'
    })
  }

  unfreeze(): void {
    this._frozen = false
    this._cards.forEach((entry) => {
      entry.domEl.style.display = ''
    })
  }

  /** 获取当前可见卡片状态（Vue 用） */
  getCardStates(): CardState[] {
    const states: CardState[] = []
    this._cards.forEach((entry) => {
      states.push({
        id: entry.id,
        type: entry.type,
        visible: entry.visible,
        domElement: entry.domEl,
        objectId: entry.object3D.name || entry.id,
        props: entry.def.props ?? {},
      })
    })
    return states
  }

  /** 订阅卡片状态变化 */
  onStateChange(cb: CardStateCallback): () => void {
    this._stateListeners.push(cb)
    return () => {
      const idx = this._stateListeners.indexOf(cb)
      if (idx !== -1) this._stateListeners.splice(idx, 1)
    }
  }

  /** 每帧渲染（由 App3D 的 post-render 回调调用） */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.css2DRenderer.render(scene, camera)
  }

  /** resize */
  resize(width: number, height: number): void {
    this.css2DRenderer.setSize(width, height)
  }

  /** 销毁所有卡片 */
  dispose(): void {
    if (this._clickHandler && this._domElement) {
      this._domElement.removeEventListener('click', this._clickHandler)
    }
    this._cards.forEach((entry) => {
      entry.css2d.removeFromParent()
      entry.domEl.remove()
    })
    this._cards.clear()
    this.css2DRenderer.domElement.remove()
    this._stateListeners = []
  }

  // ---- 内部 ----

  private _handleClick(): void {
    if (!this._camera) return

    // 收集所有有卡片的物体
    const targets: THREE.Object3D[] = []
    this._cards.forEach((entry) => {
      targets.push(entry.object3D)
    })

    this._raycaster.setFromCamera(this._mouse, this._camera)
    const intersects = this._raycaster.intersectObjects(targets, true)

    if (intersects.length > 0) {
      // 找到被点击物体关联的卡片
      let hit = intersects[0].object
      while (hit) {
        const entry = Array.from(this._cards.values()).find((e) => e.object3D === hit)
        if (entry) {
          this._onCardClicked(entry)
          return
        }
        hit = hit.parent as THREE.Object3D
      }
    }
  }

  private _onCardClicked(entry: CardEntry): void {
    if (entry.def.mode === 'click') {
      const group = entry.def.interactiveGroup || entry.type

      // 同组互斥：隐藏组内其他卡片
      let hasVisibleSibling = false
      this._cards.forEach((other) => {
        if (other.id === entry.id) return
        const otherGroup = other.def.interactiveGroup || other.type
        if (otherGroup === group && other.visible) {
          hasVisibleSibling = true
          this.hideCard(other.id)
        }
      })

      // 如果当前卡片已可见且没有其他同组卡片可见 → 隐藏
      // 否则 → 显示
      if (entry.visible && !hasVisibleSibling) {
        this.hideCard(entry.id)
      } else {
        this.showCard(entry.id)
      }
    } else if ((entry.def.mode as string) === 'hover') {
      // hover 模式由外部 CSS :hover 处理
    }
  }

  private _notify(): void {
    const states = this.getCardStates()
    this._stateListeners.forEach((cb) => cb(states))
  }
}
