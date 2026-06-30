/**
 * ============================================================
 *  ShelfExample — JSON 驱动货架组件演示
 *
 *  演示 Shelf 通过 ComponentRegistry + createObjectFromDef 创建
 *  （与 MainScene 内部处理 type:'component' 的流程完全一致）
 *
 *  运行方式：在 Scene3D.vue 的 onMounted 里加一行：
 *    import { demoJsonDrivenShelf } from '@/3d/components'
 *    demoJsonDrivenShelf(sceneAPI)
 * ============================================================
 */
import * as THREE from 'three'
import type { SceneAPI } from '../index'
import { Shelf } from './Shelf'
import { ShelfComponent } from './ShelfComponent'
import { ComponentRegistry } from './ComponentRegistry'
import { createObjectFromDef } from '../objects'
import type { ModelDef, SceneData } from '../types'

/**
 * ★ 核心演示：JSON 数据 → createObjectFromDef → Shelf 3D 物体
 *
 * @param sceneAPI  initScene() 的返回值
 */
export function demoJsonDrivenShelf(sceneAPI: SceneAPI): Shelf | null {
  const { app } = sceneAPI

  // ==========================================
  //  Step 1: 注册 Shelf 组件（只需一次）
  // ==========================================
  if (!ComponentRegistry.has('Shelf')) {
    ComponentRegistry.register(new ShelfComponent())
    console.log('[ShelfExample] Shelf 组件已注册')
  }

  // ==========================================
  //  Step 2: 定义 JSON 数据
  //
  //  这就是你后端 API 返回的 SceneData.models[] 中的一条。
  //  与你现有的 cube / sphere / component 写法完全一致。
  // ==========================================
  const shelfModelDef: ModelDef = {
    id: 'warehouse-shelf-A1',
    type: 'component',
    componentName: 'Shelf',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    props: {
      rows: 5,             // 5 行（X 方向）
      cols: 2,             // 2 列（Z 方向，深度）
      layers: 4,           // 4 层（Y 方向）
      cellWidth: 1.0,      // 每个货格宽 1m
      cellHeight: 0.7,     // 每个货格高 0.7m
      cellDepth: 0.9,      // 每个货格深 0.9m
      color: '#D2B48C',    // 木色
      postColor: '#666666',// 深灰立柱
      dividerThickness: 0.02,
    },
  }

  // ==========================================
  //  Step 3: createObjectFromDef 创建
  //  （MainScene 内部就是这样处理每条 ModelDef 的）
  // ==========================================
  const result = createObjectFromDef(shelfModelDef, app)
  if (!result || result.objects.length === 0) {
    console.error('[ShelfExample] 创建 Shelf 失败——组件注册了吗？')
    return null
  }

  // 加入场景
  const shelfObj = result.objects[0] as Shelf
  app.scene.add(shelfObj)

  // ==========================================
  //  Step 4: 使用 Shelf 的 API
  // ==========================================
  console.log('=== Shelf 信息 ===')
  console.log(`  货格总数: ${shelfObj.cellCount}`)
  console.log(`  总宽: ${shelfObj.totalWidth.toFixed(2)}`)
  console.log(`  总高: ${shelfObj.totalHeight.toFixed(2)}`)
  console.log(`  总深: ${shelfObj.totalDepth.toFixed(2)}`)

  // 获取特定货格坐标
  const cell0 = shelfObj.getCellPosition(2, 1, 3) // row=2, col=1, layer=3
  console.log(`  cell(row=2,col=1,layer=3) → [${cell0.x.toFixed(2)}, ${cell0.y.toFixed(2)}, ${cell0.z.toFixed(2)}]`)

  // 遍历所有货格坐标
  console.log('  所有货格坐标:')
  shelfObj.cellPositions.forEach((pos, i) => {
    console.log(`    [${i}] (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`)
  })

  // 在每个货格里放一个标记小球
  addCellMarkers(shelfObj)

  // 在第一个货格里放一个示例箱子
  addDemoBox(shelfObj, 0, 0, 0)

  console.log('[ShelfExample] 完成 ✓')
  return shelfObj
}

/**
 * ★ 完整 SceneData 格式示例
 *
 *  如果你把货架写在 API 返回的 JSON 里 → Scene3D.vue 直接用 initScene(canvas, sceneData)
 * → MainScene 自动调用 createObjectFromDef → Shelf 就出现在场景里了。
 *
 *  下面就是一个完整的后端 JSON（SceneData）示例：
 */
export const SHELF_SCENE_DATA_EXAMPLE: SceneData = {
  config: {
    backgroundColor: '#1a1a2e',
    cameraPosition: [8, 6, 12],
    cameraTarget: [0, 2, 0],
    enableShadows: true,
  },
  lights: [
    { type: 'ambient', color: '#ffffff', intensity: 0.6, position: [0, 0, 0], castShadow: false },
    { type: 'directional', color: '#ffffff', intensity: 0.8, position: [10, 15, 10], castShadow: true },
  ],
  models: [
    // 地面
    { id: 'ground', type: 'plane', color: '#2a2a3e', position: [0, 0, 0] },

    // ★ 货架 —— 跟 cube/sphere 一样的 type:'component' 写法
    {
      id: 'shelf-main',
      type: 'component',
      componentName: 'Shelf',
      position: [0, 0, 0],
      props: {
        rows: 5,
        cols: 2,
        layers: 4,
        cellWidth: 1.0,
        cellHeight: 0.7,
        cellDepth: 0.9,
        color: '#D2B48C',
        postColor: '#666666',
      },
    },

    // 还可以再放一个对比用的 cube
    { id: 'demo-cube', type: 'cube', color: '#ff6b6b', position: [4, 0.5, 0] },
  ],
}

// ============================================================
//  辅助：在每个货格放绿色标记球
// ============================================================
function addCellMarkers(shelf: Shelf): void {
  const dotGeo = new THREE.SphereGeometry(0.04, 8, 8)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 })

  shelf.cellPositions.forEach((pos) => {
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    shelf.add(dot)
  })
}

// ============================================================
//  辅助：在指定货格放一个箱子
// ============================================================
function addDemoBox(shelf: Shelf, row: number, col: number, layer: number): THREE.Mesh {
  const cell = shelf.getCellPosition(row, col, layer)

  const boxGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5)
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.3, metalness: 0.1 })
  const box = new THREE.Mesh(boxGeo, boxMat)
  box.castShadow = true
  box.receiveShadow = true
  box.position.copy(cell)
  box.name = `Box-r${row}c${col}l${layer}`
  shelf.add(box)

  return box
}
