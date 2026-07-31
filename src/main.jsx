import { jsx, jsxs } from "react/jsx-runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Scene3D from "./views/Scene3D";
import Embed from "./views/embed";
import "./styles/global.css";
createRoot(document.getElementById("app")).render(
  /* @__PURE__ */ jsx(StrictMode, { children: /* @__PURE__ */ jsx(BrowserRouter, { children: /* @__PURE__ */ jsxs(Routes, { children: [
    /* @__PURE__ */ jsx(Route, { path: "/", element: /* @__PURE__ */ jsx(Scene3D, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/embed", element: /* @__PURE__ */ jsx(Embed, {}) })
  ] }) }) })
);
