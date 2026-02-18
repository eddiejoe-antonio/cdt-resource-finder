import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";

// 1) CA template CSS (core) + optional theme
import "@cagovweb/state-template/dist/css/cagov.core.css";
import "@cagovweb/state-template/dist/css/colortheme-oceanside.css";

// 2) Your Tailwind entry
import "./index.css";

// 3) CA template JS (dropdowns, search toggle, etc.)
import "@cagovweb/state-template/dist/js/cagov.core.js";

import App from "./App.tsx";

// Report iframe height to WordPress parent
function reportHeight() {
  const height = document.documentElement.scrollHeight;
  window.parent.postMessage({ type: "IFRAME_HEIGHT", height }, "*");
}

const ro = new ResizeObserver(reportHeight);
ro.observe(document.documentElement);
reportHeight();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);