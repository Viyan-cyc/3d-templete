/**
 * components — 组件层入口
 *
 * 结构（三种组件来源都在此）：
 *   base/              本地通用底座（工具 + 通用组件 Primitive/Text/Model，无业务属性）
 *   exampleField/      本地垂域组件（源码：示例，如 example）
 *   libraryBridge.ts  npm 组件桥（@cyc/3d-components 的 Wall/Grid/HeatMesh… 按名引入）
 *   AssetPool.ts       Geometry/Material 缓存
 *
 * 所有内置类组件由 handler 直接 new；npm 组件走 createComponentObject；无需注册表。
 */

export { AssetPool } from './AssetPool';

// ---- 本地通用底座（base）----
export * from './base';

// ---- npm 组件桥（libraryBridge）----
import {
  initLibraryBridge, hasComponent, resolveComponent, createComponentObject,
} from './libraryBridge';
export {
  hasComponent, resolveComponent, createComponentObject, initLibraryBridge,
};

/**
 * 注册类组件所需的底层初始化：3d-components 桥（Wall/Grid…）。幂等。
 * 所有内置类组件由 handler 直接 new；library 走 createComponentObject（依赖 initLibraryBridge）。
 */
export const registerAllComponents = (): void => {
  initLibraryBridge();
};
