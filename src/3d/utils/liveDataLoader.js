import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { ComponentRegistry, AssetPool, registerAllBuilders } from "../components";
import { loadModel } from "../models/loader";
import { hasComponent, createComponentObject, initLibraryBridge } from "../library/library-bridge";
registerAllBuilders();
initLibraryBridge();
const assetPool = new AssetPool();
const DEG2RAD = Math.PI / 180;
const FONT_URL = "/fonts/helvetiker_regular.typeface.json";
let fontCache = null;
let fontPromise;
async function ensureFont() {
  if (fontCache || fontPromise) return;
  const loader = new FontLoader();
  fontPromise = loader.loadAsync(FONT_URL).then((f) => {
    fontCache = f;
  }).catch(() => null);
  await fontPromise;
}
async function loadLiveDataConfig(defaultFile = "live-data.json") {
  const params = new URLSearchParams(window.location.search);
  const fetchParam = params.get("fetch");
  const url = fetchParam ? /^https?:\/\//.test(fetchParam) ? fetchParam : `/${fetchParam}` : `/${defaultFile}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`\u573A\u666F\u914D\u7F6E\u52A0\u8F7D\u5931\u8D25: ${res.status} ${url}`);
  const config = await res.json();
  console.dir(config, { depth: null });
  return config;
}
function applyLiveDataToApp(app, config, options) {
  const { viewSize } = options;
  if (config.scene.background) {
    app.scene.background = new THREE.Color(config.scene.background);
  }
  if (config.scene.fog && config.scene.fog.type === "linear") {
    const f = config.scene.fog;
    app.scene.fog = new THREE.Fog(f.color, f.near, f.far);
  }
  if (!options.keepExisting) {
    while (app.scene.children.length > 0) {
      app.scene.remove(app.scene.children[0]);
    }
  }
  const camCfg = config.camera;
  const aspect = viewSize.width / Math.max(viewSize.height, 1);
  let newCamera;
  if (camCfg.type === "orthographic" && camCfg.orthographic) {
    const o = camCfg.orthographic;
    const halfH = Math.max(Math.abs(o.top), Math.abs(o.bottom));
    const halfW = halfH * aspect;
    newCamera = new THREE.OrthographicCamera(-halfW, halfW, o.top, o.bottom, o.near, o.far);
    if (o.zoom) newCamera.zoom = o.zoom;
  } else {
    const p = camCfg.perspective ?? { fov: 50, near: 0.1, far: 100 };
    newCamera = new THREE.PerspectiveCamera(p.fov, aspect, p.near, p.far);
  }
  newCamera.position.set(
    ...camCfg.position.slice(0, 3)
  );
  newCamera.lookAt(...camCfg.lookAt.slice(0, 3));
  newCamera.updateProjectionMatrix();
  app.setCamera(newCamera);
  if (config.lights) {
    for (const lc of config.lights) {
      const light = createLiveLight(lc);
      if (light) app.scene.add(light);
    }
  }
  const nodeMap = /* @__PURE__ */ new Map();
  let createdCount = 0;
  let skippedCount = 0;
  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "true";
  if (config.objects) {
    for (const oc of config.objects) {
      const node = createLiveObject3D(oc);
      if (node) {
        createdCount++;
        nodeMap.set(oc.id, node);
        if (oc.type === "component") {
          node.traverse((child) => {
            if (child.userData?.id && child !== node) {
              nodeMap.set(child.userData.id, child);
            }
          });
        }
      } else {
        skippedCount++;
        console.warn(
          `[liveDataLoader] \u65E0\u6CD5\u521B\u5EFA\u7269\u4F53\uFF0C\u8DF3\u8FC7: id=${oc.id} type=${oc.type} component.name=${oc.component?.name} component.type=${oc.component?.type} src=${oc.src ?? "-"} geometry=${oc.geometry?.type ?? "-"}`
        );
      }
    }
    for (const oc of config.objects) {
      const node = nodeMap.get(oc.id);
      if (!node) continue;
      if (oc.parentId) {
        const parent = nodeMap.get(oc.parentId);
        if (parent) {
          parent.add(node);
        } else {
          app.scene.add(node);
        }
      } else {
        app.scene.add(node);
      }
    }
    {
      const rootIds = /* @__PURE__ */ new Set();
      for (const o of config.objects) if (!o.parentId) rootIds.add(o.id);
      const zoneIds = /* @__PURE__ */ new Set();
      for (const o of config.objects) if (o.__zone) zoneIds.add(o.id);
      if (zoneIds.size === 0) {
        for (const o of config.objects) if (o.parentId && rootIds.has(o.parentId)) zoneIds.add(o.id);
      }
      for (const id of zoneIds) {
        const n = nodeMap.get(id);
        if (n) n.userData.__zone = true;
      }
      for (const o of config.objects) {
        if (o.parentId && zoneIds.has(o.parentId) && !zoneIds.has(o.id)) {
          const n = nodeMap.get(o.id);
          if (n) n.userData.__logicalRoot = true;
        }
      }
    }
    if (debug) {
      console.log(
        `[liveDataLoader] \u573A\u666F\u6784\u5EFA\u5B8C\u6210: \u521B\u5EFA ${createdCount}/${config.objects.length} \u7269\u4F53` + (skippedCount > 0 ? `\uFF0C\u8DF3\u8FC7 ${skippedCount} \u4E2A\uFF08\u89C1\u4E0A\u65B9 warn\uFF09` : "")
      );
    }
  }
  return nodeMap;
}
function createLiveObject3D(cfg) {
  let obj = null;
  if (cfg.component?.name && hasComponent(cfg.component.name)) {
    obj = createComponentObject(cfg.component.name, cfg.component.options ?? {});
    if (obj) {
      obj.name = cfg.id;
      applyTransform(obj, cfg);
      if (cfg.castShadow) obj.castShadow = true;
      if (cfg.receiveShadow) obj.receiveShadow = true;
    }
  }
  if (!obj && cfg.component?.type) {
    obj = createLiveComponent(cfg);
  }
  if (!obj && cfg.src) {
    obj = createModelPlaceholder(cfg);
  }
  if (!obj && (cfg.geometry || cfg.type === "mesh")) {
    obj = createLiveMesh(cfg);
  }
  if (!obj && cfg.type === "group") {
    obj = new THREE.Group();
    obj.name = cfg.id;
    applyTransform(obj, cfg);
  }
  if (obj && cfg.id) {
    obj.userData.__id = cfg.id;
  }
  if (obj) {
    const componentType = cfg.component?.name ?? cfg.component?.type ?? null;
    if (componentType) {
      obj.userData.__componentType = componentType;
    }
  }
  return obj;
}
function createLiveComponent(cfg) {
  const compDef = cfg.component;
  if (!compDef) return null;
  const compType = compDef.type;
  const compParams = compDef.params ?? {};
  const mat = createLiveMaterial(cfg.material);
  const group = ComponentRegistry.createByBuilder(compType, compParams, mat, assetPool);
  if (!group) return null;
  const prefix = cfg.id;
  for (const child of group.children) {
    child.userData.id = `${prefix}_${child.name}`;
  }
  group.name = cfg.id;
  applyTransform(group, cfg);
  return group;
}
function createModelPlaceholder(cfg) {
  const group = new THREE.Group();
  group.name = cfg.id;
  group.userData.__modelSrc = cfg.src ?? "";
  group.userData.__modelId = cfg.id;
  applyTransform(group, cfg);
  if (cfg.castShadow) group.castShadow = true;
  if (cfg.receiveShadow) group.receiveShadow = true;
  return group;
}
async function loadModelObjects(nodeMap, objects, onError) {
  if (!objects) return /* @__PURE__ */ new Map();
  const modelDefs = objects.filter((o) => o.src);
  if (modelDefs.length === 0) return /* @__PURE__ */ new Map();
  const loaded = /* @__PURE__ */ new Map();
  const tasks = modelDefs.map(async (def) => {
    const src = def.src;
    const placeholder = nodeMap.get(def.id);
    if (!placeholder) return;
    try {
      const model = await loadModel(src, {
        castShadow: def.castShadow,
        receiveShadow: def.receiveShadow
      });
      placeholder.add(model);
      delete placeholder.userData.__modelSrc;
      delete placeholder.userData.__modelId;
      model.traverse((child) => {
        if (child !== model && child.name) {
          child.userData.id = `${def.id}_${child.name}`;
          nodeMap.set(child.userData.id, child);
        }
      });
      loaded.set(def.id, placeholder);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[liveDataLoader] \u6A21\u578B\u52A0\u8F7D\u5931\u8D25: ${src} (${def.id})`, msg);
      const fallbackGeo = new THREE.BoxGeometry(1, 1, 1);
      const fallbackMat = new THREE.MeshStandardMaterial({ color: 16729156 });
      const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
      fallback.name = `${def.id}_fallback`;
      placeholder.add(fallback);
      delete placeholder.userData.__modelSrc;
      delete placeholder.userData.__modelId;
      onError?.(def.id, `\u6A21\u578B\u52A0\u8F7D\u5931\u8D25 ${src}: ${msg}`);
      loaded.set(def.id, placeholder);
    }
  });
  await Promise.all(tasks);
  return loaded;
}
async function loadGlbObjects(_scene, nodeMap, objects, onError) {
  return loadModelObjects(nodeMap, objects, onError);
}
function createLiveMesh(cfg) {
  const geoDef = cfg.geometry;
  if (!geoDef) return null;
  if (geoDef.type === "text") {
    return createLiveTextMesh(cfg);
  }
  const geo = createLiveGeometry(geoDef);
  if (!geo) return null;
  const mat = createLiveMaterial(cfg.material);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = cfg.id;
  applyTransform(mesh, cfg);
  if (cfg.castShadow) mesh.castShadow = true;
  if (cfg.receiveShadow) mesh.receiveShadow = true;
  return mesh;
}
function createLiveTextMesh(cfg) {
  const tp = cfg.geometry?.params ?? {};
  const text = String(tp.text ?? "Text");
  const size = Number(tp.size) > 0 ? Number(tp.size) : 1;
  const isAscii = /^[\x00-\x7F]*$/.test(text);
  let geo;
  let mat;
  if (isAscii && fontCache) {
    geo = new TextGeometry(text, {
      font: fontCache,
      size,
      depth: Number(tp.depth) > 0 ? Number(tp.depth) : 0.2,
      curveSegments: 6,
      bevelEnabled: false
    });
    mat = createLiveMaterial(cfg.material);
  } else {
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    const fs = 128;
    ctx.font = `bold ${fs}px sans-serif`;
    const m = ctx.measureText(text);
    cv.width = Math.ceil(m.width) + 32;
    cv.height = fs + 32;
    ctx.font = `bold ${fs}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cv.width / 2, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    geo = new THREE.PlaneGeometry(size * (cv.width / cv.height), size);
    const matColor = cfg.material?.color ?? "#ffffff";
    mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      color: new THREE.Color(matColor),
      side: THREE.DoubleSide
    });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = cfg.id;
  applyTransform(mesh, cfg);
  if (cfg.castShadow) mesh.castShadow = true;
  if (cfg.receiveShadow) mesh.receiveShadow = true;
  return mesh;
}
function createLiveGeometry(geoDef) {
  const p = geoDef.params ?? {};
  switch (geoDef.type) {
    case "box":
      return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1);
    case "plane":
      return new THREE.PlaneGeometry(p.width ?? 1, p.height ?? 1);
    case "sphere":
      return new THREE.SphereGeometry(
        p.radius ?? 1,
        p.widthSegments ?? 32,
        p.heightSegments ?? 16
      );
    case "cylinder":
      return new THREE.CylinderGeometry(
        p.radiusTop ?? 1,
        p.radiusBottom ?? 1,
        p.height ?? 1,
        p.radialSegments ?? 32
      );
    case "cone":
      return new THREE.ConeGeometry(
        p.radius ?? 1,
        p.height ?? 1,
        p.radialSegments ?? 16
      );
    case "torus": {
      const inner = p.innerRadius ?? 1;
      const outer = p.outerRadius ?? 2;
      const radius = (inner + outer) / 2;
      const tube = (outer - inner) / 2;
      return new THREE.TorusGeometry(
        radius,
        tube,
        p.radialSegments ?? 12,
        p.thetaSegments ?? 64,
        p.arc ?? Math.PI * 2
      );
    }
    case "circle":
      return new THREE.CircleGeometry(p.radius ?? 1, p.segments ?? 32);
    case "ring":
      return new THREE.RingGeometry(
        p.innerRadius ?? 0.5,
        p.outerRadius ?? 1,
        p.thetaSegments ?? 64,
        p.phiSegments ?? 1
      );
    default:
      console.warn(`[liveDataLoader] \u672A\u77E5\u51E0\u4F55\u4F53\u7C7B\u578B: ${geoDef.type}`);
      return null;
  }
}
function materialKey(matDef) {
  const parts = [matDef.type, matDef.color ?? "#fff", String(matDef.roughness ?? ""), String(matDef.metalness ?? "")];
  if (matDef.transmission !== void 0) parts.push(`tm:${matDef.transmission}`);
  if (matDef.clearcoat !== void 0) parts.push(`cc:${matDef.clearcoat}`);
  if (matDef.ior !== void 0) parts.push(`ior:${matDef.ior}`);
  if (matDef.transparent) parts.push("tr");
  if (matDef.opacity !== void 0) parts.push(`op:${matDef.opacity}`);
  return parts.join("|");
}
function createLiveMaterial(matDef) {
  if (!matDef) return new THREE.MeshNormalMaterial();
  const key = materialKey(matDef);
  return assetPool.getMaterial(key, () => createLiveMaterialInner(matDef));
}
function createLiveMaterialInner(matDef) {
  const type = matDef.type;
  let mat;
  switch (type) {
    case "standard":
      mat = new THREE.MeshStandardMaterial({
        color: matDef.color ?? "#ffffff",
        roughness: matDef.roughness ?? 0.5,
        metalness: matDef.metalness ?? 0
      });
      break;
    case "phong":
      mat = new THREE.MeshPhongMaterial({
        color: matDef.color ?? "#ffffff"
      });
      break;
    case "basic":
      mat = new THREE.MeshBasicMaterial({
        color: matDef.color ?? "#ffffff"
      });
      break;
    case "physical": {
      mat = new THREE.MeshPhysicalMaterial({
        color: matDef.color ?? "#ffffff",
        roughness: matDef.roughness ?? 0.5,
        metalness: matDef.metalness ?? 0
      });
      const pm = mat;
      if (matDef.transmission !== void 0) pm.transmission = matDef.transmission;
      if (matDef.thickness !== void 0) pm.thickness = matDef.thickness;
      if (matDef.ior !== void 0) pm.ior = matDef.ior;
      if (matDef.clearcoat !== void 0) pm.clearcoat = matDef.clearcoat;
      if (matDef.clearcoatRoughness !== void 0) pm.clearcoatRoughness = matDef.clearcoatRoughness;
      if (matDef.sheen !== void 0) pm.sheen = matDef.sheen;
      if (matDef.sheenColor !== void 0) pm.sheenColor = new THREE.Color(matDef.sheenColor);
      break;
    }
    default:
      return new THREE.MeshNormalMaterial();
  }
  if (matDef.transparent) {
    mat.transparent = true;
    if (matDef.opacity !== void 0) mat.opacity = matDef.opacity;
  }
  return mat;
}
function createLiveLight(cfg) {
  const color = cfg.color;
  const intensity = cfg.intensity ?? 1;
  const pos = parseVec3(cfg.position);
  switch (cfg.type) {
    case "ambient":
      return new THREE.AmbientLight(color ?? "#ffffff", intensity);
    case "hemisphere": {
      const sky = cfg.skyColor ?? cfg.color ?? color ?? "#ffffff";
      const ground = cfg.groundColor ?? "#222222";
      const light = new THREE.HemisphereLight(sky, ground, intensity);
      if (pos) light.position.set(...pos);
      return light;
    }
    case "directional": {
      const light = new THREE.DirectionalLight(color ?? "#ffffff", intensity);
      if (pos) light.position.set(...pos);
      const target = parseVec3(cfg.target);
      if (target) light.target.position.set(...target);
      if (cfg.castShadow) {
        light.castShadow = true;
        const shadow = cfg.shadow;
        if (shadow) {
          if (shadow.mapSize) {
            light.shadow.mapSize.width = shadow.mapSize;
            light.shadow.mapSize.height = shadow.mapSize;
          }
          const sc = shadow.camera;
          if (sc) {
            light.shadow.camera.near = sc.near;
            light.shadow.camera.far = sc.far;
            light.shadow.camera.left = sc.left;
            light.shadow.camera.right = sc.right;
            light.shadow.camera.top = sc.top;
            light.shadow.camera.bottom = sc.bottom;
            light.shadow.camera.updateProjectionMatrix();
          }
        }
      }
      return light;
    }
    default:
      return null;
  }
}
function applyTransform(obj, cfg) {
  const pos = parseVec3(cfg.position);
  if (pos) obj.position.set(...pos);
  const rot = parseVec3(cfg.rotation, true);
  if (rot) obj.rotation.set(...rot);
  const scl = parseVec3(cfg.scale);
  if (scl) obj.scale.set(...scl);
}
function parseVec3(value, toRadians = false) {
  let arr = null;
  if (Array.isArray(value) && value.length >= 3) {
    arr = value.slice(0, 3).map(Number);
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        arr = parsed.slice(0, 3).map(Number);
      }
    } catch {
      return null;
    }
  }
  if (!arr) return null;
  return toRadians ? [arr[0] * DEG2RAD, arr[1] * DEG2RAD, arr[2] * DEG2RAD] : [arr[0], arr[1], arr[2]];
}
export {
  applyLiveDataToApp,
  applyTransform,
  createLiveGeometry,
  createLiveMaterial,
  createLiveObject3D,
  ensureFont,
  loadGlbObjects,
  loadLiveDataConfig,
  loadModelObjects
};
