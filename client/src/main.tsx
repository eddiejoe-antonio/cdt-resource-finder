import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";

import "@cagovweb/state-template/dist/css/cagov.core.css";
import "@cagovweb/state-template/dist/css/colortheme-oceanside.css";
import "./index.css";
import "@cagovweb/state-template/dist/js/cagov.core.js";

import App from "./App.tsx";

// Report iframe height to WordPress parent
let reportTimeout: ReturnType<typeof setTimeout>;

function reportHeight() {
  clearTimeout(reportTimeout);
  reportTimeout = setTimeout(() => {
    const height = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: "IFRAME_HEIGHT", height }, "*");
  }, 150);
}

const ro = new ResizeObserver(reportHeight);
ro.observe(document.documentElement);
reportHeight();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);