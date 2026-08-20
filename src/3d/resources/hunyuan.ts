/**
 * hunyuanGenerator — src='hunyuan:prompt' 的资源生成器
 *
 * dev：fetch /hunyuan/generate（vite dev server middleware 做 TC3 签名 + 提交 + 轮询 + 下载解压，
 *   密钥在 .env.local 不进前端 bundle、绕 CORS）；prod：直接走兜底
 *   （host desktop IPC 中转留后续 Step，本轮不做）。
 * 任意失败回落 lowPolyFallback（资源层兜底，链路总产出可渲染 GLB，不 throwing）。
 * 注意：ResourceManager 传入的 prompt 已 toLowerCase().trim()，关键词匹配小写化天然成立。
 */
import type { HunyuanGenerator } from './ResourceManager';
import { lowPolyGlbBytes } from './lowPolyFallback';

export const hunyuanGenerator: HunyuanGenerator = async (prompt) => {
  // prod：host IPC 中转未落地，直接兜底（TODO：接 desktop 主进程 fetch 中转）
  if (!import.meta.env.DEV) {
    return lowPolyGlbBytes(prompt);
  }
  try {
    const res = await fetch(`/hunyuan/generate?prompt=${encodeURIComponent(prompt)}`);
    if (!res.ok) {
      throw new Error(`hunyuan middleware ${res.status}`);
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error('hunyuan middleware empty body');
    }
    return { bytes };
  } catch (err) {
    console.warn('[hunyuan] 回落 low-poly 兜底', err);
    return lowPolyGlbBytes(prompt);
  }
};
