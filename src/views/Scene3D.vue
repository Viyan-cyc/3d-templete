<template>
  <div ref="sceneContainer" class="scene-page">
    <canvas ref="canvasRef" class="scene-canvas"></canvas>

    <!-- ★ CardHost: 将 Vue 卡片组件 Teleport 到 3D CSS2D 层 -->
    <CardHost :cards="cardStates" :registry="cardComponentRegistry" />

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-group">
        <button @click="toggleAGV">{{ agvVisible ? '隐藏 AGV' : '显示 AGV' }}</button>
      </div>
      <div class="toolbar-group">
        <span class="hint">点击集装箱查看卡片</span>
      </div>
    </div>

    <!-- 加载 / 错误 -->
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
/**
 * ============================================================
 *  Scene3D.vue — 3D 场景入口 + 卡片系统集成示例
 *
 *  完整流程：
 *  1. 注册卡片 Vue 组件类型
 *  2. 获取 JSON 数据（含 card 声明）
 *  3. initScene(canvas, data) → 场景 + CardManager
 *  4. CardManager.onStateChange → 驱动 CardHost 渲染
 *  5. 工具栏控制卡片显隐
 *  6. onUnmounted 销毁
 * ============================================================
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { initScene, CardHost, cardComponentRegistry } from '@/3d'
import { fetchSceneData } from '@/network/api/scene'
import AGVCard from '@/components/cards/AGVCard.vue'
import ContainerCard from '@/components/cards/ContainerCard.vue'
import type { SceneAPI, CardState } from '@/3d'
import type { SceneData } from '@/3d/types'
import type { Component } from 'vue'

// ---- 注册卡片 Vue 组件 ----
// 类型名与 JSON card.cardType 对应
cardComponentRegistry.register('agv', AGVCard as unknown as Component)
cardComponentRegistry.register('container', ContainerCard as unknown as Component)

// ---- 状态 ----
const sceneContainer = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const statusText = ref('加载场景...')
const error = ref('')
const cardStates = ref<CardState[]>([])
const agvVisible = ref(true)

let sceneAPI: SceneAPI | null = null
let unsubCards: (() => void) | null = null

// ---- 生命周期 ----
onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) { error.value = 'Canvas 不存在'; return }

  try {
    // [1] 获取数据
    const response = await fetchSceneData('default')
    const sceneData: SceneData = response.data

    // [2] 初始化场景 + 卡片系统
    sceneAPI = initScene(canvas, sceneData, sceneContainer.value ?? undefined)

    // [3] 订阅卡片状态 → CardHost 响应式渲染
    unsubCards = sceneAPI.cardManager.onStateChange((cards) => {
      cardStates.value = cards
    })
    // 初始触发一次
    cardStates.value = sceneAPI.cardManager.getCardStates()

    loading.value = false; statusText.value = ''
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('初始化失败:', msg)
    sceneAPI = initScene(canvas, undefined, sceneContainer.value ?? undefined)
    if (sceneAPI) {
      unsubCards = sceneAPI.cardManager.onStateChange((cards) => { cardStates.value = cards })
      cardStates.value = sceneAPI.cardManager.getCardStates()
    }
    loading.value = false; statusText.value = ''
    error.value = `数据加载失败 (${msg})，使用默认场景。`
  }
})

onUnmounted(() => {
  unsubCards?.()
  sceneAPI?.dispose()
  sceneAPI = null
})

// ---- 卡片控制 ----
function toggleAGV() {
  if (!sceneAPI) return
  if (agvVisible.value) {
    sceneAPI.cardManager.hideByType('agv')
  } else {
    sceneAPI.cardManager.showByType('agv')
  }
  agvVisible.value = !agvVisible.value
}
</script>

<style scoped>
.scene-page {
  width: 100%; height: 100%; position: relative; overflow: hidden;
}
.scene-canvas {
  display: block; width: 100%; height: 100%;
}

/* 工具栏 */
.toolbar {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 16px; align-items: center;
}
.toolbar-group button {
  padding: 8px 18px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px; color: #ddd; font-size: 13px; cursor: pointer;
  transition: background 0.2s;
}
.toolbar-group button:hover { background: rgba(255,255,255,0.15); }
.hint { font-size: 13px; color: #888; }

/* 加载 / 错误 */
.loading-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(26,26,46,0.9); color: #c0c0e0;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid rgba(255,255,255,0.15); border-top-color: #e94560;
  border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-overlay {
  position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
  background: rgba(220,50,50,0.9); color: #fff;
  padding: 10px 24px; border-radius: 8px; font-size: 14px; cursor: pointer;
}
</style>
