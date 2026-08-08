/**
 * registerModels — 模式B 静态资源注册（模型 + 贴图）
 *
 * 静态资源（key → url，Vite ?url 编译带 hash）在此注册；数据 / handler 里用
 *   src='asset:example'  或  ctx.shared.resources.cloneModel('example')
 *   ctx.shared.resources.loadTexture(key)
 * 引用。混元（按需生成）走 setHunyuanGenerator，src='hunyuan:prompt' 触发。
 *
 * 新增静态资源：把 .glb/.gltf 放到 src/3d/assets/models/、贴图放到 src/3d/assets/textures/，
 * import '?url'，分别加进 modelRegistry / textureRegistry。
 */
import exampleUrl from '../assets/models/example.glb?url';
import { getResourceManager } from './ResourceManager';

/** 模型注册表：key → 资源 URL（静态文件，Vite 编译后带 hash）。 */
const modelRegistry: Record<string, string> = {
  example: exampleUrl,
  // car: '/model/car.glb',
  // person: '/model/person.gltf',
};

/**
 * 贴图注册表：key → 资源 URL。组件用 loadTexture(key) 取独立贴图。
 * 注：example.jpg 走主题材质（registerMaterials.ts 的 map:{url}），不在此按 key 注册。
 */
const textureRegistry: Record<string, string> = {};

/**
 * 混元生成器（占位：未接入，抛错回落 mesh 兜底，与旧 hunyuan.ts 行为一致）。
 * 后续接入：实现真实混元调用，返回 { bytes } 或 { src }。
 */
const hunyuanGenerator = async (prompt: string): Promise<{ bytes?: ArrayBuffer; src?: string }> => {
  // TODO: 接入真实混元 API
  //   const res = await fetch('https://hunyuan.../generate', { body: JSON.stringify({ prompt }) })
  //   return { bytes: await res.arrayBuffer() }
  console.warn(`[resources] 混元未接入（占位），prompt="${prompt}"，将回落 mesh 兜底`);
  throw new Error('HUNYUAN_NOT_IMPLEMENTED');
};

/** 注册所有静态模型 + 贴图 + 混元生成器（幂等）。在 createScene3D step0 调用。 */
export const registerModels = (): void => {
  const r = getResourceManager();
  for (const [key, url] of Object.entries(modelRegistry)) {
    r.registerModel(key, url);
  }
  for (const [key, url] of Object.entries(textureRegistry)) {
    r.registerTexture(key, url);
  }
  r.setHunyuanGenerator(hunyuanGenerator);
};
