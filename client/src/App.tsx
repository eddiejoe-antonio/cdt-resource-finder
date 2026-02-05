// src/App.tsx
import { useEffect, useRef, useState } from "react";
import { fetchResourcesLocal } from "./utils/fetchResources";
import ResourceFinder from "./components/ResourceFinder";

const PARENT_ORIGIN = "https://broadbandforall.cdev.sites.ca.go";
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
  document.cookie = `googtrans=${value}; path=/; SameSite=None; Secure`;
  document.cookie = `googtrans=${value}; path=/`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // ---- Height bridge: throttle state ----
  const heightTimerRef = useRef<number | null>(null);
  const lastHeightRef = useRef<number>(0);

  // Existing data load
  useEffect(() => {
    fetchResourcesLocal()
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ✅ 1) WordPress translate messages (keep as-is)
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== PARENT_ORIGIN) return;

      const data = e.data as ParentMsg;
      if (!data || typeof data !== "object") return;
      if (data.type !== "PARENT_GOOGLE_TRANSLATE_LANG") return;

      const nextLang = normalizeLang(String(data.lang ?? PAGE_LANG));
      setGoogTransCookie(nextLang);

      const cookieAfter = getCookie("googtrans");

      window.parent.postMessage(
        { type: "IFRAME_TRANSLATE_ACK", receivedLang: nextLang, cookieAfter },
        PARENT_ORIGIN
      );

      if (!cookieAfter) return;
      window.location.reload();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ✅ 2) Iframe auto-height (new)
  useEffect(() => {
    // Only run when embedded (optional, but keeps console quieter when opening app directly)
    const isEmbedded = window.parent !== window;
    if (!isEmbedded) return;

    function measureHeight(): number {
      // Use the largest of a few candidates
      const docEl = document.documentElement;
      const body = document.body;

      return Math.max(
        docEl?.scrollHeight ?? 0,
        docEl?.offsetHeight ?? 0,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0
      );
    }

    function postHeightNow() {
      const h = measureHeight();

      // Avoid spamming if height hasn't meaningfully changed
      if (Math.abs(h - lastHeightRef.current) < 8) return;
      lastHeightRef.current = h;

      window.parent.postMessage({ type: "IFRAME_HEIGHT", height: h }, PARENT_ORIGIN);
    }

    function schedulePostHeight() {
      if (heightTimerRef.current != null) window.clearTimeout(heightTimerRef.current);
      heightTimerRef.current = window.setTimeout(() => {
        postHeightNow();
        heightTimerRef.current = null;
      }, 80);
    }

    // Initial measurement (after first paint + a short settle)
    schedulePostHeight();
    const settle = window.setTimeout(schedulePostHeight, 400);

    // Resize changes
    window.addEventListener("resize", schedulePostHeight);

    // DOM changes (filters/pagination, map toggle, etc.)
    const obs = new MutationObserver(schedulePostHeight);
    obs.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(settle);
      if (heightTimerRef.current != null) window.clearTimeout(heightTimerRef.current);
      window.removeEventListener("resize", schedulePostHeight);
      obs.disconnect();
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
