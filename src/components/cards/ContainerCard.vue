<template>
  <!--
    集装箱信息卡片 — 示例（click 模式）
    点击集装箱后弹出，点击另一个时切换。
  -->
  <div class="container-card" @click.stop>
    <div class="card-header">
      <span class="card-title">{{ title }}</span>
      <span class="card-id">#{{ objectId }}</span>
    </div>
    <div class="card-body">
      <div class="info-row">
        <span class="label">货物</span>
        <span class="value">{{ cargo }}</span>
      </div>
      <div class="info-row">
        <span class="label">重量</span>
        <span class="value">{{ weight }}</span>
      </div>
      <div class="info-row">
        <span class="label">目的地</span>
        <span class="value">{{ destination }}</span>
      </div>
    </div>
    <div class="card-footer">
      <button class="btn-detail" @click="onDetail">查看详情</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  cardId: string
  objectId: string
  title?: string
  cargo?: string
  weight?: string
  destination?: string
}>()

const emit = defineEmits<{
  detail: [cardId: string, objectId: string]
}>()

function onDetail() {
  emit('detail', props.cardId, props.objectId)
}
</script>

<style scoped>
.container-card {
  width: 200px;
  padding: 14px;
  background: rgba(20, 20, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  color: #e0e0e0;
  font-size: 13px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.card-title {
  font-weight: 600;
  color: #fff;
}

.card-id {
  font-size: 11px;
  color: #888;
  font-family: monospace;
}

.card-body {
  margin-bottom: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.info-row .label { color: #999; }
.info-row .value { color: #ddd; font-weight: 500; }

.card-footer {
  text-align: right;
}

.btn-detail {
  padding: 4px 14px;
  background: rgba(233, 69, 96, 0.2);
  color: #e94560;
  border: 1px solid rgba(233, 69, 96, 0.3);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.btn-detail:hover {
  background: rgba(233, 69, 96, 0.35);
}
</style>
