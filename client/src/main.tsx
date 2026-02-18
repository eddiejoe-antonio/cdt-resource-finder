import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";

import "@cagovweb/state-template/dist/css/cagov.core.css";
import "@cagovweb/state-template/dist/css/colortheme-oceanside.css";
import "./index.css";
import "@cagovweb/state-template/dist/js/cagov.core.js";

import App from "./App";

/**
 * Types for iframe-resizer's injected API (from iframeResizer.contentWindow)
 */
declare global {
  interface Window {
    parentIFrame?: {
      size: (customHeight?: number) => void;
      scrollTo: (x: number, y: number) => void;
    };
  }
}

/**
 * Load iframeResizer.contentWindow script (required inside the iframe/app).
 * NOTE: The parent (WordPress) must also initialize iframeResizer on the iframe element.
 */
function loadIframeResizerContentWindow(): Promise<void> {
  return new Promise((resolve, reject) => {
    // If already loaded, resolve immediately
    if (window.parentIFrame) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-iframe-resizer="contentWindow"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load iframe-resizer script")), {
        once: true,
      });
      return;
    }

    const s = document.createElement("script");
    s.src = "https://resources.technology.ca.gov/calendar/iframeResizer.contentWindow.min.js";
    s.async = true;
    s.dataset.iframeResizer = "contentWindow";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load iframe-resizer script"));
    document.head.appendChild(s);
  });
}

/**
 * Ask iframe-resizer to recalc iframe height.
 * This is the replacement for your old postMessage height code.
 */
let sizeRaf: number | null = null;
function requestParentResize() {
  if (!window.parentIFrame?.size) return;

  if (sizeRaf) cancelAnimationFrame(sizeRaf);
  sizeRaf = requestAnimationFrame(() => {
    sizeRaf = null;
    // Let iframe-resizer measure, or pass an explicit height if you prefer.
    window.parentIFrame?.size();
  });
}

/**
 * Set up observers that trigger resize when your SPA changes height.
 */
function installResizeHooks() {
  // ResizeObserver catches most layout changes
  const ro = new ResizeObserver(() => requestParentResize());
  ro.observe(document.documentElement);

  // Also ping on common triggers
  window.addEventListener("load", requestParentResize);
  window.addEventListener("resize", requestParentResize);

  // Optional: if your app opens/closes accordions/modals frequently,
  // you can also ping on route/view changes (you can call requestParentResize() manually from components).
}

/**
 * Your "skip header while navigating back and forth" behavior.
 * Rewritten without jQuery. (jQuery unload can be flaky anyway.)
 */
function installUnloadScrollHack() {
  window.addEventListener("unload", () => {
    if (window.parentIFrame?.scrollTo) {
      // This will run as the iframe unloads
      window.parentIFrame.scrollTo(0, 450);
    }
  });
}

async function bootstrap() {
  // Render ASAP (don’t block UX); then load iframe-resizer and start resizing.
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  try {
    await loadIframeResizerContentWindow();
    installResizeHooks();
    installUnloadScrollHack();

    // Initial sizing ping
    requestParentResize();
  } catch (e) {
    // If iframe-resizer fails to load, app still works — it just won't auto-resize.
    console.warn("[iframe-resizer] contentWindow script failed to load:", e);
  }
}

bootstrap();
