import { jsx, jsxs } from "react/jsx-runtime";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  createScene3D,
  loadLiveDataConfig
} from "@/3d";
import { CardHost } from "@/adapters/react";
import { cardRules } from "@/adapters/react/sceneCardRules";
function Scene3D() {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState("\u52A0\u8F7D\u573A\u666F...");
  const [error, setError] = useState("");
  const [cardStates, setCardStates] = useState([]);
  const [cardRegistry, setCardRegistry] = useState(null);
  const handleRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setError("Canvas \u4E0D\u5B58\u5728");
      setLoading(false);
      return;
    }
    let disposed = false;
    (async () => {
      try {
        const data = await loadLiveDataConfig();
        const handle = await createScene3D(canvas, data, {
          cardRules,
          controls: {
            maxPolarAngle: Math.PI / 2.3
          }
        });
        if (disposed) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        setCardRegistry(handle.cardManager.registry);
        handle.onCardState((states) => {
          setCardStates(states);
        });
        setLoading(false);
        setStatusText("");
        window.scene3d = handle;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Scene3D] \u52A0\u8F7D\u5931\u8D25:", msg);
        setError(`\u573A\u666F\u52A0\u8F7D\u5931\u8D25: ${msg}`);
        setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);
  const handleErrorClick = useCallback(() => setError(""), []);
  return /* @__PURE__ */ jsxs("div", { className: "scene-page", children: [
    /* @__PURE__ */ jsx("canvas", { ref: canvasRef, className: "scene-canvas" }),
    /* @__PURE__ */ jsx(CardHost, { cards: cardStates, registry: cardRegistry }),
    loading && /* @__PURE__ */ jsxs("div", { className: "loading-overlay", children: [
      /* @__PURE__ */ jsx("div", { className: "spinner" }),
      /* @__PURE__ */ jsx("p", { children: statusText })
    ] }),
    error && /* @__PURE__ */ jsx("div", { className: "error-overlay", onClick: handleErrorClick, children: /* @__PURE__ */ jsx("p", { children: error }) })
  ] });
}
export {
  Scene3D as default
};
