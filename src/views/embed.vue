<template>
  <div class="scene-page">
    <canvas ref="canvasRef" class="scene-canvas"></canvas>
    <CardHost :cards="cardStates" :registry="cardRegistry" />

    <div class="loading-overlay" v-if="loading">
      <div class="spinner"></div>
      <p>{{ statusText }}</p>
    </div>
    <div class="error-overlay" v-if="error" @click="error = ''">
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import {
  createScene3D,
} from '@/3d'
import { CardHost } from '@/adapters/vue'
import { bindPostMessageHost, postToParent } from '@/3d/bridge/postMessage-host'
import { cardRules } from '@/adapters/vue/sceneCardRules'

// ---- 状态 ----
const canvasRef = ref(null)
const loading = ref(true)
const statusText = ref('等待场景数据...')
const error = ref('')
const cardStates = ref([])
const cardRegistry = ref(null)
let handle = null
let detachBridge = null
let lastRenderedJson = ''

const isDebug =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true'

function logSceneDebug(h) {
  window.__handle = h
  window.__scene = h.app.scene
  window.__camera = h.app.camera
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
    const cam = h.app.camera
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

async function renderScene(data) {
  if (isDebug) console.log('[embed] renderScene 开始, objects=', data?.objects?.length ?? 0)
  const canvas = canvasRef.value
  if (!canvas) {
    postToParent({ type: 'SCENE_ERROR', message: 'Canvas 不存在' })
    return
  }

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
      interactive: true,
      controls: {
        maxPolarAngle: Math.PI / 2.3,
      },
    })
    cardRegistry.value = handle.cardManager.registry
    handle.onCardState((states) => {
      cardStates.value = states
    })
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

    if (isDebug) logSceneDebug(handle)

    loading.value = false
    statusText.value = ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[embed] 渲染失败:', msg)
    error.value = `场景渲染失败: ${msg}`
    loading.value = false
    postToParent({ type: 'SCENE_ERROR', message: msg })
  }
}

// ---- 生命周期 ----
onMounted(() => {
  postToParent({ type: 'SCENE_READY' })
  console.log('[embed] SCENE_READY sent')

  detachBridge = bindPostMessageHost({
    onScene: async (data) => {
      if (isDebug)
        console.log(
          '[embed] 收到 SCENE_UPDATE, objects=',
          data?.objects?.length ?? 0,
        )
      const json = data === null ? 'null' : JSON.stringify(data)
      if (json === lastRenderedJson) {
        if (isDebug) console.log('[embed] 重复 SCENE_UPDATE（同 payload），跳过渲染')
        return
      }
      lastRenderedJson = json
      await renderScene(data)
    },
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
    onResetCamera: () => {
      handle?.resetCamera?.()
    },
    onPatch: (patch) => {
      handle?.update(patch)
    },
  })

  if (window.self === window.top) {
    const sceneFile = new URLSearchParams(window.location.search).get('scene') ?? 'live-data.json'
    console.log(`[embed] 独立访问，尝试加载默认场景 ${sceneFile}`)
    window.setTimeout(async () => {
      if (handle) return
      try {
        const res = await fetch(`/${sceneFile}`)
        if (res.ok) {
          const data = await res.json()
          await renderScene(data)
        }
      } catch {
        // 静默
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
