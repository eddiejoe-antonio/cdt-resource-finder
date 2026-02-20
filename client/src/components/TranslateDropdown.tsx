import { useEffect, useRef, useState } from "react";
import { TOP_LANGS_30 } from "../static/translateLanguages";

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

export default function TranslateDropdown() {
  const [ready, setReady] = useState<boolean>(() => Boolean(getCombo()));
  const [selected, setSelected] = useState<string>("");
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (ready) return;

    pollTimerRef.current = window.setInterval(() => {
      if (getCombo()) {
        window.clearInterval(pollTimerRef.current!);
        pollTimerRef.current = null;
        setReady(true);
      }
    }, 100);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [ready]);

  const applyLanguage = (lang: string) => {
    const combo = getCombo();
    if (!combo) return;
    combo.value = lang;
    dispatchNativeChange(combo);
  };

  return (
    <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
      <span
        className="ca-gov-icon-language"
        aria-hidden="true"
        style={{ fontSize: 20, lineHeight: 1 }}
      />
      <label className="sr-only" htmlFor="translate-select">
        Translate this page
      </label>
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
        <span
          className="text-muted"
          style={{ fontSize: "0.875rem", whiteSpace: "nowrap" }}
        >
          Loading…
        </span>
      )}
    </div>
  );
}