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
import {
  createScene3D,
  CardHost,
  type Scene3DHandle,
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

/** 渲染（或重新渲染）一个完整 SceneConfig；data 为 null 时清空 */
async function renderScene(data: LiveDataConfig | null) {
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
      interactive: true, // 预览/编辑态；阶段0 仅占位，阶段3 才挂 picker
      controls: {
        maxPolarAngle: Math.PI / 2.3,
      },
    })
    handle.onCardState((states) => {
      cardStates.value = states
    })
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
      await renderScene(data as LiveDataConfig | null)
    },
    // 以下阶段3 启用
    onPickMode: () => {},
    onFlyTo: () => {},
    onTheme: () => {},
    onPatch: () => {},
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
