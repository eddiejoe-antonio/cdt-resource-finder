// src/App.tsx
import { useEffect, useState } from "react";
import { fetchResourcesLocal } from "./utils/fetchResources";
import ResourceFinder from "./components/ResourceFinder";
import TranslateBar from "./components/TranslateBar";

const PARENT_ORIGIN = "https://broadbandforall.cdev.sites.ca.go"; // must match WP page origin exactly
const PAGE_LANG = "en";

type ParentMsg =
  | { type: "PARENT_GOOGLE_TRANSLATE_LANG"; lang?: string }
  | { type: string; [k: string]: unknown };

function normalizeLang(raw: string) {
  const lang = raw.trim().toLowerCase();
  return lang || PAGE_LANG;
}

function getCookie(name: string): string | null {
  const hit = document.cookie
    .split("; ")
    .find((c) => c.toLowerCase().startsWith(name.toLowerCase() + "="));
  return hit ? hit.split("=").slice(1).join("=") ?? null : null;
}

function setGoogTransCookie(targetLang: string) {
  // google translate cookie format:
  // googtrans=/en/es
  const value = `/${PAGE_LANG}/${targetLang}`;

  // Modern cookie flags (helps in some embedded contexts, but can't bypass browser restrictions)
  document.cookie = `googtrans=${value}; path=/; SameSite=None; Secure`;
  // Fallback
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

  // Handshake: ask parent for current language as soon as iframe loads
  useEffect(() => {
    window.parent.postMessage({ type: "IFRAME_READY" }, PARENT_ORIGIN);
  }, []);

  // Receive language changes from WordPress parent
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Security: only accept messages from your WP host origin
      if (e.origin !== PARENT_ORIGIN) return;

      const data = e.data as ParentMsg;
      if (!data || typeof data !== "object") return;
      if (data.type !== "PARENT_GOOGLE_TRANSLATE_LANG") return;

      const nextLang = normalizeLang(String(data.lang ?? PAGE_LANG));

      // If language is "en" (or same as PAGE_LANG), you can optionally clear cookie.
      // But keeping it consistent is fine.
      setGoogTransCookie(nextLang);

      // Check whether cookie actually stuck (often blocked in third-party iframe contexts)
      const cookieAfter = getCookie("googtrans");

      // Tell parent what happened (useful for debugging / future fallback strategies)
      window.parent.postMessage(
        {
          type: "IFRAME_TRANSLATE_ACK",
          receivedLang: nextLang,
          cookieAfter, // null/empty means blocked
        },
        PARENT_ORIGIN
      );

      // If cookie didn't stick, reloading won't help.
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
      {/*
        Keep TranslateBar ONLY if it is what loads the Google Translate script into the iframe.
        If TranslateBar is just a UI control (and you want to use the parent UI), you can remove it.
        BUT: the translate engine must still exist inside the iframe for it to actually translate.
      */}
      <TranslateBar />
      <ResourceFinder />
    </div>
  );
}
