export { ComponentRegistry } from './ComponentRegistry'
export type { ComponentCtor, ComponentBuilder } from './ComponentRegistry'

export { AssetPool } from './AssetPool'

// 旧版类构造器组件（ModelDef.componentName 驱动）
export { Shelf } from './Shelf'
export type { ShelfOptions, ShelfCellCoord } from './Shelf'

export { SolarPanel } from './SolarPanel'
export type { SolarPanelOptions } from './SolarPanel'

// ---- 新版函数构建器组件（liveData component.type 驱动 + AssetPool 缓存） ----

import { ComponentRegistry } from './ComponentRegistry'
import { registerWarehouseComponents } from './warehouse'
import { registerIndustrialComponents } from './industrial'
import { registerPortComponents } from './port'
import { registerCommonComponents } from './common'

/** 注册所有新版 builder 组件（在 liveDataLoader 初始化时调用一次） */
export function registerAllBuilders(): void {
  registerWarehouseComponents(ComponentRegistry)
  registerIndustrialComponents(ComponentRegistry)
  registerPortComponents(ComponentRegistry)
  registerCommonComponents(ComponentRegistry)
}
