import { useEffect, useMemo, useRef, useState } from "react";

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
  // Modern + legacy
  try {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {
    const evt = document.createEvent("HTMLEvents");
    evt.initEvent("change", true, true);
    el.dispatchEvent(evt);
  }
}

type Lang = { value: string; label: string };

const DEFAULT_LANGS: Lang[] = [
  { value: "", label: "English" },
  { value: "es", label: "Español" },
  { value: "zh-CN", label: "中文 (简体)" },
  { value: "zh-TW", label: "中文 (繁體)" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "tl", label: "Tagalog" },
  { value: "ko", label: "한국어" },
];

export default function TranslateBar() {
  const [selected, setSelected] = useState("");
  const didInitRef = useRef(false);

  // This is ONLY used to re-render when the combo appears.
  const [, bump] = useState(0);

  // Derived "ready" from DOM (no state = no warning)
  const ready = useMemo(() => Boolean(getCombo()), [/* rerender tick */]);

  useEffect(() => {
    // If Google already injected the combo, do nothing.
    if (getCombo()) return;

    if (didInitRef.current) return;
    didInitRef.current = true;

    const containerId = "google_translate_element";
    let mount = document.getElementById(containerId);
    if (!mount) {
      mount = document.createElement("div");
      mount.id = containerId;
      // keep it off-screen; banner stays yours
      mount.style.position = "absolute";
      mount.style.left = "-9999px";
      mount.style.top = "0";
      document.body.appendChild(mount);
    }

    const init = () => {
      const g = window.google;
      if (!isRecord(g)) return false;
      const translate = g["translate"];
      if (!isRecord(translate)) return false;
      const TranslateElement = translate["TranslateElement"];
      if (typeof TranslateElement !== "function") return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (TranslateElement as any)({ pageLanguage: "en", autoDisplay: false }, containerId);

      // Poll until combo appears, then re-render once.
      const t = window.setInterval(() => {
        if (getCombo()) {
          window.clearInterval(t);
          bump((x) => x + 1);
        }
      }, 80);

      return true;
    };

    window.googleTranslateElementInit = () => {
      init();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="translate_a/element.js"]'
    );
    if (existingScript) {
      init();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      // one re-render so the warning text can show
      bump((x) => x + 1);
    };
    document.head.appendChild(script);
  }, []);

  const applyLanguage = (lang: string) => {
    const combo = getCombo();
    if (!combo) return;
    combo.value = lang;
    dispatchNativeChange(combo);
  };

  return (
    <div
      className="w-100"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2000,
        background: "white",
        borderBottom: "1px solid rgba(0,0,0,0.12)",
      }}
    >
      <div
        className="container-fluid"
        style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 700 }}>Translate this page</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select
            className="form-select"
            style={{ width: 220 }}
            value={selected}
            disabled={!ready}
            aria-disabled={!ready}
            onChange={(e) => {
              const next = e.target.value;
              setSelected(next);
              applyLanguage(next);
            }}
          >
            {DEFAULT_LANGS.map((l) => (
              <option key={l.value || "en"} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          {!ready && (
            <span style={{ fontSize: "0.875rem" }} className="text-muted">
              Translation may be blocked by browser settings or an ad blocker.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
