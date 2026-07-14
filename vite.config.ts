import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteMockServe } from 'vite-plugin-mock'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    viteMockServe({
      mockPath: 'mock',
      enable: command === 'serve',
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'src') },
      // dev 阶段：直接 alias 到 3d-components 源码，无需 build/install。
      // 生产阶段改 package.json dependencies + npm install @cyc/3d-components 后移除这些 alias。
      // 注意：子路径必须排在主路径之前（find 按顺序匹配，长的先匹配避免被主入口截获）
      { find: '@cyc/3d-components/core', replacement: resolve(__dirname, '../3d-components/src/core/index.ts') },
      { find: '@cyc/3d-components/heat', replacement: resolve(__dirname, '../3d-components/src/heat/index.ts') },
      { find: '@cyc/3d-components/material', replacement: resolve(__dirname, '../3d-components/src/material/index.ts') },
      { find: '@cyc/3d-components/utils', replacement: resolve(__dirname, '../3d-components/src/utils/index.ts') },
      { find: '@cyc/3d-components', replacement: resolve(__dirname, '../3d-components/src/index.ts') },
    ],
    // 关键：3d-components 通过 alias 引入时，强制 three/gsap 等解析到 3d-templete 的单一实例，
    // 否则 3d-components 与 3d-templete 各拿一份 three → "Multiple instances of Three.js" 警告，
    // 且 instanceof 判断失效（不同实例的 Object3D 不互为 instanceof）。
    dedupe: ['three', 'gsap', 'three-bvh-csg', 'three-mesh-bvh'],
  },
  server: {
    host: '127.0.0.1', // 显式监听 IPv4，与 octoapp iframe src(127.0.0.1) 对齐；默认仅 ::1 会导致 127.0.0.1 连不上
    port: 5173,
    strictPort: true, // 端口被占直接报错，避免静默漂移导致 octoapp iframe src 对不上
    open: false,
    // 允许被 octoapp iframe 跨源嵌入（dev 用；生产 build 产物走 previewdist3d）
    cors: true,
    headers: {
      'X-Frame-Options': 'ALLOWALL',
    },
  },
}))
