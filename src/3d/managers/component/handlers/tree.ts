/**
 * tree handler — 按季节选材质
 *
 * component.params.season 映射到不同颜色：
 *   spring / summer / autumn / winter
 * 颜色映射表在 shared.seasonColors，可运行时修改。
 */

import * as THREE from 'three'
import type { ComponentHandler, ComponentContext } from '../ComponentManager'
import { createLiveObject3D } from '../../../utils/liveDataLoader'
import type { LiveDataObject } from '../../../utils/liveDataLoader'

export const treeHandler: ComponentHandler = {
  create(data: LiveDataObject, _ctx: ComponentContext) {
    const obj = createLiveObject3D(data)
    if (!obj) return null

    const season = data.component?.params?.season as string | undefined
    if (season) {
      applySeasonMaterial(obj, season, _ctx)
    }

    return obj
  },

  update(obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) {
    const season = data.component?.params?.season as string | undefined
    if (season) {
      applySeasonMaterial(obj, season, ctx)
      return true
    }
    return false
  },
}

function applySeasonMaterial(obj: THREE.Object3D, season: string, ctx: ComponentContext) {
  const colors = ctx.shared.seasonColors
  const color = colors[season] ?? '#4caf50'
  const mat = ctx.shared.getMaterial(color)

  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      const old = mesh.material
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else old?.dispose()
      mesh.material = mat
    }
  })
}
