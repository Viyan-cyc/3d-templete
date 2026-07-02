<template>
  <div class="scene-page">
    <canvas ref="canvasRef" class="scene-canvas"></canvas>

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
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { App3D, loadLiveDataConfig, applyLiveDataToApp, ensureFont } from '@/3d'
import type { LiveDataObject } from '@/3d'
import { createOrbitControls } from '@/3d/controls/OrbitControls'

// ---- 状态 ----
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const statusText = ref('加载场景...')
const error = ref('')

let app: App3D | null = null
let controls: ReturnType<typeof createOrbitControls> | null = null
let frameId = 0

// ---- 生命周期 ----
onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) {
    error.value = 'Canvas 不存在'
    return
  }

  try {
    // 1. 创建 3D 引擎
    app = new App3D({
      canvas,
      enableShadows: true,
      antialias: true,
    })

    // 2. 加载 live-data 配置
    const config = await loadLiveDataConfig()

    // 2.1 若含文字标签，预加载字体（ASCII 立体字需要；中文走 canvas 贴图，不依赖字体）
    if (config.objects?.some((o: LiveDataObject) => o.geometry?.type === 'text')) {
      await ensureFont()
    }

    // 3. 应用到场景
    applyLiveDataToApp(app, config, {
      viewSize: { width: canvas.clientWidth, height: canvas.clientHeight },
    })

    // 4. IBL 环境光 (PMREM) — physical 材质必需
    const pmrem = new THREE.PMREMGenerator(app.renderer)
    app.scene.environment = pmrem.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture
    pmrem.dispose()

    // 5. OrbitControls
    controls = createOrbitControls(app.camera, app.canvas, {
      minDistance: 5,
      maxDistance: 150,
      maxPolarAngle: Math.PI / 2.3,
    })

    // 6. 渲染循环
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls?.update()
      if (app) {
        app.renderer.render(app.scene, app.camera)
      }
    }
    animate()

    loading.value = false
    statusText.value = ''
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Live Data] 加载失败:', msg)
    error.value = `场景加载失败: ${msg}`
    loading.value = false
  }
})

onUnmounted(() => {
  if (frameId) {
    cancelAnimationFrame(frameId)
    frameId = 0
  }
  controls?.dispose()
  controls = null
  app?.dispose()
  app = null
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
