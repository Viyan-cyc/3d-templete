/**
 * exampleHandler — 创建 ExampleComponent（1:1 对齐 components/exampleField/Example.ts）
 *
 * 资源创建在 handler：克隆 example.glb（asset:example）+ 取主题材质（copy('example')）。
 * 材质走 MaterialManager（模式B），setTheme 一键换肤原地改写同一实例（引用不变）。
 * model + material 都到位后通过 setResources(model, material) 传给组件（组件纯展示）。
 */
import type * as THREE from 'three';
import type { ComponentHandler } from '../../ComponentManager';
import type { LiveDataObject } from '../../../../scene/loader';
import { ExampleComponent } from '../../../../components/exampleField';
import { getResourceManager } from '../../../../resources';
import { toOptions } from '../base/options';

export const exampleHandler: ComponentHandler = {
  create(data: LiveDataObject) {
    const opts = toOptions(data);
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
    return true;
  },
};
