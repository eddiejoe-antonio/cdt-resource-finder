// src/App.tsx
import { useEffect, useState } from "react";
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

function setGoogTransCookie(targetLang: string) {
  // Google expects /<source>/<target>
  const value = `/${PAGE_LANG}/${targetLang}`;

  // Works in most iframe cases; some browsers may block third-party cookies.
  document.cookie = `googtrans=${value}; path=/; SameSite=Lax`;
  document.cookie = `googtrans=${value}; path=/`; // compatibility
}

function getGoogTransCookieValue(): string | null {
  const entry = document.cookie
    .split("; ")
    .find((c) => c.toLowerCase().startsWith("googtrans="));
  if (!entry) return null;

  const [, v] = entry.split("=");
  return v ?? null;
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

  // ✅ Receive language changes from WordPress parent
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Security: lock to your WP origin only
      if (e.origin !== PARENT_ORIGIN) return;

      const data = e.data as ParentMsg;
      if (!data || typeof data !== "object") return;
      if (data.type !== "PARENT_GOOGLE_TRANSLATE_LANG") return;

      const nextLang = normalizeLang(String(data.lang ?? PAGE_LANG));

      // Set cookie and reload to apply translation reliably
      const before = getGoogTransCookieValue();
      setGoogTransCookie(nextLang);
      const after = getGoogTransCookieValue();

      // Reload regardless — Google DOM translation is more consistent after reload
      // (If cookies are blocked, reload won't help; see note below.)
      if (before !== after) {
        window.location.reload();
      } else {
        window.location.reload();
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div>
      {/* Hidden target for Google Translate to initialize into */}
      <div id="google_translate_element" style={{ display: "none" }} />

      <ResourceFinder />
    </div>
  );
}
