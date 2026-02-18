// src/components/SingleSelect.tsx
import React, { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string> = { value: T; label: string };

export function SingleSelect<T extends string>({
  id,
  label,
  labelNode,
  placeholder = "Select option...",
  options,
  value,
  onChange,

  // ✅ NEW
  clearable = false,
  onClear,
  clearAriaLabel = "Clear selection",
}: {
  id?: string;
  label?: string;
  labelNode?: React.ReactNode;
  placeholder?: string;
  options: readonly SelectOption<T>[];
  value: T | "";               // keep your current usage
  onChange: (value: T) => void;

  // ✅ NEW
  clearable?: boolean;         // show X only when true
  onClear?: () => void;        // called when X clicked / Esc clears (when allowed)
  clearAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const hasValue = Boolean(value);
  const showClear = clearable && hasValue && typeof onClear === "function";

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const currentLabel = value ? options.find((o) => o.value === value)?.label ?? "" : "";

  const clearValue = () => {
    if (!showClear) return;
    onClear?.();
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (open) {
        setOpen(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
      } else if (showClear) {
        clearValue();
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const dropdown = open ? (
    <>
      <div
        className="position-fixed"
        style={{ top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
        onClick={() => setOpen(false)}
      />
      <div
        ref={menuRef}
        className="bg-white border rounded-md shadow-sm"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 9999,
        }}
        role="listbox"
        id={listboxId}
        aria-labelledby={id}
      >
        <div className="p-2" style={{ maxHeight: "320px", overflow: "auto" }}>
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  requestAnimationFrame(() => buttonRef.current?.focus());
                }}
                className="w-100 text-start d-flex align-items-center justify-content-between px-2 py-2 rounded"
                style={{
                  border: "none",
                  background: isSelected ? "#f3f4f6" : "transparent",
                }}
                role="option"
                aria-selected={isSelected}
              >
                <span className="text-normal" style={{ fontSize: "1rem" }}>
                  {option.label}
                </span>
                <span
                  aria-hidden="true"
                  className={`ca-gov-icon-check ${isSelected ? "" : "opacity-0"}`}
                  style={{ fontSize: "1.25rem", lineHeight: 1 }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="w-full">
      {(label || labelNode) && (
        <label className="form-label" htmlFor={id}>
          {labelNode || label}
        </label>
      )}

      <div className="position-relative">
        <button
          ref={buttonRef}
          id={id}
          type="button"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKeyDown}
          className="form-select d-flex justify-content-between align-items-center"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          style={{
            minHeight: 44,
            fontSize: "1rem",
            // ✅ reserve space for X + caret when clearable, otherwise just caret
            paddingRight: showClear ? "88px" : "44px",
          }}
        >
          <span className={!value ? "text-muted" : ""} style={{ fontSize: "1rem" }}>
            {!value ? placeholder : currentLabel}
          </span>
        </button>

        {/* ✅ X only when clearable */}
        {showClear && (
          <button
            type="button"
            aria-label={clearAriaLabel}
            title={clearAriaLabel}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation(); // don’t toggle menu
              clearValue();
            }}
            className="position-absolute bg-transparent border-0"
            style={{
              right: "44px", // ✅ sits left of caret area
              top: "50%",
              transform: "translateY(-50%)",
              width: "44px",
              height: "44px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 2,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only">{clearAriaLabel}</span>
          </button>
        )}

        {open && createPortal(dropdown, document.body)}
      </div>
    </div>
  );
}
