<template>
  <!--
    CardHost — 3D 卡片宿主组件

    通过 Teleport 将 Vue 卡片组件渲染到 CSS2DObject 的 DOM 元素中。
    业务开发只需关注自己的卡片组件怎么写，不需要了解 CSS2D 定位原理。

    使用方式：
    <CardHost :cards="cards" :registry="cardRegistry" />
  -->
  <template v-for="card in cards" :key="card.id">
    <Teleport :to="card.domElement" v-if="card.domElement">
      <Transition name="card-fade">
        <component
          v-if="card.visible && getCardComponent(card.type)"
          :is="getCardComponent(card.type)"
          :card-id="card.id"
          :object-id="card.objectId"
          v-bind="card.props"
        />
      </Transition>
    </Teleport>
  </template>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import type { CardState } from './types'

export interface CardRegistry {
  get(type: string): Component | undefined
}

const props = defineProps<{
  /** 卡片状态列表，由 CardManager.onStateChange 提供 */
  cards: CardState[]
  /** 卡片类型 → Vue 组件 的注册表 */
  registry: CardRegistry
}>()

function getCardComponent(type: string): Component | undefined {
  return props.registry.get(type)
}
</script>

<style>
/* 卡片通用过渡动画 */
.card-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.card-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.card-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.card-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
