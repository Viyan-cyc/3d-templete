<template>
  <!--
    通用信息卡片 — 用于树 / 建筑
    点击 3D 物体后弹出，显示编号、坐标、高度。

    接收的 props：
    - cardId:   卡片 ID
    - objectId: 关联的 3D 物体 ID（如 tree01 / buildingA）
    - kind:     'tree' | 'building'，不传则按 objectId 前缀推断
    - label:    标题（如 "树 01"）
    - position: 地面坐标 [x, z]
    - height:   高度
  -->
  <div class="info-card" :class="`kind-${kind}`" @click.stop>
    <div class="info-head">
      <span class="info-icon">{{ kind === 'tree' ? '🌲' : '🏢' }}</span>
      <span class="info-title">{{ label }}</span>
    </div>
    <div class="info-row">
      <span class="info-key">坐标</span>
      <span class="info-val">{{ posX }}, {{ posZ }}</span>
    </div>
    <div class="info-row">
      <span class="info-key">高度</span>
      <span class="info-val">{{ height.toFixed(1) }} m</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  cardId: string
  objectId: string
  kind?: 'tree' | 'building'
  label?: string
  position?: [number, number]
  height?: number
}>()

const kind = computed<'tree' | 'building'>(() => {
  if (props.kind) return props.kind
  return props.objectId?.startsWith('building') ? 'building' : 'tree'
})

const label = computed(() => props.label ?? props.objectId)

const posX = computed(() => props.position?.[0]?.toFixed(1) ?? '0.0')
const posZ = computed(() => props.position?.[1]?.toFixed(1) ?? '0.0')

const height = computed(() => props.height ?? 0)
</script>

<style scoped>
.info-card {
  min-width: 120px;
  padding: 8px 12px;
  background: rgba(20, 20, 40, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: #e0e0e0;
  font-size: 12px;
  line-height: 1.6;
  backdrop-filter: blur(6px);
  user-select: none;
  cursor: default;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.info-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-icon {
  font-size: 14px;
}

.info-title {
  font-weight: 600;
  font-size: 13px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.info-key {
  color: #999;
}

.info-val {
  color: #e0e0e0;
  font-variant-numeric: tabular-nums;
}

.kind-tree {
  border-top: 2px solid #4caf50;
}

.kind-building {
  border-top: 2px solid #e94560;
}
</style>
