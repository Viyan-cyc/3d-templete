import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { App3D } from "./App3D";
import { CardManager } from "./managers/card/CardManager";
import { createOrbitControls } from "./controls/OrbitControls";
import {
  applyLiveDataToApp,
  loadModelObjects
} from "./utils/liveDataLoader";
import {
  removeObjects,
  upsertObjects
} from "./utils/sceneUpdate";
import { ScenePicker } from "./interaction/picker";
import { registerComponentHandlers, disposeComponentHandlers } from "./managers";
function readDebugFromURL() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const val = params.get("debug");
  return val === "true" || val === "1";
}
async function createScene3D(canvas, data, options = {}) {
  const { cardRules, controls: controlsOpts, enableShadows = true, interactive = false, preset } = options;
  const container = options.container ?? canvas.parentElement ?? document.body;
  const debug = readDebugFromURL() || options.debug || false;
  registerComponentHandlers();
  const app = new App3D({ canvas, enableShadows, antialias: true, debug });
  const width = canvas.clientWidth || container.clientWidth || 1;
  const height = canvas.clientHeight || container.clientHeight || 1;
  const objectIndex = applyLiveDataToApp(app, data, {
    viewSize: { width, height },
    preset
  });
  applyEnvironment(app, data);
  const controls = createOrbitControls(app.camera, canvas, controlsOpts);
  const cardManager = new CardManager({ container, camera: app.camera, canvas });
  cardManager.scanAndRegisterCards(app.scene, cardRules ?? []);
  app.addUpdateCallback(() => controls.update());
  app.addPostRenderCallback(() => cardManager.render(app.scene, app.camera));
  app.start();
  const resizeObserver = new ResizeObserver(() => {
    cardManager.resize(container.offsetWidth, container.offsetHeight);
  });
  resizeObserver.observe(container);
  loadModelObjects(objectIndex, data.objects).catch((err) => {
    console.error("[createScene3D] \u6A21\u578B\u52A0\u8F7D\u5931\u8D25:", err);
  });
  const updatables = [];
  app.scene.traverse((obj) => {
    if (obj.userData?.__updatable) updatables.push(obj);
  });
  if (updatables.length > 0) {
    let lastTime = performance.now();
    app.addUpdateCallback(() => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1e3, 0.1);
      lastTime = now;
      for (const obj of updatables) {
        ;
        obj.update?.(delta);
      }
    });
  }
  let picker;
  let flyTo;
  let setTheme;
  let resetCamera;
  if (interactive) {
    const initialPosition = app.camera.position.clone();
    const lookAt = data.camera?.lookAt;
    const initialTarget = Array.isArray(lookAt) && lookAt.length >= 3 ? new THREE.Vector3(Number(lookAt[0]), Number(lookAt[1]), Number(lookAt[2])) : controls.target.clone();
    picker = new ScenePicker(app.scene, app.camera, canvas);
    app.addUpdateCallback(() => picker.update());
    flyTo = (targetId) => {
      let target = null;
      app.scene.traverse((o) => {
        if (!target && o.userData?.__id === targetId) target = o;
      });
      if (!target) return;
      const box = new THREE.Box3().setFromObject(target);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim * 2.2 + 1;
      controls.target.copy(center);
      const dir = new THREE.Vector3().subVectors(app.camera.position, controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.8, 1);
      dir.normalize();
      app.camera.position.copy(center).addScaledVector(dir, dist);
      controls.update();
    };
    setTheme = (mode) => {
      app.scene.background = new THREE.Color(mode === "dark" ? "#1a1a2e" : "#c9ccd6");
    };
    resetCamera = () => {
      app.camera.position.copy(initialPosition);
      controls.target.copy(initialTarget);
      app.camera.lookAt(initialTarget);
      controls.update();
    };
  }
  let disposed = false;
  return {
    app,
    cardManager,
    controls,
    onCardState: (cb) => cardManager.onStateChange(cb),
    update(patch) {
      const changed = [];
      if (patch.objects?.remove?.length) {
        changed.push(...removeObjects(app.scene, objectIndex, patch.objects.remove));
      }
      if (patch.objects?.upsert?.length) {
        changed.push(...upsertObjects(app.scene, objectIndex, patch.objects.upsert));
      }
      cardManager.refreshCards(app.scene, cardRules ?? [], changed);
    },
    setDebug(mode) {
      app.setDebug(mode);
    },
    picker,
    flyTo,
    setTheme,
    resetCamera,
    dispose() {
      if (disposed) return;
      disposed = true;
      picker?.dispose();
      resizeObserver.disconnect();
      controls.dispose();
      cardManager.dispose();
      disposeComponentHandlers();
      app.dispose();
    }
  };
}
function applyEnvironment(app, config) {
  const env = config.scene?.environment;
  const pmrem = new THREE.PMREMGenerator(app.renderer);
  const intensity = env?.intensity;
  app.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if (intensity !== void 0) {
    app.scene.environmentIntensity = intensity;
  }
  pmrem.dispose();
}
export {
  createScene3D
};
