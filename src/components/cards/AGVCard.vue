<template>
  <!--
    AGV 小车状态气泡 — 示例卡片
    业务开发按照自己的业务需求编写卡片样式和交互。

    接收的 props：
    - cardId: 卡片 ID
    - objectId: 关联的 3D 物体 ID
    - 其余透传来自 JSON 中 card.props
  -->
  <div class="agv-bubble" @click.stop>
    <div class="agv-status-dot" :class="statusClass"></div>
    <span class="agv-label">{{ label }}</span>
    <span class="agv-battery">{{ battery }}%</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  cardId: string
  objectId: string
  status?: string
  label?: string
  battery?: number
}>()

const statusClass = computed(() => ({
  'is-online': props.status === 'online',
  'is-busy': props.status === 'busy',
  'is-offline': props.status === 'offline',
}))
</script>

<style scoped>
.agv-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(20, 20, 40, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  white-space: nowrap;
  font-size: 12px;
  color: #e0e0e0;
  backdrop-filter: blur(6px);
  user-select: none;
}

.agv-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}

.agv-status-dot.is-online { background: #4ecdc4; box-shadow: 0 0 6px rgba(78, 205, 196, 0.6); }
.agv-status-dot.is-busy   { background: #f0c040; box-shadow: 0 0 6px rgba(240, 192, 64, 0.6); }
.agv-status-dot.is-offline { background: #e94560; }

.agv-label {
  font-weight: 500;
}

.agv-battery {
  color: #999;
}
</style>
