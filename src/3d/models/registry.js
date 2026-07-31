import windmillUrl from "./windmill.glb?url";
const modelRegistry = {
  windmill: windmillUrl
};
function resolveModelSrc(src) {
  if (src.startsWith("asset:")) {
    const key = src.slice(6);
    const url = modelRegistry[key];
    if (!url) {
      console.warn(
        `[models] \u672A\u6CE8\u518C\u7684\u6A21\u578B: "${key}"\uFF0C\u53EF\u7528: ${Object.keys(modelRegistry).join(", ")}`
      );
      return src;
    }
    return url;
  }
  return src;
}
export {
  modelRegistry,
  resolveModelSrc
};
