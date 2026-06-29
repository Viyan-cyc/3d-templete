import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Scene3D',
    component: () => import('@/views/Scene3D.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
