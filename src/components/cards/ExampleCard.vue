<template>
  <!--
    示例卡片 — 用于 example 组件（asset:example）
    点击 example 物体后弹出，显示 id / 类型 / 坐标。
    由 CardHost Teleport 进 CSS2D 卡片 domEl，props 由 exampleHandler.addCard 传入。
  -->
  <div class="example-card" @click.stop>
    <div class="example-head">
      <span class="example-icon">📦</span>
      <span class="example-title">{{ label }}</span>
    </div>
    <div class="example-row">
      <span class="example-key">类型</span>
      <span class="example-val">{{ type }}</span>
    </div>
    <div class="example-row">
      <span class="example-key">坐标</span>
      <span class="example-val">{{ posX }}, {{ posZ }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  cardId: string
  objectId: string
  label?: string
  type?: string
  position?: number[]
}>()

const label = computed(() => props.label ?? props.objectId)
const type = computed(() => props.type ?? 'example')
const posX = computed(() => props.position?.[0]?.toFixed(1) ?? '0.0')
const posZ = computed(() => props.position?.[2]?.toFixed(1) ?? '0.0')
</script>

<style scoped>
.example-card {
  min-width: 120px;
  padding: 8px 12px;
  background: rgba(20, 24, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-top: 2px solid #5b8cff;
  border-radius: 10px;
  color: #e0e0e0;
  font-size: 12px;
  line-height: 1.6;
  backdrop-filter: blur(6px);
  user-select: none;
  cursor: default;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.example-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.example-icon {
  font-size: 14px;
}

.example-title {
  font-weight: 600;
  font-size: 13px;
}

.example-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.example-key {
  color: #999;
}

.example-val {
  color: #e0e0e0;
  font-variant-numeric: tabular-nums;
}
</style>
