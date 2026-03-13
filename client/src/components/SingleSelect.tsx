// src/components/SingleSelect.tsx
import React, { useState, useRef, useEffect, useId, useCallback } from "react";
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
  searchable = false,
  clearable = false,
  onClear,
  clearAriaLabel = "Clear selection",
}: {
  id?: string;
  label?: string;
  labelNode?: React.ReactNode;
  placeholder?: string;
  options: readonly SelectOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  searchable?: boolean;
  clearable?: boolean;
  onClear?: () => void;
  clearAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const hasValue = Boolean(value);
  const showClear = clearable && hasValue && typeof onClear === "function";
  const currentLabel = value ? (options.find((o) => o.value === value)?.label ?? "") : "";

  // For searchable: show query while open, label when closed
  const inputValue = open ? query : currentLabel;

  const filteredOptions = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // ── Position calculation (shared by both variants) ─────────────────────
  const updatePosition = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  // ── Searchable: open/close ──────────────────────────────────────────────
  function openDropdown() {
    if (searchable && containerRef.current) updatePosition(containerRef);
    setOpen(true);
    setHighlightedIndex(-1);
  }

  function closeDropdown() {
    setOpen(false);
    setHighlightedIndex(-1);
    setQuery("");
  }

  // ── Outside-click (both variants) ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      // For searchable: containerRef holds the input; menuRef holds the portal menu
      // For non-searchable: buttonRef holds the trigger; menuRef holds the portal menu
      const trigger = searchable ? containerRef.current : buttonRef.current;
      if (trigger?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      closeDropdown();
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, searchable]);

  // ── Position update on scroll/resize (both variants) ───────────────────
  useEffect(() => {
    if (!open) return;

    const triggerRef = searchable ? containerRef : buttonRef;

    const onUpdate = () => updatePosition(triggerRef);
    window.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    return () => {
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
    };
  }, [open, searchable, updatePosition]);

  // ── Searchable handlers ─────────────────────────────────────────────────
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (!open) openDropdown();
    setHighlightedIndex(-1);
  }

  function handleInputFocus() {
    inputRef.current?.select();
    if (!open) openDropdown();
  }

  function handleOptionClick(option: SelectOption<T>) {
    onChange(option.value);
    closeDropdown();
    inputRef.current?.blur();
  }

  function handleClearSearchable() {
    onClear?.();
    closeDropdown();
    inputRef.current?.focus();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
      if (!open) openDropdown();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        handleOptionClick(filteredOptions[highlightedIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
      return;
    }
    if (e.key === "Tab") {
      closeDropdown();
    }
  }

  // ── Non-searchable button handler ───────────────────────────────────────
  function onButtonClick() {
    if (!open) {
      updatePosition(buttonRef);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function onButtonKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (open) {
        setOpen(false);
      } else if (showClear) {
        onClear?.();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      updatePosition(buttonRef);
      setOpen(true);
    }
  }

  // ── Portal dropdown (shared by both variants) ───────────────────────────
  const portalDropdown = open ? createPortal(
    <>
      {/* Invisible full-screen dismiss layer */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onClick={closeDropdown}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        role="listbox"
        id={listboxId}
        aria-labelledby={id}
        className="bg-white border rounded-md shadow-sm"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 9999,
          maxHeight: 320,
          overflowY: "auto",
        }}
      >
        {searchable && filteredOptions.length === 0 ? (
          <div className="px-3 py-2 text-muted" style={{ fontSize: "1rem" }}>
            No options match
          </div>
        ) : (
          (searchable ? filteredOptions : options).map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = searchable && index === highlightedIndex;
            return (
              <div
                key={option.value}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  if (searchable) {
                    handleOptionClick(option);
                  } else {
                    onChange(option.value);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }
                }}
                onMouseEnter={() => searchable && setHighlightedIndex(index)}
                className="d-flex align-items-center justify-content-between px-3 py-2"
                style={{
                  cursor: "default",
                  fontSize: "1rem",
                  background: isHighlighted
                    ? "#1a6faf"
                    : isSelected
                    ? "#f3f4f6"
                    : "transparent",
                  color: isHighlighted ? "#fff" : "inherit",
                }}
              >
                <span
                  className={isSelected ? "fw-medium" : "fw-normal"}
                  style={{ fontSize: "1rem" }}
                >
                  {option.label}
                </span>
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="ca-gov-icon-check"
                    style={{ fontSize: "1.25rem", lineHeight: 1 }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </>,
    document.body
  ) : null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      {(label || labelNode) && (
        <label className="form-label" htmlFor={id}>
          {labelNode || label}
        </label>
      )}

      {searchable ? (
        <div className="position-relative" ref={containerRef}>
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
            }
            placeholder={placeholder}
            value={inputValue}
            className="form-select"
            style={{
              minHeight: 44,
              fontSize: "1rem",
              paddingRight: showClear ? "88px" : "44px",
            }}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleInputKeyDown}
          />

          {showClear && (
            <button
              type="button"
              aria-label={clearAriaLabel}
              title={clearAriaLabel}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClearSearchable();
              }}
              className="position-absolute bg-transparent border-0"
              style={{
                right: "44px",
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

          {portalDropdown}
        </div>
      ) : (
        <div className="position-relative">
          <button
            ref={buttonRef}
            id={id}
            type="button"
            onClick={onButtonClick}
            onKeyDown={onButtonKeyDown}
            className="form-select d-flex justify-content-between align-items-center"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            style={{
              minHeight: 44,
              fontSize: "1rem",
              paddingRight: showClear ? "88px" : "44px",
            }}
          >
            <span className={!value ? "text-muted" : ""} style={{ fontSize: "1rem" }}>
              {!value ? placeholder : currentLabel}
            </span>
          </button>

          {showClear && (
            <button
              type="button"
              aria-label={clearAriaLabel}
              title={clearAriaLabel}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear?.();
                setOpen(false);
              }}
              className="position-absolute bg-transparent border-0"
              style={{
                right: "44px",
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

          {portalDropdown}
        </div>
      )}
    </div>
  );
}