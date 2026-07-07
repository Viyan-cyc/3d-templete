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
  loadLiveDataConfig,
  type Scene3DHandle,
  type CardState,
} from '@/3d'
import { cardRules } from '@/cards/sceneCardRules'

// ---- 状态 ----
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const statusText = ref('加载场景...')
const error = ref('')
const cardStates = ref<CardState[]>([])
let handle: Scene3DHandle | null = null

// ---- 生命周期 ----
onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) {
    error.value = 'Canvas 不存在'
    loading.value = false
    return
  }

  try {
    // 数据由业务方请求（这里用包提供的可选工具 loadLiveDataConfig；
    // 生产环境换成你自己的接口即可）
    const data = await loadLiveDataConfig()

    handle = await createScene3D(canvas, data, {
      cardRules,
      controls: {
        // 本场景是正交相机（见 live-data.json），minDistance/maxDistance 对正交无效，
        // 只有 maxPolarAngle 起作用：防止轨道旋到地面以下。要限制缩放请用 minZoom/maxZoom。
        maxPolarAngle: Math.PI / 2.3,
      },
    })
    handle.onCardState((states) => {
      cardStates.value = states
    })
    loading.value = false
    statusText.value = ''

    // 便于在控制台手动验证增量更新（demo 用，可删）：
    //   scene3d.update({ objects: { remove: ['tree01_trunk'] } })
    //   scene3d.update({ objects: { upsert: [{ id:'marker01', parentId:'sceneRoot', type:'mesh',
    //     geometry:{type:'sphere',params:{radius:1}}, material:{type:'standard',color:'#ff0'},
    //     position:[0,5,0] }] } })
    ;(window as unknown as { scene3d?: Scene3DHandle }).scene3d = handle
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Scene3D] 加载失败:', msg)
    error.value = `场景加载失败: ${msg}`
    loading.value = false
  }
})

onUnmounted(() => {
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
