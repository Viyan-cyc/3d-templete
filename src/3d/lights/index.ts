import * as THREE from 'three'
import type { LightDef } from '../types'

/**
 * 根据配置创建灯光
 */
export function createLight(config: LightDef): THREE.Light {
  switch (config.type) {
    case 'ambient':
      return new THREE.AmbientLight(config.color, config.intensity)

    case 'directional': {
      const light = new THREE.DirectionalLight(config.color, config.intensity)
      if (config.position) light.position.set(...config.position)
      if (config.castShadow) {
        light.castShadow = true
        light.shadow.mapSize.width = 1024
        light.shadow.mapSize.height = 1024
        light.shadow.camera.near = 0.5
        light.shadow.camera.far = 50
        light.shadow.camera.left = -10
        light.shadow.camera.right = 10
        light.shadow.camera.top = 10
        light.shadow.camera.bottom = -10
        light.shadow.bias = -0.0001
      }
      return light
    }

    case 'point': {
      const light = new THREE.PointLight(config.color, config.intensity, 20)
      if (config.position) light.position.set(...config.position)
      if (config.castShadow) {
        light.castShadow = true
        light.shadow.mapSize.width = 512
        light.shadow.mapSize.height = 512
      }
      return light
    }

    case 'spot': {
      const light = new THREE.SpotLight(config.color, config.intensity, 30, Math.PI / 6, 0.2, 1)
      if (config.position) light.position.set(...config.position)
      if (config.castShadow) {
        light.castShadow = true
        light.shadow.mapSize.width = 1024
        light.shadow.mapSize.height = 1024
      }
      return light
    }

    default:
      return new THREE.AmbientLight(config.color, config.intensity)
  }
}

/**
 * 创建默认灯光组
 */
export function createDefaultLights(): THREE.Light[] {
  return [
    new THREE.AmbientLight('#ffffff', 0.4),
    new THREE.DirectionalLight('#ffffff', 1.0),
  ]
}
