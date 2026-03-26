// src/components/ViewToggle.tsx
import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";

export type ViewMode = "list" | "map";

interface ViewToggleProps {
  selectedView: ViewMode;
  handleNavigate: (view: ViewMode) => void;
  label?: string; // optional aria-label
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;

    const onChange = () => setReduced(Boolean(mq.matches));
    onChange();

    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ selectedView, handleNavigate, label }) => {
  const mapButtonRef = useRef<HTMLButtonElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const setViewInstant = useCallback(
    (next: ViewMode) => {
      if (next === selectedView) return;

      // Commit state immediately so UI updates even under load.
      flushSync(() => handleNavigate(next));
    },
    [handleNavigate, selectedView]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Only handle arrow/home/end. Let Tab behave normally.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const next: ViewMode = selectedView === "map" ? "list" : "map";
        setViewInstant(next);

        // Move focus to the newly selected tab for accessibility
        if (next === "map") mapButtonRef.current?.focus();
        else listButtonRef.current?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        setViewInstant("map");
        mapButtonRef.current?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        setViewInstant("list");
        listButtonRef.current?.focus();
      }
    },
    [selectedView, setViewInstant]
  );

  const thumbStyle = useMemo<React.CSSProperties>(() => {
    return {
      transform: selectedView === "map" ? "translateX(0%)" : "translateX(100%)",
      transition: reducedMotion ? "none" : "transform 120ms ease-out",
      willChange: "transform",
    };
  }, [selectedView, reducedMotion]);

  const baseButton =
    "relative z-10 flex flex-1 items-center justify-center gap-2 px-4 py-2 rounded-full " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E79C8] " +
    "select-none";

  // Single source of truth for font size inside the toggle
  const FONT_SIZE = "1rem";

  return (
    <div
      className="relative flex w-full items-stretch rounded-full border border-[#3B75A9] bg-[#ecf1f3] p-1"
      role="tablist"
      aria-label={label ?? "View toggle"}
      onKeyDown={onKeyDown}
      style={{ fontSize: FONT_SIZE }}
    >
      {/* Sliding thumb */}
      <div
        aria-hidden="true"
        className="absolute left-1 top-1 bottom-1 rounded-full bg-[#066b99]"
        style={{
          width: "calc(50% - 0.25rem)",
          ...thumbStyle,
        }}
      />

      <button
        type="button"
        ref={mapButtonRef}
        role="tab"
        aria-selected={selectedView === "map"}
        // ✅ BOTH buttons tabbable again
        tabIndex={0}
        onClick={() => setViewInstant("map")}
        className={baseButton}
        style={{
          fontSize: "inherit",
          color: selectedView === "map" ? "#ffffff" : "#092940",
        }}
      >
        <span className="ca-gov-icon-road-pin" aria-hidden="true" style={{ fontSize: "inherit" }} />
        <span style={{ fontSize: "inherit", lineHeight: 1.2 }}>Map view</span>
      </button>

      <button
        type="button"
        ref={listButtonRef}
        role="tab"
        aria-selected={selectedView === "list"}
        tabIndex={0}
        onClick={() => setViewInstant("list")}
        className={baseButton}
        style={{
          fontSize: "inherit",
          color: selectedView === "list" ? "#ffffff" : "#092940",
        }}
      >
        <span className="ca-gov-icon-table" aria-hidden="true" style={{ fontSize: "inherit" }} />
        <span style={{ fontSize: "inherit", lineHeight: 1.2 }}>Table view</span>
      </button>

      <span className="sr-only" aria-live="polite">
        {selectedView === "map" ? "Map view selected" : "Table view selected"}
      </span>
    </div>
  );
};

export default memo(ViewToggle);
