// src/components/PortalSelects.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPortal } from "./PortalSelectUtils";

// Types: exporting *types* is usually fine with react-refresh.
// If your lint still complains, move these to a .types.ts file.
export type SelectOption<T extends string> = { value: T; label: string };
export type MultiSelectOption<T extends string> = { value: T; label: string };

export function PortalSingleSelect<T extends string>({
  id,
  label,
  labelNode,
  placeholder,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  labelNode?: React.ReactNode;
  placeholder: string;
  options: readonly SelectOption<T>[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const pos = useAnchoredPortal(open, btnRef as unknown as React.RefObject<HTMLElement>);

  const currentLabel = useMemo(() => {
    if (!value) return "";
    return options.find((o) => o.value === value)?.label ?? "";
  }, [value, options]);

  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      btnRef.current?.focus();
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    const t = window.setTimeout(() => {
      const buttons =
        menuRef.current?.querySelectorAll<HTMLButtonElement>('button[data-opt="true"]') ?? [];
      buttons[idx]?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, options, value]);

  const menu = open ? (
    <div
      ref={menuRef}
      role="listbox"
      aria-labelledby={`${id}-label`}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
      }}
      className="bg-white border shadow-sm"
      onKeyDown={(e) => {
        const buttons = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>('button[data-opt="true"]') ?? []
        );

        const active = document.activeElement as HTMLElement | null;
        const i = buttons.findIndex((b) => b === active);

        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          btnRef.current?.focus();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(buttons.length - 1, (i < 0 ? -1 : i) + 1);
          buttons[next]?.focus();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = Math.max(0, (i < 0 ? 0 : i) - 1);
          buttons[prev]?.focus();
          return;
        }
      }}
    >
      <div className="p-2" style={{ maxHeight: 320, overflow: "auto" }}>
        {options.map((opt) => {
          const selected = opt.value === value;

          return (
            <button
              key={opt.value}
              type="button"
              data-opt="true"
              role="option"
              aria-selected={selected}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
                btnRef.current?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(opt.value);
                  setOpen(false);
                  btnRef.current?.focus();
                }
              }}
              className={`
                w-100 text-start
                d-flex align-items-center justify-content-between
                px-2 py-2
                ${selected ? "bg-gray-100" : ""}
              `}
              style={{
                border: "none",
                background: selected ? undefined : "transparent",
              }}
            >
              <span className="text-normal" style={{ fontSize: "1rem" }}>
                {opt.label}
              </span>
              <span
                aria-hidden="true"
                className={`ca-gov-icon-check ${selected ? "" : "opacity-0"}`}
                style={{ fontSize: "1.25rem", lineHeight: 1 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div>
      <label id={`${id}-label`} className="form-label" htmlFor={id}>
        <span className="d-inline-flex align-items-center">{labelNode ?? label}</span>
      </label>

      <button
        id={id}
        ref={btnRef}
        type="button"
        className="form-select d-flex justify-content-between align-items-center"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{ minHeight: 44, fontSize: "1rem" }}
      >
        <span className={!value ? "text-muted" : ""} style={{ fontSize: "1rem" }}>
          {!value ? placeholder : currentLabel}
        </span>

        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M5.5 7.5L10 12l4.5-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? createPortal(menu, document.body) : null}
    </div>
  );
}

export function PortalMultiSelect<T extends string>({
  id,
  label,
  labelNode,
  placeholder = "Select...",
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  closeOnClear = true,
}: {
  id: string;
  label: string;
  labelNode?: React.ReactNode;
  placeholder?: string;
  options: readonly MultiSelectOption<T>[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  onSelectAll: () => void;
  onClear: () => void;
  closeOnClear?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectAllRef = useRef<HTMLButtonElement | null>(null);

  const [open, setOpen] = useState(false);
  const pos = useAnchoredPortal(open, btnRef as unknown as React.RefObject<HTMLElement>);

  const selectedCount = selected.length;
  const buttonText = selectedCount === 0 ? placeholder : `${selectedCount} selected`;

  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      btnRef.current?.focus();
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => selectAllRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const menu = open ? (
    <div
      ref={menuRef}
      role="dialog"
      aria-labelledby={`${id}-label`}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
      }}
      className="bg-white border shadow-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          btnRef.current?.focus();
          return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const inputs = Array.from(
            menuRef.current?.querySelectorAll<HTMLInputElement>(
              'input[type="checkbox"][data-opt="true"]'
            ) ?? []
          );
          const active = document.activeElement as HTMLElement | null;
          const i = inputs.findIndex((x) => x === active);

          if (inputs.length === 0) return;

          e.preventDefault();
          if (e.key === "ArrowDown") {
            const next = Math.min(inputs.length - 1, (i < 0 ? -1 : i) + 1);
            inputs[next]?.focus();
          } else {
            const prev = Math.max(0, (i < 0 ? 0 : i) - 1);
            inputs[prev]?.focus();
          }
        }
      }}
    >
      <div className="d-flex justify-content-between gap-2 px-3 py-2 border-bottom">
        <button
          ref={selectAllRef}
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={() => onSelectAll()}
        >
          Select all
        </button>

        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => {
            onClear();
            if (closeOnClear) {
              setOpen(false);
              btnRef.current?.focus();
            }
          }}
        >
          Clear
        </button>
      </div>

      <div className="p-3" style={{ maxHeight: 320, overflow: "auto" }}>
        {options.map((opt) => {
          const checked = selected.includes(opt.value);
          const checkboxId = `${id}-${opt.value.replace(/\s+/g, "-").toLowerCase()}`;

          return (
            <label
              key={opt.value}
              htmlFor={checkboxId}
              className={`
                d-flex align-items-start gap-2
                cursor-pointer select-none
                m-b-sm
              `}
              style={{ fontSize: "1rem" }}
            >
              <input
                id={checkboxId}
                data-opt="true"
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(opt.value)}
                onKeyDown={(e) => {
                  // ✅ Enter toggles (Space already works natively)
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onToggle(opt.value);
                  }
                }}
                className="h-5 w-5 mt-0.5"
                style={{
                  border: '2px solid #595959',
                  accentColor: '#0d4cd3',
                }}
              />
              <span className="text-normal" style={{ fontSize: "1rem" }}>
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div>
      <label id={`${id}-label`} className="form-label" htmlFor={id}>
        <span className="d-inline-flex align-items-center">{labelNode ?? label}</span>
      </label>

      <button
        id={id}
        ref={btnRef}
        type="button"
        className="form-select d-flex justify-content-between align-items-center"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{ minHeight: 44, fontSize: "1rem" }}
      >
        <span className={selectedCount === 0 ? "text-muted" : ""} style={{ fontSize: "1rem" }}>
          {buttonText}
        </span>

        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M5.5 7.5L10 12l4.5-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? createPortal(menu, document.body) : null}
    </div>
  );
}