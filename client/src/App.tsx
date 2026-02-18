import { useEffect, useMemo, useState } from "react";
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
  return hit ? hit.split("=", 2)[1] ?? null : null;
}

function setGoogTransCookie(targetLang: string) {
  const value = `/${PAGE_LANG}/${targetLang}`;

  // Modern flags first (needed when cookies are allowed in iframe contexts)
  document.cookie = `googtrans=${value}; path=/; SameSite=None; Secure`;
  // Fallback
  document.cookie = `googtrans=${value}; path=/`;
}

function parseGoogTransCookie(cookieVal: string | null): string | null {
  if (!cookieVal) return null;
  // cookieVal looks like "/en/es" etc.
  const parts = cookieVal.split("/");
  const lang = parts[2];
  return lang ? lang.trim() : null;
}

export default function App() {
  // Keep App lightweight—ResourceFinder already handles loading.
  // If you still want a top-level "shell" loading state later, move loading into ResourceFinder props.
  const [translateNotice, setTranslateNotice] = useState<string>("");

  // Derive current googtrans language (best effort)
  const currentLang = useMemo(() => {
    const cookie = getCookie("googtrans");
    return parseGoogTransCookie(cookie) ?? PAGE_LANG;
  }, [translateNotice]); // re-evaluate after we update notice/cookie

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Security: only accept messages from your WP host
      if (e.origin !== PARENT_ORIGIN) return;

      const data = e.data as ParentMsg;
      if (!data || typeof data !== "object") return;
      if (data.type !== "PARENT_GOOGLE_TRANSLATE_LANG") return;

      const nextLang = normalizeLang(String(data.lang ?? PAGE_LANG));

      // If no change, acknowledge and do nothing
      if (nextLang === currentLang) {
        window.parent.postMessage(
          {
            type: "IFRAME_TRANSLATE_ACK",
            receivedLang: nextLang,
            cookieAfter: getCookie("googtrans"),
            action: "no-op",
          },
          PARENT_ORIGIN
        );
        return;
      }

      // Set cookie
      setGoogTransCookie(nextLang);

      // Check whether cookie actually stuck (3rd-party iframe cookies often blocked)
      const cookieAfter = getCookie("googtrans");

      // Tell parent what happened so it can fall back if needed
      window.parent.postMessage(
        {
          type: "IFRAME_TRANSLATE_ACK",
          receivedLang: nextLang,
          cookieAfter, // null/empty means blocked
          action: cookieAfter ? "reloading" : "blocked",
        },
        PARENT_ORIGIN
      );

      if (!cookieAfter) {
        setTranslateNotice(
          "Translation cookie was blocked in this embedded view. The host page may need to use a proxy/translated URL fallback."
        );
        return;
      }

      // Prevent reload loops: only reload if cookie reflects a different lang than before.
      const langAfter = parseGoogTransCookie(cookieAfter);
      if (langAfter && langAfter !== currentLang) {
        // Give the browser a tick to flush layout/height observers cleanly
        window.setTimeout(() => window.location.reload(), 50);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // Include currentLang so we can no-op when already in that language
  }, [currentLang]);

  return (
    <div>
      <TranslateBar />

      {translateNotice && (
        <div className="p-2" role="status" aria-live="polite">
          {translateNotice}
        </div>
      )}

      <ResourceFinder />
    </div>
  );
}
