<template>
  <div class="scene-page">
    <canvas ref="canvasRef" class="scene-canvas"></canvas>
    <CardHost :cards="cardStates" />

    <div class="loading-overlay" v-if="loading">
      <div class="spinner"></div>
      <p>{{ statusText }}</p>
    </div>
    <div class="error-overlay" v-if="error" @click="error = ''">
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import {
  createScene3D,
  CardHost,
  type Scene3DHandle,
  type SceneUpdatePatch,
  type CardState,
  type LiveDataConfig,
} from '@/3d'
import { bindPostMessageHost, postToParent } from '@/3d/bridge/postMessage-host'
import { cardRules } from '@/cards/sceneCardRules'

// ---- 状态 ----
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const statusText = ref('等待场景数据...')
const error = ref('')
const cardStates = ref<CardState[]>([])
let handle: Scene3DHandle | null = null
let detachBridge: (() => void) | null = null
/** 最近一次已渲染的 SCENE_UPDATE payload JSON——用于去重。
 *  octoapp 会在 iframe onLoad 与收到 SCENE_READY 后各发一次相同 payload，
 *  若不去重会触发两个 createScene3D 并发抢占同一 canvas（渲染冲突/白屏）。 */
let lastRenderedJson = ''

/** 是否开启调试（URL 加 ?debug=true）：控制详细日志 + window.__scene/__camera/__handle 暴露 */
const isDebug =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true'

/** DEBUG 工具（仅 ?debug=true 调用）：暴露 three 对象到 window + 打印场景包围盒/相机/子节点 */
function logSceneDebug(h: Scene3DHandle): void {
  const w = window as unknown as { __scene?: unknown; __camera?: unknown; __handle?: unknown }
  w.__handle = h
  w.__scene = h.app.scene
  w.__camera = h.app.camera
  try {
    const box = new THREE.Box3().setFromObject(h.app.scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    console.log('[embed] 场景包围盒:', {
      isEmpty: box.isEmpty(),
      min: box.min.toArray(),
      max: box.max.toArray(),
      size: size.toArray(),
      center: center.toArray(),
    })
    const cam = h.app.camera as THREE.PerspectiveCamera
    console.log('[embed] 相机:', {
      type: cam.type,
      position: cam.position.toArray(),
      target: h.controls.target.toArray(),
      near: cam.near,
      far: cam.far,
      fov: cam.fov,
    })
    console.log(
      '[embed] 场景直接子节点:',
      h.app.scene.children.length,
      h.app.scene.children.map((c) => c.name || c.type),
    )
  } catch (e) {
    console.warn('[embed] 调试信息计算失败', e)
  }
}

/** 渲染（或重新渲染）一个完整 SceneConfig；data 为 null 时清空 */
async function renderScene(data: LiveDataConfig | null) {
  if (isDebug) console.log('[embed] renderScene 开始, objects=', data?.objects?.length ?? 0)
  const canvas = canvasRef.value
  if (!canvas) {
    postToParent({ type: 'SCENE_ERROR', message: 'Canvas 不存在' })
    return
  }

  // 清空旧场景（createScene3D 无整体替换 API，dispose 后重建）
  handle?.dispose()
  handle = null

  if (data === null) {
    loading.value = false
    statusText.value = ''
    return
  }

  loading.value = true
  statusText.value = '渲染场景...'
  try {
    handle = await createScene3D(canvas, data, {
      cardRules,
      interactive: true, // 预览/编辑态：挂 postMessage 桥 + ScenePicker
      controls: {
        maxPolarAngle: Math.PI / 2.3,
      },
    })
    handle.onCardState((states) => {
      cardStates.value = states
    })
    // 拾取回调：命中物体 → postMessage SCENE_PICK 给宿主（octoapp 弹属性编辑器）
    if (handle.picker) {
      handle.picker.onPick = (info) => {
        postToParent({
          type: 'SCENE_PICK',
          id: info.id,
          name: info.name,
          component: info.component,
          props: info.props,
        })
      }
    }

    // DEBUG（仅 ?debug=true）：暴露 three 对象 + 打印包围盒/相机/子节点
    if (isDebug) logSceneDebug(handle)

    loading.value = false
    statusText.value = ''
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[embed] 渲染失败:', msg)
    error.value = `场景渲染失败: ${msg}`
    loading.value = false
    postToParent({ type: 'SCENE_ERROR', message: msg })
  }
}

// ---- 生命周期 ----
onMounted(() => {
  // 立即向宿主握手：宿主收到后若已有 pendingData 会重发 SCENE_UPDATE
  postToParent({ type: 'SCENE_READY' })
  console.log('[embed] SCENE_READY sent')

  // 绑定 postMessage 桥
  detachBridge = bindPostMessageHost({
    onScene: async (data) => {
      if (isDebug)
        console.log(
          '[embed] 收到 SCENE_UPDATE, objects=',
          (data as { objects?: unknown[] } | null)?.objects?.length ?? 0,
        )
      // 去重：onLoad 与 SCENE_READY 重发会带来相同 payload，只渲染一次
      const json = data === null ? 'null' : JSON.stringify(data)
      if (json === lastRenderedJson) {
        if (isDebug) console.log('[embed] 重复 SCENE_UPDATE（同 payload），跳过渲染')
        return
      }
      lastRenderedJson = json
      await renderScene(data as LiveDataConfig | null)
    },
    // 以下阶段3：拾取开关 / 聚焦 / 主题 / 增量补丁
    onPickMode: (enabled) => {
      if (!handle?.picker) return
      enabled ? handle.picker.enable() : handle.picker.disable()
    },
    onPickGranularity: (mode) => {
      handle?.picker?.setGranularity(mode)
    },
    onFlyTo: (targetId) => {
      handle?.flyTo?.(targetId)
    },
    onTheme: (mode) => {
      handle?.setTheme?.(mode)
    },
    onPatch: (patch) => {
      handle?.update(patch as SceneUpdatePatch)
    },
  })

  // 兜底：独立访问 /embed（非 iframe）时，等一会若没收到 SCENE_UPDATE，
  // 就用 live-data.json 自渲染一个默认场景，便于单独调试 embed 页。
  if (window.self === window.top) {
    // 独立访问 /embed（非 iframe）：等一会若没收到 SCENE_UPDATE，自渲染一个默认场景。
    // 支持 ?scene=xxx.json 指定场景文件（调试用），默认 live-data.json
    const sceneFile = new URLSearchParams(window.location.search).get('scene') ?? 'live-data.json'
    console.log(`[embed] 独立访问，尝试加载默认场景 ${sceneFile}`)
    window.setTimeout(async () => {
      if (handle) return // 已收到 SCENE_UPDATE 则跳过
      try {
        const res = await fetch(`/${sceneFile}`)
        if (res.ok) {
          const data = (await res.json()) as LiveDataConfig
          await renderScene(data)
        }
      } catch {
        // 静默：独立调试无默认数据不算错误
      }
    }, 100)
  }
})

onUnmounted(() => {
  detachBridge?.()
  detachBridge = null
  handle?.dispose()
  handle = null
})
</script>

<style scoped>
.scene-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(26, 26, 46, 0.9);
  color: #c0c0e0;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: #e94560;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.error-overlay {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(220, 50, 50, 0.9);
  color: #fff;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
</style>
