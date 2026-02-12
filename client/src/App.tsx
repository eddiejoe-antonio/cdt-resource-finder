// src/App.tsx
import { useEffect, useState } from "react";
import { fetchResourcesLocal } from "./utils/fetchResources";
import ResourceFinder from "./components/ResourceFinder";

const PARENT_ORIGIN = "https://broadbandforall.cdev.sites.ca.gov";
const PAGE_LANG = "en";

type ParentMsg =
  | { type: "PARENT_GOOGLE_TRANSLATE_LANG"; lang?: string }
  | { type: string; [k: string]: unknown };

function normalizeLang(raw: string) {
  const lang = raw.trim();
  return lang || PAGE_LANG;
}

function getCookie(name: string): string | null {
  const hit = document.cookie
    .split("; ")
    .find((c) => c.toLowerCase().startsWith(name.toLowerCase() + "="));
  return hit ? hit.split("=")[1] ?? null : null;
}

function setGoogTransCookie(targetLang: string) {
  const value = `/${PAGE_LANG}/${targetLang}`;

  // Try the modern flags first (needed for 3rd-party iframe cookies in many cases)
  document.cookie = `googtrans=${value}; path=/; SameSite=None; Secure`;
  // Fallback (older behavior)
  document.cookie = `googtrans=${value}; path=/`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // Existing data load
  useEffect(() => {
    fetchResourcesLocal()
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Receive language changes from WordPress parent
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Security: only accept messages from your WP host
      if (e.origin !== PARENT_ORIGIN) return;

      const data = e.data as ParentMsg;
      if (!data || typeof data !== "object") return;
      if (data.type !== "PARENT_GOOGLE_TRANSLATE_LANG") return;

      const nextLang = normalizeLang(String(data.lang ?? PAGE_LANG));

      // Set cookie
      setGoogTransCookie(nextLang);

      // Check whether cookie actually stuck (3rd-party iframe cookies often blocked)
      const cookieAfter = getCookie("googtrans");

      // Tell parent what happened so it can fall back to proxy URL if needed
      window.parent.postMessage(
        {
          type: "IFRAME_TRANSLATE_ACK",
          receivedLang: nextLang,
          cookieAfter, // null/empty means blocked
        },
        PARENT_ORIGIN
      );

      // If cookie didn't stick, reloading won't help — parent will fall back.
      if (!cookieAfter) return;

      // Reload so Google Translate applies cleanly
      window.location.reload();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // NEW: Send height to parent WordPress page to eliminate double scrollbars
  useEffect(() => {
// In your useEffect that sends height, replace the sendHeight function with:
function sendHeight() {
  // Give the DOM a moment to settle after changes
  requestAnimationFrame(() => {
    const height = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.getElementById('root')?.scrollHeight || 0
    );

    window.parent.postMessage(
      {
        type: "IFRAME_HEIGHT",
        height: height + 20, // Add small buffer for safety
      },
      PARENT_ORIGIN
    );
  });
}

    // Send height on load
    sendHeight();

    // Send height when window resizes
    window.addEventListener("resize", sendHeight);

    // Send height when content changes (for dynamic content like filters, map toggling)
    const observer = new MutationObserver(sendHeight);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Also check periodically (for animations, lazy-loaded content, map rendering)
    const interval = setInterval(sendHeight, 1000);

    return () => {
      window.removeEventListener("resize", sendHeight);
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div>
      <ResourceFinder />
    </div>
  );
}