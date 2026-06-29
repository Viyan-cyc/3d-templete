<template>
  <div class="scene-page">
    <canvas ref="canvasRef" class="scene-canvas"></canvas>

    <!-- 状态提示 -->
    <div class="loading-overlay" v-if="loading">
      <div class="spinner"></div>
      <p>{{ statusText }}</p>
    </div>

    <!-- 错误提示 -->
    <div class="error-overlay" v-if="error" @click="error = ''">
      <p>{{ error }}</p>
      <span class="retry-hint">(点击关闭)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ============================================================
 *  Scene3D.vue — 3D 场景入口示例
 *
 *  这是给开发者的使用示例，演示了完整的集成流程：
 *  1. 获取数据（通常来自后端 API）
 *  2. 解析 JSON → SceneData
 *  3. 调用 initScene(canvas, data)
 *  4. 组件销毁时调用 dispose()
 *
 *  开发者将此页面移植到自己的工程时：
 *  - 替换 fetchSceneData 为自己的数据请求
 *  - 其余部分（canvas ref → initScene → dispose）照搬即可
 * ============================================================
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { initScene } from '@/3d'
import { fetchSceneData } from '@/network/api/scene'
import type { SceneAPI } from '@/3d'
import type { SceneData } from '@/3d/types'

// ---- 状态 ----
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const statusText = ref('加载场景数据...')
const error = ref('')

let sceneAPI: SceneAPI | null = null

// ---- 生命周期 ----
onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) {
    error.value = '无法获取 Canvas 元素'
    return
  }

  try {
    // [1] 获取数据 —— 开发者替换为自己的数据来源
    const response = await fetchSceneData('default')
    const sceneData: SceneData = response.data

    // [2] 初始化场景 —— 一行调用
    sceneAPI = initScene(canvas, sceneData, true)

    loading.value = false
    statusText.value = ''
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('场景初始化失败:', msg)

    // 降级：不带数据的默认 demo
    sceneAPI = initScene(canvas, undefined, true)
    loading.value = false
    statusText.value = ''
    error.value = `数据加载失败，使用默认场景。(${msg})`
  }
})

onUnmounted(() => {
  sceneAPI?.dispose()
  sceneAPI = null
})
</script>

<style scoped>
.scene-page {
  width: 100%;
  height: 100%;
  position: relative;
}

.scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* 加载中 */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(26, 26, 46, 0.9);
  color: #c0c0e0;
  pointer-events: none;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255,255,255,0.15);
  border-top-color: #e94560;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 错误提示 */
.error-overlay {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(220, 50, 50, 0.9);
  color: #fff;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  z-index: 10;
}

.retry-hint {
  font-size: 12px;
  opacity: 0.7;
}
</style>
