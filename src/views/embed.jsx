import { jsx, jsxs } from "react/jsx-runtime";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import {
  createScene3D
} from "@/3d";
import { CardHost } from "@/adapters/react";
import { bindPostMessageHost, postToParent } from "@/3d/bridge/postMessage-host";
import { cardRules } from "@/adapters/react/sceneCardRules";
function Embed() {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState("\u7B49\u5F85\u573A\u666F\u6570\u636E...");
  const [error, setError] = useState("");
  const [cardStates, setCardStates] = useState([]);
  const [cardRegistry, setCardRegistry] = useState(null);
  const handleRef = useRef(null);
  const detachBridgeRef = useRef(null);
  const lastRenderedJsonRef = useRef("");
  const isDebug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "true";
  function logSceneDebug(h) {
    const w = window;
    w.__handle = h;
    w.__scene = h.app.scene;
    w.__camera = h.app.camera;
    try {
      const box = new THREE.Box3().setFromObject(h.app.scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log("[embed] \u573A\u666F\u5305\u56F4\u76D2:", {
        isEmpty: box.isEmpty(),
        min: box.min.toArray(),
        max: box.max.toArray(),
        size: size.toArray(),
        center: center.toArray()
      });
      const cam = h.app.camera;
      console.log("[embed] \u76F8\u673A:", {
        type: cam.type,
        position: cam.position.toArray(),
        target: h.controls.target.toArray(),
        near: cam.near,
        far: cam.far,
        fov: cam.fov
      });
      console.log(
        "[embed] \u573A\u666F\u76F4\u63A5\u5B50\u8282\u70B9:",
        h.app.scene.children.length,
        h.app.scene.children.map((c) => c.name || c.type)
      );
    } catch (e) {
      console.warn("[embed] \u8C03\u8BD5\u4FE1\u606F\u8BA1\u7B97\u5931\u8D25", e);
    }
  }
  async function renderScene(data) {
    if (isDebug) console.log("[embed] renderScene \u5F00\u59CB, objects=", data?.objects?.length ?? 0);
    const canvas = canvasRef.current;
    if (!canvas) {
      postToParent({ type: "SCENE_ERROR", message: "Canvas \u4E0D\u5B58\u5728" });
      return;
    }
    handleRef.current?.dispose();
    handleRef.current = null;
    if (data === null) {
      setLoading(false);
      setStatusText("");
      return;
    }
    setLoading(true);
    setStatusText("\u6E32\u67D3\u573A\u666F...");
    try {
      const handle = await createScene3D(canvas, data, {
        cardRules,
        interactive: true,
        controls: {
          maxPolarAngle: Math.PI / 2.3
        }
      });
      handleRef.current = handle;
      setCardRegistry(handle.cardManager.registry);
      handle.onCardState((states) => {
        setCardStates(states);
      });
      if (handle.picker) {
        handle.picker.onPick = (info) => {
          postToParent({
            type: "SCENE_PICK",
            id: info.id,
            name: info.name,
            component: info.component,
            props: info.props
          });
        };
      }
      if (isDebug) logSceneDebug(handle);
      setLoading(false);
      setStatusText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[embed] \u6E32\u67D3\u5931\u8D25:", msg);
      setError(`\u573A\u666F\u6E32\u67D3\u5931\u8D25: ${msg}`);
      setLoading(false);
      postToParent({ type: "SCENE_ERROR", message: msg });
    }
  }
  useEffect(() => {
    postToParent({ type: "SCENE_READY" });
    console.log("[embed] SCENE_READY sent");
    detachBridgeRef.current = bindPostMessageHost({
      onScene: async (data) => {
        if (isDebug)
          console.log(
            "[embed] \u6536\u5230 SCENE_UPDATE, objects=",
            data?.objects?.length ?? 0
          );
        const json = data === null ? "null" : JSON.stringify(data);
        if (json === lastRenderedJsonRef.current) {
          if (isDebug) console.log("[embed] \u91CD\u590D SCENE_UPDATE\uFF08\u540C payload\uFF09\uFF0C\u8DF3\u8FC7\u6E32\u67D3");
          return;
        }
        lastRenderedJsonRef.current = json;
        await renderScene(data);
      },
      onPickMode: (enabled) => {
        if (!handleRef.current?.picker) return;
        enabled ? handleRef.current.picker.enable() : handleRef.current.picker.disable();
      },
      onPickGranularity: (mode) => {
        handleRef.current?.picker?.setGranularity(mode);
      },
      onFlyTo: (targetId) => {
        handleRef.current?.flyTo?.(targetId);
      },
      onTheme: (mode) => {
        handleRef.current?.setTheme?.(mode);
      },
      onResetCamera: () => {
        handleRef.current?.resetCamera?.();
      },
      onPatch: (patch) => {
        handleRef.current?.update(patch);
      }
    });
    if (window.self === window.top) {
      const sceneFile = new URLSearchParams(window.location.search).get("scene") ?? "live-data.json";
      console.log(`[embed] \u72EC\u7ACB\u8BBF\u95EE\uFF0C\u5C1D\u8BD5\u52A0\u8F7D\u9ED8\u8BA4\u573A\u666F ${sceneFile}`);
      window.setTimeout(async () => {
        if (handleRef.current) return;
        try {
          const res = await fetch(`/${sceneFile}`);
          if (res.ok) {
            const data = await res.json();
            await renderScene(data);
          }
        } catch {
        }
      }, 100);
    }
    return () => {
      detachBridgeRef.current?.();
      detachBridgeRef.current = null;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "scene-page", children: [
    /* @__PURE__ */ jsx("canvas", { ref: canvasRef, className: "scene-canvas" }),
    /* @__PURE__ */ jsx(CardHost, { cards: cardStates, registry: cardRegistry }),
    loading && /* @__PURE__ */ jsxs("div", { className: "loading-overlay", children: [
      /* @__PURE__ */ jsx("div", { className: "spinner" }),
      /* @__PURE__ */ jsx("p", { children: statusText })
    ] }),
    error && /* @__PURE__ */ jsx("div", { className: "error-overlay", onClick: () => setError(""), children: /* @__PURE__ */ jsx("p", { children: error }) })
  ] });
}
export {
  Embed as default
};
