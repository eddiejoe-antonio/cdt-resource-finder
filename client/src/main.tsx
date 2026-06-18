// ─── Google Translate / React DOM compatibility patch ────────────────────────
// Google Translate wraps bare text nodes in <font> elements, which breaks
// React's reconciler when it tries to removeChild a node that no longer exists
// at the expected position. Patching these two methods prevents the crash
// without affecting any other DOM behaviour.
const nativeRemoveChild = Node.prototype.removeChild;
Node.prototype.removeChild = function <T extends Node>(child: T): T {
  if (child.parentNode !== this) {
    return child;
  }
  return nativeRemoveChild.call(this, child) as T;
};

const nativeInsertBefore = Node.prototype.insertBefore;
Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
  if (referenceNode && referenceNode.parentNode !== this) {
    return nativeInsertBefore.call(this, newNode, null) as T;
  }
  return nativeInsertBefore.call(this, newNode, referenceNode) as T;
};
// ─────────────────────────────────────────────────────────────────────────────

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
    const PARENT_ORIGIN = "https://broadbandforall.cdt.ca.gov/digital-equity-resource-finder/";
    window.parent.postMessage({ type: "IFRAME_HEIGHT", height }, PARENT_ORIGIN);
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