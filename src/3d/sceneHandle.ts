/**
 * ============================================================
 *  sceneHandle — core handle 组装（C4 后仅 core 职责）
 *
 *  createHandle（Scene3DHandle 对象字面量组装）/ disposeHandle（按序释放）。
 *  编辑 helper 已搬 editBridge/sceneEdit.ts；编辑方法挂载见 editBridge/editHandle.ts
 *  （attachEditBridge 在 core handle 上包一层 EditSceneHandle）。
 * ============================================================
 */
import type { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { App3D } from './App3D';
import type { CardManager } from './managers/card/CardManager';
import type { CardScanRule } from './managers/card/types';
import type { ControlsManager } from './managers/app/ControlsManager';
import {
  updateTreeScene, updateEnvironment, type ObjectIndex, type TreeScene, type EnvUpdate,
} from './scene';
import type { CameraRig } from './interaction/CameraRig';
import type { InteractiveManager } from '@a3d/a3d-components/interactive';
import { disposeComponentHandlers } from './managers';
import { sharedState } from './managers/component/handlers/base/shared';
import type { OrbitControlsInstance, Scene3DHandle } from './createScene3D';

/** handle.dispose 实现：按序释放 GPU/DOM/事件资源（幂等由 state.disposed 标志保证） */
export const disposeHandle = (
  state: { disposed: boolean },
  deps: {
    interactiveManager: InteractiveManager
    resizeObserver: ResizeObserver
    controls: OrbitControlsInstance
    cardManager: CardManager
    css2DRenderer: CSS2DRenderer
    app: App3D
  },
): void => {
  if (state.disposed) {
    return;
  }
  state.disposed = true;
  deps.interactiveManager.dispose();
  deps.resizeObserver.disconnect();
  deps.controls.dispose();
  deps.cardManager.dispose();
  deps.css2DRenderer.domElement.remove();
  disposeComponentHandlers();
  deps.app.dispose();
};

/** 组装对外 handle（update / dispose 等方法闭包） */
export const createHandle = (params: {
  app: App3D
  cardManager: CardManager
  css2DRenderer: CSS2DRenderer
  controls: OrbitControlsInstance
  controlsManager: ControlsManager
  objectIndex: ObjectIndex
  cardRules: CardScanRule[] | undefined
  resizeObserver: ResizeObserver
  source: unknown
  interactiveManager: InteractiveManager
  cameraRig: CameraRig
}): Scene3DHandle => {
  const {
    app, cardManager, css2DRenderer, controls, controlsManager, objectIndex, cardRules,
    resizeObserver, interactiveManager, cameraRig,
  } = params;
  const disposedState = { disposed: false };
  let source = params.source;

  return {
    app,
    cardManager,
    controls,
    interactiveManager,
    get source() {
      return source;
    },
    onCardState: (cb) => cardManager.onStateChange(cb),
    update(tree: TreeScene, sourceData?: unknown): void {
      if (sourceData !== undefined) {
        source = sourceData;
        sharedState.source = sourceData;
      }
      const changed = updateTreeScene(app.scene, objectIndex, tree);
      cardManager.refreshCards(app.scene, cardRules ?? [], changed);
    },
    setDebug(mode: boolean): void {
      app.setDebug(mode);
    },
    cameraRig,
    flyTo: (targetId: string) => cameraRig.flyTo(targetId),
    setTheme: (mode: 'light' | 'dark') => cameraRig.setTheme(mode),
    resetCamera: () => cameraRig.resetCamera(),
    updateEnvironment: (env: EnvUpdate) => {
      const width = app.canvas.clientWidth || 1;
      const height = app.canvas.clientHeight || 1;
      updateEnvironment(app, env, { width, height }, controlsManager);
    },
    dispose(): void {
      disposeHandle(disposedState, {
        interactiveManager,
        resizeObserver,
        controls,
        cardManager,
        css2DRenderer,
        app,
      });
    },
  };
};
