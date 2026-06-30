import type * as THREE from 'three'
import type { App3D } from '../App3D'
import type { I3DComponent } from './I3DComponent'
import { Shelf } from './Shelf'
import type { ShelfOptions } from './Shelf'

/**
 * ============================================================
 *  ShelfComponent — 将 Shelf 包装为 I3DComponent
 *
 *  注册后可在 JSON 中通过 type: 'component' + componentName: 'Shelf' 驱动：
 *
 *  {
 *    "id": "my-shelf",
 *    "type": "component",
 *    "componentName": "Shelf",
 *    "position": [0, 0, 0],
 *    "props": {
 *      "rows": 5,
 *      "cols": 2,
 *      "layers": 4,
 *      "cellWidth": 1.2,
 *      "cellHeight": 0.9,
 *      "color": "#D2B48C"
 *    }
 *  }
 * ============================================================
 */
export class ShelfComponent implements I3DComponent {
  readonly name = 'Shelf'

  private _shelf: Shelf | null = null

  setup(_app: App3D, props: Record<string, unknown>): THREE.Object3D {
    const options: ShelfOptions = {
      rows: (props.rows as number) ?? 3,
      cols: (props.cols as number) ?? 1,
      layers: (props.layers as number) ?? 3,
      cellWidth: (props.cellWidth as number) ?? 1,
      cellHeight: (props.cellHeight as number) ?? 0.8,
      cellDepth: (props.cellDepth as number) ?? 1,
      postThickness: (props.postThickness as number) ?? 0.06,
      shelfThickness: (props.shelfThickness as number) ?? 0.04,
      dividerThickness: (props.dividerThickness as number) ?? 0.02,
      color: (props.color as number | string) ?? 0x8b7355,
      shelfColor: props.shelfColor as number | string | undefined,
      postColor: props.postColor as number | string | undefined,
    }

    this._shelf = new Shelf(options)
    this._shelf.name = 'Shelf'
    return this._shelf
  }

  /** 获取内部的 Shelf 实例，方便读写 cellPositions 等 */
  get shelf(): Shelf | null {
    return this._shelf
  }

  dispose(): void {
    this._shelf?.dispose()
    this._shelf = null
  }
}
