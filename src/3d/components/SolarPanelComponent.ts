import type * as THREE from 'three'
import type { App3D } from '../App3D'
import type { I3DComponent } from './I3DComponent'
import { SolarPanel } from './SolarPanel'
import type { SolarPanelOptions } from './SolarPanel'

/**
 * ============================================================
 *  SolarPanelComponent — 将 SolarPanel 包装为 I3DComponent
 *
 *  模拟来自 npm 包的组件：用户只需 npm install 后
 *  ComponentRegistry.register(new SolarPanelComponent()) 即可在
 *  JSON 中通过 type:'component' + componentName:'SolarPanel' 驱动。
 *
 *  JSON 示例：
 *  {
 *    "id": "pv-panel-01",
 *    "type": "component",
 *    "componentName": "SolarPanel",
 *    "position": [5, 0, 2],
 *    "rotation": [0, 0.3, 0],
 *    "props": {
 *      "panelWidth": 2,
 *      "panelHeight": 1.2,
 *      "tiltAngle": 0.52,
 *      "standHeight": 1.5
 *    }
 *  }
 * ============================================================
 */
export class SolarPanelComponent implements I3DComponent {
  readonly name = 'SolarPanel'

  private _panel: SolarPanel | null = null

  setup(_app: App3D, props: Record<string, unknown>): THREE.Object3D {
    const options: SolarPanelOptions = {
      panelWidth: (props.panelWidth as number) ?? 2,
      panelHeight: (props.panelHeight as number) ?? 1.2,
      panelThickness: (props.panelThickness as number) ?? 0.04,
      cellRows: (props.cellRows as number) ?? 6,
      cellCols: (props.cellCols as number) ?? 10,
      cellGap: (props.cellGap as number) ?? 0.005,
      cellColor: (props.cellColor as number | string) ?? 0x1a3a5c,
      frameWidth: (props.frameWidth as number) ?? 0.04,
      frameColor: (props.frameColor as number | string) ?? 0xc0c0c0,
      tiltAngle: (props.tiltAngle as number) ?? 0,
      standHeight: (props.standHeight as number) ?? 0,
      standColor: props.standColor as number | string | undefined,
    }

    this._panel = new SolarPanel(options)
    this._panel.name = 'SolarPanel'
    return this._panel
  }

  get panel(): SolarPanel | null {
    return this._panel
  }

  dispose(): void {
    this._panel?.dispose()
    this._panel = null
  }
}
