// src/App.tsx
import { useEffect, useState } from "react";
import { fetchResourcesLocal } from "./utils/fetchResources";
import ResourceFinder from "./components/ResourceFinder";
import TranslateBar from "./components/TranslateBar";

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

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div>
      <TranslateBar />
      <ResourceFinder />
    </div>
  );
}
