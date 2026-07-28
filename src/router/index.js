import { createRouter, createWebHistory } from "vue-router";
const routes = [
  {
    path: "/",
    name: "Scene3D",
    component: () => import("@/views/Scene3D.vue")
  },
  {
    // 预览/编辑入口：供 octoapp iframe 嵌入，走 postMessage 桥
    path: "/embed",
    name: "Embed",
    component: () => import("@/views/embed.vue")
  }
];
const router = createRouter({
  history: createWebHistory(),
  routes
});
var index_default = router;
export {
  index_default as default
};
