import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";

// 1) CA template CSS (core) + optional theme
import "@cagovweb/state-template/dist/css/cagov.core.css";
import "@cagovweb/state-template/dist/css/colortheme-oceanside.css"; // pick a theme (or remove)

// 2) Your Tailwind entry
import "./index.css";

// 3) CA template JS (dropdowns, search toggle, etc.)
import "@cagovweb/state-template/dist/js/cagov.core.js";

import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
