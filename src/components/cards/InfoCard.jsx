import { jsx, jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
function InfoCard({ objectId, kind, label, position, height = 0 }) {
  const resolvedKind = useMemo(
    () => kind ?? (objectId?.startsWith("building") ? "building" : "tree"),
    [kind, objectId]
  );
  const resolvedLabel = useMemo(() => label ?? objectId, [label, objectId]);
  const posX = useMemo(() => position?.[0]?.toFixed(1) ?? "0.0", [position]);
  const posZ = useMemo(() => position?.[1]?.toFixed(1) ?? "0.0", [position]);
  return /* @__PURE__ */ jsxs("div", { className: `info-card kind-${resolvedKind}`, onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs("div", { className: "info-head", children: [
      /* @__PURE__ */ jsx("span", { className: "info-icon", children: resolvedKind === "tree" ? "\u{1F332}" : "\u{1F3E2}" }),
      /* @__PURE__ */ jsx("span", { className: "info-title", children: resolvedLabel })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "info-row", children: [
      /* @__PURE__ */ jsx("span", { className: "info-key", children: "\u5750\u6807" }),
      /* @__PURE__ */ jsxs("span", { className: "info-val", children: [
        posX,
        ", ",
        posZ
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "info-row", children: [
      /* @__PURE__ */ jsx("span", { className: "info-key", children: "\u9AD8\u5EA6" }),
      /* @__PURE__ */ jsxs("span", { className: "info-val", children: [
        height.toFixed(1),
        " m"
      ] })
    ] })
  ] });
}
export {
  InfoCard as default
};
