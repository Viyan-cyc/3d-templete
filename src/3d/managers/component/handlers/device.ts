/**
 * device handler — 按设备状态选材质
 *
 * component.params.status 映射到不同颜色：
 *   running / stopped / warning / offline
 * 颜色映射表在 shared.deviceStatusColors，可运行时修改。
 */

import * as THREE from 'three'
import type { ComponentHandler, ComponentContext } from '../ComponentManager'
import { createLiveObject3D } from '../../../utils/liveDataLoader'
import type { LiveDataObject } from '../../../utils/liveDataLoader'

export const deviceHandler: ComponentHandler = {
  create(data: LiveDataObject, _ctx: ComponentContext) {
    const obj = createLiveObject3D(data)
    if (!obj) return null

    const status = data.component?.params?.status as string | undefined
    if (status) {
      applyDeviceStatus(obj, status, _ctx)
    }

    return obj
  },

  update(obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) {
    const status = data.component?.params?.status as string | undefined
    if (status) {
      applyDeviceStatus(obj, status, ctx)
      return true
    }
    return false
  },
}

function applyDeviceStatus(obj: THREE.Object3D, status: string, ctx: ComponentContext) {
  const colors = ctx.shared.deviceStatusColors
  const color = colors[status] ?? '#888888'
  const mat = ctx.shared.getMaterial(color, 0.5, 0.3)

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
