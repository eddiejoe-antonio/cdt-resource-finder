// src/components/ViewToggle.tsx
import React, { memo, useCallback, useRef } from "react";
import { flushSync } from "react-dom";

export type ViewMode = "list" | "map";

interface ViewToggleProps {
  selectedView: ViewMode;
  handleNavigate: (view: ViewMode) => void;
  label?: string;
  /** ID of an external element to use as the accessible label for the tablist */
  labelId?: string;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ selectedView, handleNavigate, label, labelId }) => {
  const mapButtonRef = useRef<HTMLButtonElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);

  const setView = useCallback(
    (next: ViewMode) => {
      if (next === selectedView) return;
      flushSync(() => handleNavigate(next));
    },
    [handleNavigate, selectedView]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const next: ViewMode = selectedView === "map" ? "list" : "map";
        setView(next);
        if (next === "map") mapButtonRef.current?.focus();
        else listButtonRef.current?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        setView("map");
        mapButtonRef.current?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        setView("list");
        listButtonRef.current?.focus();
      }
    },
    [selectedView, setView]
  );

  // Shared base styles
  const FONT_SIZE = "1rem";
  const RADIUS = "6px";
  const ACTIVE_BG = "#066b99";
  const ACTIVE_COLOR = "#ffffff";
  const INACTIVE_BG = "#ffffff";
  const INACTIVE_COLOR = "#092940";
  const BORDER_COLOR = "#3B75A9"; // meets 3:1 on white for non-text contrast

  function btnStyle(isActive: boolean, side: "left" | "right"): React.CSSProperties {
    return {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
      padding: "0.5rem 1rem",
      fontSize: FONT_SIZE,
      lineHeight: 1.2,
      cursor: "pointer",
      border: `2px solid ${BORDER_COLOR}`,
      // Merge inner borders so there's no double-line between buttons
      borderRight: side === "left" ? "1px solid " + BORDER_COLOR : "2px solid " + BORDER_COLOR,
      borderLeft: side === "right" ? "1px solid " + BORDER_COLOR : "2px solid " + BORDER_COLOR,
      borderRadius:
        side === "left"
          ? `${RADIUS} 0 0 ${RADIUS}`
          : `0 ${RADIUS} ${RADIUS} 0`,
      background: isActive ? ACTIVE_BG : INACTIVE_BG,
      color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
      fontWeight: isActive ? 600 : 400,
      // No outline override — let the browser's default :focus-visible ring show
    };
  }

  return (
    <div
      role="tablist"
      aria-labelledby={labelId ?? undefined}
      aria-label={!labelId ? (label ?? "View toggle") : undefined}
      onKeyDown={onKeyDown}
      style={{ display: "flex", width: "100%", fontSize: FONT_SIZE }}
    >
      <style>{`
        .view-toggle-btn:focus-visible {
          outline: 3px solid #1a6faf !important;
          outline-offset: 2px !important;
          box-shadow: none !important;
          z-index: 1;
          position: relative;
        }
      `}</style>
      <button
        ref={mapButtonRef}
        type="button"
        role="tab"
        aria-selected={selectedView === "map"}
        tabIndex={0}
        onClick={() => setView("map")}
        className="view-toggle-btn"
        style={btnStyle(selectedView === "map", "left")}
      >
        <span className="ca-gov-icon-road-pin" aria-hidden="true" style={{ fontSize: FONT_SIZE }} />
        <span>Map view</span>
      </button>

      <button
        ref={listButtonRef}
        type="button"
        role="tab"
        aria-selected={selectedView === "list"}
        tabIndex={0}
        onClick={() => setView("list")}
        className="view-toggle-btn"
        style={btnStyle(selectedView === "list", "right")}
      >
        <span className="ca-gov-icon-table" aria-hidden="true" style={{ fontSize: FONT_SIZE }} />
        <span>Table view</span>
      </button>

      <span className="sr-only" aria-live="polite">
        {selectedView === "map" ? "Map view selected" : "Table view selected"}
      </span>
    </div>
  );
};

export default memo(ViewToggle);