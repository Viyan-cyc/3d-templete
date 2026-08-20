/**
 * modelHandler — 通用模型消费方（src='asset:' / 'hunyuan:' / 'http(s):'）
 *
 * 确定性 handler（非 LLM 代码化）：读 node.params.src，ctx.loadModel 取模型挂到 group。
 * cloneModel 在资源层已兜底（hunyuan 失败回落 low-poly），故此处总产出可渲染模型；
 * 异步加载，group 先返回再 add（与 exampleHandler 同模式）。
 * delete 跳过默认 dispose（几何 / 材质来自共享 AssetCache，dispose 会误伤其他实例）。
 */
import * as THREE from 'three';
import type { ComponentHandler, ComponentContext } from '../../ComponentManager';
import type { TreeNode } from '../../../../scene/loader';
import { toOptions } from '../base/options';

export const modelHandler: ComponentHandler = {
  create(node: TreeNode, ctx: ComponentContext) {
    const src = typeof node.params.src === 'string' ? node.params.src : undefined;
    if (!src) {
      console.warn('[modelHandler] 缺少 params.src，跳过', node.id);
      return null;
    }
    const opts = toOptions(node);
    const group = new THREE.Group();
    if (opts.position) {
      group.position.fromArray(opts.position);
    }
    if (opts.rotation) {
      group.rotation.fromArray(opts.rotation as [number, number, number]);
    }
    if (opts.scale) {
      group.scale.fromArray(opts.scale);
    }
    ctx.loadModel(src, { castShadow: opts.castShadow, receiveShadow: opts.receiveShadow })
      .then((m) => group.add(m))
      .catch((err) => console.error('[modelHandler] 模型加载失败', err));
    return group;
  },

  // 跳过默认 disposeObject：模型几何 / 材质来自共享 AssetCache（多实例共享），
  // dispose 会误伤其他实例；removeObjects 已先调 handler.delete 再 removeFromParent。
  delete() {
    return true;
  },
};
