import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export interface Css2dCardOptions {

  /** 相对锚点物体的偏移，默认 [0,0,0] */
  offset?: [number, number, number];

  /** 追加到 domEl 的 class（如 'card-3d card-type-example'） */
  className?: string;
}

/**
 * CSS2D 卡片组件：把 DOM 钉到 3D 物体，随其世界坐标投影到屏幕。继承 CSS2DObject
 * （Object3D 子类），add 到锚点物体即可；渲染由 createScene3D 持有的
 * CSS2DRenderer.render(scene) 统一遍历。供 CardManager 卡片 + handler 命令式弹 DOM
 * 共用，替代原 AnchorService.createAnchor。
 *
 * 不走 creationChain/handler 链（不像 PrimitiveComponent 等接 ComponentOptions），
 * 是独立的 DOM 锚点工具组件，故类名不带 Component 后缀。
 */
export class Css2dCard extends CSS2DObject {
  readonly domEl: HTMLElement;

  constructor(domEl: HTMLElement, options: Css2dCardOptions = {}) {
    super(domEl);
    this.domEl = domEl;
    const { offset = [0, 0, 0], className } = options;
    this.position.set(offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0);
    if (className) {
      domEl.classList.add(...className.split(/\s+/).filter(Boolean));
    }
  }
}
