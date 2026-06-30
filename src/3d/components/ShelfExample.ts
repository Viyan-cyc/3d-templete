import * as THREE from 'three'
import { Shelf } from './Shelf'
import { ComponentRegistry } from './ComponentRegistry'
import { createObjectFromDef } from '../objects'
import type { ModelDef, SceneData } from '../types'
import type { App3D } from '../App3D'

export function demoJsonDrivenShelf(app: App3D): Shelf | null {
  if (!ComponentRegistry.has('Shelf')) {
    ComponentRegistry.register('Shelf', Shelf)
  }

  const shelfModelDef: ModelDef = {
    id: 'warehouse-shelf-A1',
    type: 'component',
    componentName: 'Shelf',
    position: [0, 0, 0],
    props: {
      rows: 5, cols: 2, layers: 4,
      cellWidth: 1.0, cellHeight: 0.7, cellDepth: 0.9,
      color: '#D2B48C', postColor: '#666666',
    },
  }

  const result = createObjectFromDef(shelfModelDef)
  if (!result || result.objects.length === 0) return null

  const shelfObj = result.objects[0] as Shelf
  app.scene.add(shelfObj)

  console.log(`[Shelf] cells:${shelfObj.cellCount} size:${shelfObj.totalWidth.toFixed(2)}x${shelfObj.totalHeight.toFixed(2)}x${shelfObj.totalDepth.toFixed(2)}`)

  addCellMarkers(shelfObj)
  addDemoBox(shelfObj, 0, 0, 0)
  return shelfObj
}

export const SHELF_SCENE_DATA_EXAMPLE: SceneData = {
  config: {
    backgroundColor: '#1a1a2e',
    cameraPosition: [8, 6, 12],
    cameraTarget: [0, 2, 0],
    enableShadows: true,
  },
  lights: [
    { type: 'ambient', color: '#ffffff', intensity: 0.6 },
    { type: 'directional', color: '#ffffff', intensity: 0.8, position: [10, 15, 10], castShadow: true },
  ],
  models: [
    { id: 'ground', type: 'plane', color: '#2a2a3e' },
    {
      id: 'shelf-main', type: 'component', componentName: 'Shelf',
      position: [0, 0, 0],
      props: { rows: 5, cols: 2, layers: 4, cellWidth: 1.0, cellHeight: 0.7, cellDepth: 0.9, color: '#D2B48C', postColor: '#666666' },
    },
    { id: 'demo-cube', type: 'cube', color: '#ff6b6b', position: [4, 0.5, 0] },
  ],
}

function addCellMarkers(shelf: Shelf): void {
  const dotGeo = new THREE.SphereGeometry(0.04, 8, 8)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  shelf.cellPositions.forEach((pos) => {
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    shelf.add(dot)
  })
}

function addDemoBox(shelf: Shelf, row: number, col: number, layer: number): THREE.Mesh {
  const cell = shelf.getCellPosition(row, col, layer)
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.3, metalness: 0.1 }),
  )
  box.castShadow = true; box.receiveShadow = true
  box.position.copy(cell)
  box.name = `Box-r${row}c${col}l${layer}`
  shelf.add(box)
  return box
}
