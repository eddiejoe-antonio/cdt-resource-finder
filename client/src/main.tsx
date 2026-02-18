import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";

import "@cagovweb/state-template/dist/css/cagov.core.css";
import "@cagovweb/state-template/dist/css/colortheme-oceanside.css";
import "./index.css";
import "@cagovweb/state-template/dist/js/cagov.core.js";

import App from "./App";

// IMPORTANT: set this to the *exact* WordPress origin embedding the iframe.
// If you have multiple environments, you can allowlist them (see note below).
const PARENT_ORIGIN = "https://broadbandforall.cdev.sites.ca.go";

/**
 * Report iframe height to WordPress parent.
 * Uses ResizeObserver + window events, and measures more robustly than just documentElement.scrollHeight.
 */
let reportTimeout: number | undefined;

function measureDocHeight(): number {
  const body = document.body;
  const html = document.documentElement;

  // Robust measurement across browsers/layout modes
  return Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    html?.clientHeight ?? 0,
    html?.scrollHeight ?? 0,
    html?.offsetHeight ?? 0
  );
}

function reportHeight() {
  if (reportTimeout) window.clearTimeout(reportTimeout);

  reportTimeout = window.setTimeout(() => {
    const height = measureDocHeight();

    // Security: target the known parent origin
    window.parent.postMessage({ type: "IFRAME_HEIGHT", height }, PARENT_ORIGIN);
  }, 100);
}

// Observe size changes
const ro = new ResizeObserver(reportHeight);
ro.observe(document.documentElement);

// Also report on common triggers
window.addEventListener("load", reportHeight);
window.addEventListener("resize", reportHeight);

// First ping
reportHeight();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
