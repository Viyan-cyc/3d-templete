/**
 * options — TreeNode → ComponentOptions 翻译（handler 层通用）
 *
 * handler 拿到 node 后可先 toOptions，再 new XxxComponent(opts)。
 * position/rotation/scale 从 node.params 取（兼容 {x,y,z} 与 [x,y,z]，经 toVec 归一为数组）。
 */
import type { TreeNode } from '../../../../scene/loader';
import type { ComponentOptions } from '../../../../components/base/types';
import { toVec } from '../../../../scene/utils';

export const toOptions = (node: TreeNode): ComponentOptions => ({
  id: node.id,
  params: node.params,
  position: toVec(node.params.position),
  rotation: toVec(node.params.rotation),
  scale: toVec(node.params.scale),
  castShadow: node.params.castShadow as boolean | undefined,
  receiveShadow: node.params.receiveShadow as boolean | undefined,
});
