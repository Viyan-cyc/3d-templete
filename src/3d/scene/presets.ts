/**
 * ============================================================
 *  scenePresets — 场景预设配置
 *
 *  数据缺 scene / camera / lights 时回落到预设，保证不报错。
 *
 *  用法：
 *    createScene3D(canvas, data, { preset: 'outdoor' })
 *    // 数据有值的部分覆盖预设，缺值的部分回落到预设
 *
 *  扩展自定义预设：
 *    import { registerScenePreset } from '@/3d'
 *    registerScenePreset('night', { ... })
 * ============================================================
 */

import type { LiveDataConfig } from './loader'

// ══════════════════════════════════════════════════════════════
// 类型
// ══════════════════════════════════════════════════════════════

/** 场景预设：包含 scene / camera / lights 三部分，缺值时回落 */
export interface ScenePreset {
  /** 预设名称（显示/调试用） */
  name: string
  scene?: NonNullable<LiveDataConfig['scene']>
  camera?: NonNullable<LiveDataConfig['camera']>
  lights?: NonNullable<LiveDataConfig['lights']>
}

// ══════════════════════════════════════════════════════════════
// 内置预设
// ══════════════════════════════════════════════════════════════

/** 内置预设表 */
const scenePresets: Record<string, ScenePreset> = {
  /** 深色室内/数字孪生（默认） */
  dark: {
    name: '深色数字孪生',
    scene: {
      background: '#1a1a2e',
      environment: { preset: 'room', intensity: 1.0 },
    },
    camera: {
      type: 'perspective',
      position: [15, 12, 15],
      lookAt: [0, 0, 0],
      perspective: { fov: 50, near: 0.1, far: 1000 },
    },
    lights: [
      { type: 'ambient', intensity: 0.5, color: '#ffffff' },
      {
        type: 'hemisphere',
        intensity: 0.4,
        skyColor: '#b0c4de',
        groundColor: '#444444',
        position: [0, 50, 0],
      },
      {
        type: 'directional',
        intensity: 1.2,
        color: '#ffffff',
        position: [10, 20, 10],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 2048,
          camera: { near: 0.5, far: 100, left: -30, right: 30, top: 30, bottom: -30 },
        },
      },
    ],
  },

  /** 浅色户外/城市规划 */
  outdoor: {
    name: '浅色户外',
    scene: {
      background: '#87CEEB',
      environment: { preset: 'city', intensity: 0.9 },
      fog: { type: 'linear', color: '#aecbe6', near: 80, far: 220 },
    },
    camera: {
      type: 'perspective',
      position: [45, 38, 55],
      lookAt: [0, 4, 0],
      perspective: { fov: 50, near: 0.1, far: 1000 },
    },
    lights: [
      { type: 'ambient', intensity: 0.65, color: '#ffffff' },
      {
        type: 'hemisphere',
        intensity: 0.5,
        skyColor: '#87CEEB',
        groundColor: '#a0a0a0',
        position: [0, 50, 0],
      },
      {
        type: 'directional',
        intensity: 1.5,
        color: '#fff4e0',
        position: [40, 60, 30],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 4096,
          camera: { near: 0.5, far: 200, left: -60, right: 60, top: 60, bottom: -60 },
        },
      },
    ],
  },

  /** 工业/仓库/车间 */
  industrial: {
    name: '工业车间',
    scene: {
      background: '#2a2a2e',
      environment: { preset: 'warehouse', intensity: 0.8 },
      fog: { type: 'linear', color: '#2a2a2e', near: 50, far: 150 },
    },
    camera: {
      type: 'perspective',
      position: [20, 15, 20],
      lookAt: [0, 2, 0],
      perspective: { fov: 55, near: 0.1, far: 500 },
    },
    lights: [
      { type: 'ambient', intensity: 0.3, color: '#c0c0c0' },
      {
        type: 'hemisphere',
        intensity: 0.3,
        skyColor: '#888899',
        groundColor: '#333333',
        position: [0, 30, 0],
      },
      {
        type: 'directional',
        intensity: 1.0,
        color: '#ffe8cc',
        position: [15, 25, 10],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 2048,
          camera: { near: 0.5, far: 80, left: -25, right: 25, top: 25, bottom: -25 },
        },
      },
      {
        type: 'directional',
        intensity: 0.6,
        color: '#ffffff',
        position: [-10, 20, -15],
        target: [0, 0, 0],
        castShadow: false,
      },
    ],
  },

  /** 简约白底/产品展示 */
  studio: {
    name: '简约白底',
    scene: {
      background: '#f0f0f0',
      environment: { preset: 'studio', intensity: 1.2 },
    },
    camera: {
      type: 'perspective',
      position: [5, 4, 5],
      lookAt: [0, 1, 0],
      perspective: { fov: 45, near: 0.1, far: 100 },
    },
    lights: [
      { type: 'ambient', intensity: 0.8, color: '#ffffff' },
      {
        type: 'hemisphere',
        intensity: 0.6,
        skyColor: '#ffffff',
        groundColor: '#dddddd',
        position: [0, 10, 0],
      },
      {
        type: 'directional',
        intensity: 1.0,
        color: '#ffffff',
        position: [5, 8, 5],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 1024,
          camera: { near: 0.5, far: 30, left: -8, right: 8, top: 8, bottom: -8 },
        },
      },
    ],
  },
}

// ══════════════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════════════

/**
 * 注册自定义场景预设（幂等：同名覆盖）。
 *
 * @example
 * ```ts
 * registerScenePreset('night', {
 *   name: '夜间',
 *   scene: { background: '#0a0a1a', environment: { preset: 'night', intensity: 0.5 } },
 *   camera: { type: 'perspective', position: [10, 8, 10], lookAt: [0, 0, 0],
 *             perspective: { fov: 50, near: 0.1, far: 500 } },
 *   lights: [
 *     { type: 'ambient', intensity: 0.2, color: '#223355' },
 *     { type: 'directional', intensity: 0.8, color: '#aabbff', position: [5, 15, 5] },
 *   ],
 * })
 * ```
 */
export function registerScenePreset(key: string, preset: ScenePreset): void {
  scenePresets[key] = preset
}

/** 获取已注册的预设（只读副本） */
export function getScenePresets(): Readonly<Record<string, ScenePreset>> {
  return { ...scenePresets }
}

/**
 * 合并相机配置：按 type 只保留 perspective 或 orthographic 子字段——二者互斥，不同时存在。
 * - type 缺省按 'perspective'
 * - 先 spread（用户值覆盖预设）解析出对应子字段，再剔除另一子字段，避免歧义
 */
function mergeCamera(
  cfgCam: NonNullable<LiveDataConfig['camera']>,
  presetCam: NonNullable<LiveDataConfig['camera']> | undefined,
): NonNullable<LiveDataConfig['camera']> {
  const type = cfgCam.type ?? 'perspective'
  const merged: NonNullable<LiveDataConfig['camera']> = {
    ...presetCam,
    ...cfgCam,
    type,
  }
  // perspective / orthographic 互斥：按 type 删除不相关的子字段
  if (type === 'orthographic') {
    delete merged.perspective
  } else {
    delete merged.orthographic
  }
  return merged
}

/**
 * 将用户传入的 LiveDataConfig 与指定预设合并。
 * scene / camera / lights 缺失时回落到预设；子字段级合并（用户值覆盖预设）。
 *
 * camera 合并规则：
 * - 完全没传 camera → 用预设（透视）
 * - 传了 camera 但没传 type → type 默认 'perspective'
 * - type='perspective' 但没传 perspective 子字段 → 用预设的 perspective 兜底
 * - type='orthographic' 但没传 orthographic 子字段 → 用预设的 orthographic 兜底
 */
export function mergeWithPreset(config: LiveDataConfig, presetKey: string): LiveDataConfig {
  const preset = scenePresets[presetKey] ?? scenePresets.dark
  const pScene = preset.scene
  const pCamera = preset.camera
  const pLights = preset.lights

  return {
    version: config.version ?? '1.0',
    scene: config.scene
      ? {
          ...pScene,
          ...config.scene,
          fog: config.scene.fog ?? pScene?.fog,
          environment: config.scene.environment ?? pScene?.environment,
        }
      : { ...pScene },
    camera: config.camera ? mergeCamera(config.camera, pCamera) : { ...pCamera },
    lights: config.lights ?? pLights,
    objects: config.objects,
  }
}
