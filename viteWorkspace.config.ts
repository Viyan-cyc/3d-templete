/**
 * viteWorkspace.config — workspace 副本专用 vite 配置（UXAI materialize 原样拷进 workspace，
 * desktop 主进程 start-workspace-dev 以 --config viteWorkspace.config.ts 启动）。
 *
 * 与母版 vite.config.ts 只多两个插件，目标一致：重载由宿主单一控制（P0.1-1 闪烁根治）。
 * - suppressHotUpdate：hotUpdate 钩子返回 []。vite 8 链路：文件失效（moduleGraph.onFileChange）在
 *   钩子前无条件跑，插件把 modules 置空后 hmr() 的 `!options.modules.length` guard 直接 return
 *   （非 .html 只打 debug 日志），不进 updateModules、不发 HMR/full-reload。多文件 overlay 被 chokidar
 *   分散成 N 次变更，原本每次都推 full-reload 与宿主 reload 竞跑叠加（「闪 5-6 次」根因），本插件全掐掉。
 * - touchEndpoint：POST /_octo/touch → 各环境 moduleGraph.invalidateAll()。宿主 overlay 落盘后先
 *   touch 再 reload，下次请求必拿新 transform，不赌 chokidar 事件时序（reload 早于失效 → etag 缓存旧代码）。
 * 母版 dev（5173 直跑）不用本文件，行为不变。
 */
import { mergeConfig, type Plugin } from 'vite';
import baseConfig from './vite.config.ts';

const suppressHotUpdate = (): Plugin => ({
  name: 'octo-suppress-hot-update',
  hotUpdate() {
    return [];
  },
});

const touchEndpoint = (): Plugin => ({
  name: 'octo-touch-endpoint',
  configureServer(server) {
    server.middlewares.use('/_octo/touch', (_req, res) => {
      for (const env of Object.values(server.environments)) {
        env.moduleGraph.invalidateAll();
      }
      res.statusCode = 204;
      res.end();
    });
  },
});

export default mergeConfig(baseConfig, {
  plugins: [suppressHotUpdate(), touchEndpoint()],
});
