/**
 * ============================================================
 *  src/3d/models/registry.ts — 3D 模型资源注册表
 *
 *  通过 Vite 的 ?url import 将 .glb/.gltf 文件编译为静态资源 URL，
 *  供 liveDataLoader 中 type='glb' 的对象引用。
 *
 *  用法（live-data.json 中）：
 *    { "type": "glb", "src": "windmill", ... }
 *
 *  新增模型时：
 *    1. 把 .glb 文件放到 src/3d/models/ 目录下
 *    2. 在下方添加 import ... from './xxx.glb?url'
 *    3. 在 modelRegistry 中添加一条映射
 * ============================================================
 */

// ---- Vite ?url import：编译时生成带 hash 的资源 URL ----
import windmillUrl from './windmill.glb?url'

/**
 * 模型注册表：key 为 live-data.json 中可引用的名称，value 为编译后的 URL。
 *
 * liveDataLoader 在处理 type='glb' 的对象时，会查找此注册表：
 *   - src 以 'asset:' 开头 → 去掉前缀后在本表查找
 *   - 否则视为原始 URL 路径（如 '/models/xxx.glb'）
 */
export const modelRegistry: Record<string, string> = {
  windmill: windmillUrl,
}

/**
 * 解析模型 src 引用，返回可加载的 URL。
 *
 * @param src 模型标识，支持两种格式：
 *   - 'asset:windmill' → 从 modelRegistry 查找编译后的 URL
 *   - '/models/windmill.glb' 或 'https://...' → 原始 URL
 * @returns 可供 GLTFLoader.load() 使用的 URL 字符串
 */
export function resolveModelSrc(src: string): string {
  if (src.startsWith('asset:')) {
    const key = src.slice(6) // 'asset:windmill' → 'windmill'
    const url = modelRegistry[key]
    if (!url) {
      console.warn(
        `[models] 未注册的模型: "${key}"，可用: ${Object.keys(modelRegistry).join(', ')}`,
      )
      return src
    }
    return url
  }
  // 非 asset: 前缀，视为原始 URL
  return src
}
