/**
 * exampleHandler — 创建 ExampleComponent（1:1 对齐 components/exampleField/Example.ts）
 *
 * 资源创建在 handler：克隆 example.glb（asset:example）+ 取主题材质（copy('example')）。
 * 材质走 MaterialManager（模式B），setTheme 一键换肤原地改写同一实例（引用不变）。
 * model + material 都到位后通过 setResources(model, material) 传给组件（组件纯展示）。
 *
 * 树原生契约：node = { type:'example', id, params:{position,rotation,scale}, parentId:null }。
 */
import type * as THREE from 'three';
import type { ComponentHandler, ComponentContext } from '../../ComponentManager';
import type { TreeNode } from '../../../../scene/loader';
import { ExampleComponent } from '../../../../components/exampleField';
import { getResourceManager } from '../../../../resources';
import { toOptions } from '../base/options';

export const exampleHandler: ComponentHandler = {
  create(node: TreeNode, ctx: ComponentContext) {
    const opts = toOptions(node);
    const comp = new ExampleComponent(opts);
    const res = getResourceManager();

    let material: THREE.Material | null = null;
    let model: THREE.Object3D | null = null;
    let assembled = false;
    const assemble = (): void => {
      if (assembled || !material || !model) {
        return;
      }
      assembled = true;
      comp.setResources(model, material);
    };

    // 模式B 主题材质（对齐 MaterialManager，开发者按需二选一）：
    //   res.copy('example', cb)           共享：多实例共用同一材质，setTheme 换肤联动（本例默认）
    //   res.clone('example', cb)          独立：各实例材质互不影响（改色不串）
    //   res.clone('example', cb, false)   独立 + 独立贴图（可各自 repeat/offset）
    //   key 换 'exampleFlat' 即纯色无贴图（registerMaterials 注册的另一材质）
    comp.userData.unsub = res.copy('example', (mat) => {
      material = mat;
      assemble();
    });

    // 模型克隆（AssetCache.cloneModel）：默认全共享（几何/材质/贴图，最省内存）；
    // 需独立资源传 clone，如 { clone: { shareMaterial: false } }（本例材质由上方替换，故默认）
    res.cloneModel('asset:example', {
      castShadow: opts.castShadow,
      receiveShadow: opts.receiveShadow,
    })
      .then((m) => {
        model = m;

        // 卡片（声明式，走 CardManager，同 tree/building 一套机制）：addCard 注册后，点击 m 由
        // cardManager 的 scene 订阅自动 toggle 显隐（沿父链找 entry），点空白 hideAll、点其他同组
        // 物体互斥消失（interactiveGroup:'scene'）。卡片内容由适配层注册的 ExampleCard.vue 经
        // CardHost Teleport 进 domEl 渲染，props 透传给组件；delete 时 removeCard 同步清理。
        const cardManager = ctx.shared.cardManager;
        cardManager?.addCard(node.id, 'example', m, {
          mode: 'click',
          interactiveGroup: 'scene',
          offset: [0, 1.5, 0],
          props: {
            label: node.id,
            type: node.type,
            position: node.params.position,
          },
        });

        // 命令式交互绑定（与卡片独立）：绑在 model 这一层，子 mesh 命中冒泡到 model 消费。
        // 卡片显隐已由上方 cardManager 声明式管理，此处 onClick 留空——可写额外逻辑（flyTo/切换状态…）。
        // 支持 InteractiveManager 全部事件：onClick/onDoubleClick/onPointerDown/Up/Move/Over/Out/Enter/
        // Leave/onWheel/onContextMenu…（按需声明，未声明不监听）。
        const manager = ctx.shared.interactiveManager;
        const subId = `example:${node.id}`;
        manager?.add(m, {
          onClick: () => {
            // 卡片显隐由 cardManager 自动 toggle；此处可写其它点击逻辑（如 cameraRig.flyTo 聚焦）
          },
        }, subId);

        comp.userData.__pointerUnsub = () => {
          manager?.remove(m, subId);
          cardManager?.removeCard(node.id);
        };

        assemble();
      })
      .catch((err) => {
        console.error('[exampleHandler] 模型加载失败', err);
      });

    return comp;
  },

  // 跳过默认 disposeObject：其会 dispose 子孙 mesh 的材质 / 几何，
  // 但 example 的材质是 MaterialManager 共享实例、几何来自 AssetCache 克隆（均共享），
  // dispose 会误伤其他实例。此处仅取消主题材质订阅（共享材质 / 贴图归 Manager，不 dispose）。
  delete(obj: THREE.Object3D): boolean {
    const unsub = obj.userData.unsub as (() => void) | undefined;
    unsub?.();
    // 注销命令式交互订阅（removeObjects 先调 handler.delete 再 removeFromParent，此时 model 仍在 registry）。
    const pointerUnsub = obj.userData.__pointerUnsub as (() => void) | undefined;
    pointerUnsub?.();
    // 卡片由 __pointerUnsub 内 cardManager.removeCard 同步移除（example 不走 cardRules，handler 自管）。
    return true;
  },
};
