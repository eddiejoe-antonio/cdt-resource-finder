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
  // --- Non-searchable state ---
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  // --- Searchable state ---
  // `query` is only the active search text while the dropdown is open.
  // When closed, the input derives its display value from `currentLabel` directly —
  // no effect needed, no cascading renders.
  const [query, setQuery] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const hasValue = Boolean(value);
  const showClear = clearable && hasValue && typeof onClear === "function";
  const currentLabel = value ? (options.find((o) => o.value === value)?.label ?? "") : "";

  // Derive display value at render time — no effect required.
  const inputValue = showOptions ? query : currentLabel;

  const filteredOptions = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // --- Searchable: close on outside click ---
  useEffect(() => {
    if (!searchable || !showOptions) return;

    function onDown(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setShowOptions(false);
      setHighlightedIndex(-1);
      setQuery(""); // reset so next open starts fresh
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchable, showOptions]);

  // --- Searchable handlers ---
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setShowOptions(true);
    setHighlightedIndex(-1);
  }

  function handleInputFocus() {
    inputRef.current?.select();
    setShowOptions(true);
    setHighlightedIndex(-1);
  }

  function handleOptionClick(option: SelectOption<T>) {
    onChange(option.value);
    setQuery("");
    setShowOptions(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  }

  function handleClearSearchable() {
    onClear?.();
    setQuery("");
    setShowOptions(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
      if (!showOptions) setShowOptions(true);
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
      setShowOptions(false);
      setHighlightedIndex(-1);
      setQuery("");
      return;
    }
    if (e.key === "Tab") {
      setShowOptions(false);
      setHighlightedIndex(-1);
      setQuery("");
    }
  }

  // --- Non-searchable: position + outside click ---
  useEffect(() => {
    if (searchable || !open || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [searchable, open]);

  useEffect(() => {
    if (searchable || !open) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchable, open]);

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
      setOpen(true);
    }
  }

  // --- Non-searchable dropdown ---
  const nonSearchableDropdown = open ? (
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
                  buttonRef.current?.focus();
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

  // --- Render ---
  return (
    <div className="w-full">
      {(label || labelNode) && (
        <label className="form-label" htmlFor={id}>
          {labelNode || label}
        </label>
      )}

      {searchable ? (
        /* Searchable variant */
        <div className="position-relative" ref={containerRef}>
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-haspopup="listbox"
            aria-expanded={showOptions}
            aria-controls={showOptions ? listboxId : undefined}
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

          {showOptions && (
            <div
              id={listboxId}
              role="listbox"
              aria-label={label ?? "Options"}
              className="bg-white border shadow-sm"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                zIndex: 9999,
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-muted" style={{ fontSize: "1rem" }}>
                  No options match
                </div>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = option.value === value;
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <div
                      key={option.value}
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleOptionClick(option)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className="d-flex align-items-center justify-content-between px-3 py-2"
                      style={{
                        cursor: "default",
                        fontSize: "1rem",
                        background: isHighlighted ? "#1a6faf" : "transparent",
                        color: isHighlighted ? "#fff" : "inherit",
                      }}
                    >
                      <span className={isSelected ? "fw-medium" : "fw-normal"}>
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
          )}
        </div>
      ) : (
        /* Non-searchable variant (original button behaviour) */
        <div className="position-relative">
          <button
            ref={buttonRef}
            id={id}
            type="button"
            onClick={() => setOpen((v) => !v)}
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

          {open && createPortal(nonSearchableDropdown, document.body)}
        </div>
      )}
    </div>
  );
}