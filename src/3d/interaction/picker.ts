/**
 * ============================================================
 *  picker.ts — 编辑态场景拾取器（ScenePicker）
 *
 *  纯 Three.js，不感知 postMessage。由 createScene3D 在 interactive:true
 *  时构造，embed.vue 设 onPick 回调把命中信息 postMessage 给宿主。
 *
 *  职责：
 *  - enable/disable：仅在编辑态挂 pointerdown/pointerup 监听（与 OrbitControls 共存）。
 *  - 点击（pointerdown→pointerup 拖动 <5px 视为点击）→ raycast 命中场景物体。
 *  - 命中后沿父子链向上查 userData.__id（liveDataLoader 写入）拿到所属 object id。
 *  - 高亮选中物（THREE.BoxHelper 包围盒，每帧 update 跟随移动）。
 *
 *  与运行态（CSS2D 卡片点击）的区分：本模块只在编辑态（interactive + SCENE_PICK_MODE
 *  enabled）启用；生产交付入口 interactive:false 不 import 本模块。
 * ============================================================
 */

import * as THREE from 'three'

/** 拾取结果。id 为空串表示点击空白处（取消选中）。 */
export interface PickInfo {
  /** 命中物体所属的 SceneConfig object id（沿父子链 userData.__id 解析） */
  id: string
  /** three Object3D.name（通常等于 id） */
  name?: string
  /** 若命中 3d-components 组件，记录其 name（可选） */
  component?: string
  /** 备用透传字段（当前未填） */
  props?: Record<string, unknown>
}

/** 拖动阈值（px）：pointerdown→pointerup 位移小于此值视为点击，否则视为轨道拖拽 */
const CLICK_THRESHOLD = 5

export class ScenePicker {
  private ray = new THREE.Raycaster()
  private enabled = false
  /** pointerdown 起始坐标，用于区分点击/拖拽 */
  private downPos: { x: number; y: number } | null = null
  /** 当前高亮物体 */
  private highlighted: THREE.Object3D | null = null
  /** 高亮包围盒 helper（加到 scene，每帧 update 跟随） */
  private boxHelper: THREE.BoxHelper | null = null
  /** 复用 Vector2 / ndc，避免每次 pick 分配 */
  private ndc = new THREE.Vector2()

  /**
   * 选中粒度：
   * - 'part'（默认）：取命中点沿父子链的第一个 __id（叶子部件，如树干/树冠）。
   * - 'whole'：取最近的 __logicalRoot 祖先（用户视角的"一个整体"，如整棵树），
   *   链上无 __logicalRoot 时回落到叶子。由宿主通过 SCENE_PICK_GRANULARITY 切换。
   */
  private granularity: 'part' | 'whole' = 'part'

  /** 拾取回调（embed.vue 设：把 PickInfo postMessage 给宿主） */
  onPick: ((info: PickInfo) => void) | null = null

  private scene: THREE.Scene
  private camera: THREE.Camera
  private canvas: HTMLCanvasElement

  constructor(scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.scene = scene
    this.camera = camera
    this.canvas = canvas
  }

  /** 开启拾取：挂监听 */
  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.canvas.addEventListener('pointerdown', this.handleDown)
    this.canvas.addEventListener('pointerup', this.handleUp)
    this.canvas.style.cursor = 'crosshair'
  }

  /** 关闭拾取：摘监听 + 清高亮 */
  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.canvas.removeEventListener('pointerdown', this.handleDown)
    this.canvas.removeEventListener('pointerup', this.handleUp)
    this.canvas.style.cursor = ''
    this.downPos = null
    this.clearHighlight()
  }

  /** 每帧调用（由 createScene3D 渲染循环触发）：让包围盒跟随选中物移动 */
  update(): void {
    if (this.boxHelper && this.highlighted) {
      this.boxHelper.update()
    }
  }

  /** 设置选中粒度（'part' | 'whole'），由 postMessage 桥 SCENE_PICK_GRANULARITY 调用 */
  setGranularity(mode: 'part' | 'whole'): void {
    this.granularity = mode
  }

  /**
   * 在指定 NDC 坐标拾取。公开方法，也可供编程式调用（如 SCENE_FLY_TO 后高亮）。
   *
   * 粒度（this.granularity）：
   * - 'part'：取命中点沿父子链的第一个 __id（叶子部件）。
   * - 'whole'：取最近的 __logicalRoot 祖先（整体）；链上无 __logicalRoot 时回落到首个 __id。
   */
  pickAt(ndc: THREE.Vector2): void {
    this.ray.setFromCamera(ndc, this.camera)
    const hits = this.ray.intersectObjects(this.scene.children, true)

    for (const hit of hits) {
      // 沿父子链向上找 userData.__id（liveDataLoader 写入于每个 object 根节点）
      let firstIdObj: THREE.Object3D | null = null
      let firstId = ''
      let cur: THREE.Object3D | null = hit.object
      while (cur) {
        const id = cur.userData?.__id
        if (typeof id === 'string' && id !== '') {
          if (!firstIdObj) {
            firstIdObj = cur
            firstId = id
          }
          // part 模式：首个 __id 即命中（叶子部件）
          if (this.granularity === 'part') {
            this.emitPick(cur, id)
            return
          }
          // whole 模式：继续向上找 __logicalRoot（整体），命中则选中整体
          if (this.granularity === 'whole' && cur.userData?.__logicalRoot === true) {
            this.emitPick(cur, id)
            return
          }
        }
        cur = cur.parent
      }
      // whole 模式但链上无 __logicalRoot（如点中分区/结构 group 本身）→ 回落叶子
      if (firstIdObj) {
        this.emitPick(firstIdObj, firstId)
        return
      }
    }

    // 未命中任何带 __id 的物体 → 取消选中
    this.clearHighlight()
    this.onPick?.({ id: '' })
  }

  /** 高亮 + 回调的统一出口（part/whole 两模式共用） */
  private emitPick(obj: THREE.Object3D, id: string): void {
    this.highlightObject(obj)
    const info: PickInfo = {
      id,
      name: obj.name || id,
      component:
        typeof obj.userData?.__componentName === 'string' ? obj.userData.__componentName : undefined,
    }
    this.onPick?.(info)
  }

  /** 销毁：摘监听 + 清高亮 */
  dispose(): void {
    this.disable()
  }

  // ---- 内部 ----

  private handleDown = (e: PointerEvent): void => {
    this.downPos = { x: e.clientX, y: e.clientY }
  }

  private handleUp = (e: PointerEvent): void => {
    const down = this.downPos
    this.downPos = null
    if (!down) return
    // 拖动超过阈值 → 视为轨道操作，忽略拾取（与 OrbitControls 共存）
    const dx = e.clientX - down.x
    const dy = e.clientY - down.y
    if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) return

    const rect = this.canvas.getBoundingClientRect()
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.pickAt(this.ndc)
  }

  /** 高亮指定物体（BoxHelper 包围盒，跟随移动） */
  private highlightObject(obj: THREE.Object3D): void {
    if (this.highlighted === obj && this.boxHelper) return
    this.clearHighlight()
    this.highlighted = obj
    const helper = new THREE.BoxHelper(obj, 0x3d99ff)
    // BoxHelper 自身不应被 raycast 命中（否则点选中物的边框会命中 helper）
    helper.raycast = () => {}
    // LineSegments 默认 raycast 需要 threshold，这里直接禁用更稳妥
    this.boxHelper = helper
    this.scene.add(helper)
    helper.update()
  }

  /** 清除高亮 */
  private clearHighlight(): void {
    if (this.boxHelper) {
      this.scene.remove(this.boxHelper)
      this.boxHelper.geometry.dispose()
      const mat = this.boxHelper.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
      this.boxHelper = null
    }
    this.highlighted = null
  }
}
