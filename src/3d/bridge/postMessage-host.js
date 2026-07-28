function postToParent(msg) {
  window.parent.postMessage(msg, "*");
}
function bindPostMessageHost(handlers) {
  const listener = async (e) => {
    const data = e.data;
    if (!data || typeof data.type !== "string") return;
    try {
      switch (data.type) {
        case "SCENE_UPDATE":
          await handlers.onScene(data.payload ?? null);
          break;
        case "SCENE_PICK_MODE":
          handlers.onPickMode?.(data.enabled ?? false);
          break;
        case "SCENE_PICK_GRANULARITY":
          handlers.onPickGranularity?.(data.granularity ?? "part");
          break;
        case "SCENE_FLY_TO":
          if (data.targetId) handlers.onFlyTo?.(data.targetId);
          break;
        case "SCENE_THEME":
          if (data.mode) handlers.onTheme?.(data.mode);
          break;
        case "SCENE_RESET_CAMERA":
          handlers.onResetCamera?.();
          break;
        case "SCENE_PATCH":
          handlers.onPatch?.(data.payload);
          break;
        default:
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[postMessage-host] \u5904\u7406\u6D88\u606F\u5931\u8D25:", data.type, msg);
      postToParent({ type: "SCENE_ERROR", message: `${data.type}: ${msg}` });
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
function patchHandlerFromHandle(handle) {
  return (patch) => {
    handle.update(patch);
  };
}
export {
  bindPostMessageHost,
  patchHandlerFromHandle,
  postToParent
};
