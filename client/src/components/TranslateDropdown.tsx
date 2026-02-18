import { useEffect, useRef, useState } from "react";
import { TOP_LANGS_30 } from "../static/translateLanguages";

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: unknown;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getCombo(): HTMLSelectElement | null {
  return document.querySelector<HTMLSelectElement>("select.goog-te-combo");
}

function dispatchNativeChange(el: HTMLSelectElement) {
  try {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {
    const evt = document.createEvent("HTMLEvents");
    evt.initEvent("change", true, true);
    el.dispatchEvent(evt);
  }
}

function ensureHiddenMount(): string {
  const containerId = "google_translate_element";
  let mount = document.getElementById(containerId);
  if (!mount) {
    mount = document.createElement("div");
    mount.id = containerId;
    // keep it off-screen; your UI is the select below
    mount.style.position = "absolute";
    mount.style.left = "-9999px";
    mount.style.top = "0";
    mount.style.width = "1px";
    mount.style.height = "1px";
    mount.style.overflow = "hidden";
    document.body.appendChild(mount);
  }
  return containerId;
}

function initGoogleTranslate(containerId: string): boolean {
  const g = window.google;
  if (!isRecord(g)) return false;
  const translate = g["translate"];
  if (!isRecord(translate)) return false;
  const TranslateElement = translate["TranslateElement"];
  if (typeof TranslateElement !== "function") return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (TranslateElement as any)(
    { pageLanguage: "en", autoDisplay: false },
    containerId
  );
  return true;
}

export default function TranslateDropdown() {
  // ✅ initialize from DOM so we do NOT setState inside the effect
  const [ready, setReady] = useState<boolean>(() => Boolean(getCombo()));
  const [selected, setSelected] = useState<string>("");
  const [warning, setWarning] = useState<string>("");

  const didInitRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Already injected by something else? Mark ready and exit.
    if (getCombo()) {
      if (!ready) setReady(true);
      return;
    }

    if (didInitRef.current) return;
    didInitRef.current = true;

    const containerId = ensureHiddenMount();

    const startPollingForCombo = () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(() => {
        const combo = getCombo();
        if (combo) {
          window.clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setReady(true);
        }
      }, 100);
    };

    // cb for google script
    window.googleTranslateElementInit = () => {
      const ok = initGoogleTranslate(containerId);
      if (!ok) {
        // schedule state update async to avoid “setState in effect” warnings
        window.setTimeout(() => {
          setWarning("Translation may be blocked by browser settings or an ad blocker.");
        }, 0);
        return;
      }
      startPollingForCombo();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="translate_a/element.js"]'
    );

    if (existingScript) {
      // Script already present, try init now
      const ok = initGoogleTranslate(containerId);
      if (!ok) {
        window.setTimeout(() => {
          setWarning("Translation may be blocked by browser settings or an ad blocker.");
        }, 0);
        return;
      }
      startPollingForCombo();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    script.defer = true;

    script.onerror = () => {
      setWarning("Translation may be blocked by browser settings or an ad blocker.");
    };

    document.head.appendChild(script);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyLanguage = (lang: string) => {
    const combo = getCombo();
    if (!combo) return;
    combo.value = lang;
    dispatchNativeChange(combo);
  };

  return (
    <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
      {/* Globe icon (CAWeb icon set) */}
      <span
        className="ca-gov-icon-language"
        aria-hidden="true"
        style={{ fontSize: 20, lineHeight: 1 }}
      />

      <label className="sr-only" htmlFor="translate-select">
        Translate this page
      </label>

      {/* ✅ Native select: does NOT expand page height */}
      <select
        id="translate-select"
        className="form-select"
        style={{ width: 240, maxWidth: "100%" }}
        value={selected}
        disabled={!ready}
        aria-disabled={!ready}
        onChange={(e) => {
          const next = e.target.value;
          setSelected(next);
          applyLanguage(next);
        }}
      >
        {TOP_LANGS_30.map((l) => (
          <option key={l.value || "en"} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>

      {!ready && (
        <span className="text-muted" style={{ fontSize: "0.875rem", whiteSpace: "nowrap" }}>
          Loading…
        </span>
      )}

      {warning && (
        <span className="text-muted" style={{ fontSize: "0.875rem" }}>
          {warning}
        </span>
      )}
    </div>
  );
}
