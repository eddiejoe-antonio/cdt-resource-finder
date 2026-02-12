// src/App.tsx
import { useEffect, useMemo, useState } from "react";
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
  document.cookie = `googtrans=${value}; path=/; SameSite=None; Secure`;
  document.cookie = `googtrans=${value}; path=/`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const renderStateKey = useMemo(
    () => (loading ? "loading" : err ? "error" : "ready"),
    [loading, err]
  );

  /* -------------------------------------------------------
     AUTO IFRAME HEIGHT POSTMESSAGE
     ------------------------------------------------------- */
  useEffect(() => {
    let timeout: number | null = null;

    function sendHeight() {
      if (timeout) window.clearTimeout(timeout);

      timeout = window.setTimeout(() => {
        const height =
          document.documentElement.scrollHeight ||
          document.body.scrollHeight;

        window.parent?.postMessage(
          { type: "setHeight", height },
          PARENT_ORIGIN
        );
      }, 50); // debounce prevents message spam
    }

    sendHeight();

    window.addEventListener("resize", sendHeight);
    window.addEventListener("load", sendHeight);

    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("resize", sendHeight);
      window.removeEventListener("load", sendHeight);
      observer.disconnect();
      if (timeout) window.clearTimeout(timeout);
    };
  }, [renderStateKey]);

  /* -------------------------------------------------------
     LOAD DATA
     ------------------------------------------------------- */
  useEffect(() => {
    fetchResourcesLocal()
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  /* -------------------------------------------------------
     RECEIVE TRANSLATION COMMANDS FROM PARENT
     ------------------------------------------------------- */
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
        {
          type: "IFRAME_TRANSLATE_ACK",
          receivedLang: nextLang,
          cookieAfter,
        },
        PARENT_ORIGIN
      );

      if (!cookieAfter) return;

      window.location.reload();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /* -------------------------------------------------------
     UI STATES
     ------------------------------------------------------- */
  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div>
      <ResourceFinder />
    </div>
  );
}
