<template>
  <div ref="sceneContainer" class="scene-page">
    <canvas ref="canvasRef" class="scene-canvas"></canvas>

    <CardHost :cards="cardStates" :registry="cardComponentRegistry" />

    <div class="toolbar">
      <div class="toolbar-group">
        <button @click="toggleAGV">{{ agvVisible ? '隐藏 AGV' : '显示 AGV' }}</button>
      </div>
      <div class="toolbar-group">
        <span class="hint">点击集装箱查看卡片</span>
      </div>
    </div>

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
import { initScene, CardHost, cardComponentRegistry } from '@/3d'
import { fetchSceneData } from '@/network/api/scene'
import {
  ShelfComponent, demoJsonDrivenShelf,
  SolarPanelComponent, SolarPanel,
  ComponentRegistry,
} from '@/3d'
import { createObjectFromDef } from '@/3d/objects'
import type { ModelDef } from '@/3d/types'
import AGVCard from '@/components/cards/AGVCard.vue'
import ContainerCard from '@/components/cards/ContainerCard.vue'
import type { SceneAPI, CardState } from '@/3d'
import type { SceneData } from '@/3d/types'
import type { Component } from 'vue'

// ---- 注册卡片 Vue 组件 ----
cardComponentRegistry.register('agv', AGVCard as unknown as Component)
cardComponentRegistry.register('container', ContainerCard as unknown as Component)

// ---- 注册 3D 组件 ----
ComponentRegistry.register(new ShelfComponent())
ComponentRegistry.register(new SolarPanelComponent())

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

// ============================================================
//  光伏板演示 — 同时展示 new 和 JSON 驱动两种用法
// ============================================================
function demoSolarPanels(api: SceneAPI): void {
  const { app } = api

  // --- 用法 1: 直接 new SolarPanel() ---
  // 地面光伏阵列，3 块并排
  const tilt = Math.PI / 6
  ;[
    { x: -3, z: 0 },
    { x: 0, z: 0 },
    { x: 3, z: 0 },
  ].forEach(({ x, z }) => {
    const panel = new SolarPanel({
      panelWidth: 1.8,
      panelHeight: 1.1,
      tiltAngle: tilt,
      standHeight: 0.8,
      cellRows: 6,
      cellCols: 8,
    })
    panel.position.set(x, 0, z)
    panel.rotation.y = 0.3
    panel.name = `PV-Direct-${x}`
    app.scene.add(panel)
  })

  // --- 用法 2: JSON 驱动 ---
  const solarModelDef: ModelDef = {
    id: 'pv-json-driven',
    type: 'component',
    componentName: 'SolarPanel',
    position: [0, 0, -3],
    rotation: [0, 0.5, 0],
    props: {
      panelWidth: 2.0,
      panelHeight: 1.3,
      tiltAngle: 0.45,
      standHeight: 1.2,
      cellRows: 8,
      cellCols: 12,
      cellColor: '#1a3a5c',
      frameColor: '#B0B0B0',
      standColor: '#4a4a4a',
    },
  }

  const result = createObjectFromDef(solarModelDef, app)
  if (result) {
    result.objects.forEach((obj) => app.scene.add(obj))
    console.log('[SolarPanel] JSON driven panel created')
  }
}

// ---- 生命周期 ----
onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) { error.value = 'Canvas 不存在'; return }

  try {
    const response = await fetchSceneData('default')
    const sceneData: SceneData = response.data

    sceneAPI = initScene(canvas, sceneData, sceneContainer.value ?? undefined)

    // ★ 货架 + 光伏板
    demoJsonDrivenShelf(sceneAPI)
    demoSolarPanels(sceneAPI)

    unsubCards = sceneAPI.cardManager.onStateChange((cards) => {
      cardStates.value = cards
    })
    cardStates.value = sceneAPI.cardManager.getCardStates()

    loading.value = false; statusText.value = ''
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('初始化失败:', msg)
    sceneAPI = initScene(canvas, undefined, sceneContainer.value ?? undefined)
    if (sceneAPI) {
      unsubCards = sceneAPI.cardManager.onStateChange((cards) => { cardStates.value = cards })
      cardStates.value = sceneAPI.cardManager.getCardStates()

      // ★ 默认场景也加上货架 + 光伏板
      demoJsonDrivenShelf(sceneAPI)
      demoSolarPanels(sceneAPI)
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
