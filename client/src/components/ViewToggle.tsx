import React, { useRef } from "react";

export type ViewMode = "list" | "map";

interface ViewToggleProps {
  selectedView: ViewMode;
  handleNavigate: (view: ViewMode) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ selectedView, handleNavigate }) => {
  const mapButtonRef = useRef<HTMLButtonElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);

  const moveFocusAndNavigate = (next: ViewMode) => {
    handleNavigate(next);
    // Optional: move focus to the newly selected button when switching with arrow keys
    if (next === "map") mapButtonRef.current?.focus();
    else listButtonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

    e.preventDefault();
    const next: ViewMode = selectedView === "map" ? "list" : "map";
    moveFocusAndNavigate(next);
  };

  const baseClasses =
    "flex flex-1 items-center justify-center px-4 py-2 rounded-full border " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E79C8]";

  const selectedClasses = "bg-[#066b99] text-white border-white";
const unselectedClasses =
  "bg-[#ecf1f3] border-[#3B75A9] md:hover:bg-[#066b99] md:hover:text-white";

  return (
    <div
      className="flex w-full space-x-1"
      role="group"
      aria-label="View toggle"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        ref={mapButtonRef}
        aria-pressed={selectedView === "map"}
        onClick={() => handleNavigate("map")}
        tabIndex={0} // ✅ both are tabbable
        className={`${baseClasses} ${selectedView === "map" ? selectedClasses : unselectedClasses}`}
      >
        <span className="ca-gov-icon-road-pin m-r-sm" aria-hidden="true" />
        <span>Map View</span>
      </button>

      <button
        type="button"
        ref={listButtonRef}
        aria-pressed={selectedView === "list"}
        onClick={() => handleNavigate("list")}
        tabIndex={0} // ✅ both are tabbable
        className={`${baseClasses} ${selectedView === "list" ? selectedClasses : unselectedClasses}`}
      >
        <span className="ca-gov-icon-table m-r-sm" aria-hidden="true" />
        <span>Table View</span>
      </button>

      <span className="sr-only" aria-live="polite">
        {selectedView === "map" ? "Map view selected" : "Tabular view selected"}
      </span>
    </div>
  );
};

export default ViewToggle;
