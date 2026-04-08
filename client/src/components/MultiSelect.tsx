// src/components/MultiSelect.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export type SelectOption<T extends string> = { value: T; label: string };

export function MultiSelect<T extends string>({
  id,
  label,
  labelNode,
  placeholder = "Select options...",
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  id?: string;
  label?: string;
  labelNode?: React.ReactNode;
  placeholder?: string;
  options: readonly SelectOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  // Move focus to "Select all" when the menu opens
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => selectAllRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Close on outside mousedown only — Tab-out is handled by onMenuKeyDown
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  function openMenu() {
    updatePosition();
    setOpen(true);
  }

  function closeMenu(returnFocus = true) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  // Keyboard handler on the dropdown panel
  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const focusable = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          'button, input[type="checkbox"]'
        ) ?? []
      );
      const idx = focusable.findIndex((el) => el === document.activeElement);
      if (e.key === 'ArrowDown') {
        focusable[Math.min(focusable.length - 1, idx + 1)]?.focus();
      } else {
        focusable[Math.max(0, idx - 1)]?.focus();
      }
    }
    // Tab: close without grabbing focus — let the browser move naturally
    if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const selectedLabels = selected
    .map(v => options.find(o => o.value === v)?.label)
    .filter(Boolean);

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selectedLabels[0]
      : `${selected.length} selected`;

  const labelId = id ? `${id}-label` : undefined;
  const menuId = id ? `${id}-menu` : undefined;

  const dropdown = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelId}
      className="bg-white border shadow-sm"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: position.width,
        zIndex: 9999,
      }}
      onKeyDown={onMenuKeyDown}
    >
      <div className="d-flex justify-content-between gap-2 px-3 py-2 border-bottom">
        <button
          ref={selectAllRef}
          type="button"
          onClick={onSelectAll}
          className="btn btn-sm btn-outline-primary"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => {
            onClear();
            closeMenu(true);
          }}
          className="btn btn-sm btn-outline-secondary"
        >
          Clear
        </button>
      </div>

      <div className="p-2" style={{ maxHeight: '320px', overflow: 'auto' }}>
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          const checkboxId = `${id}-${option.value.replace(/\s+/g, '-').toLowerCase()}`;

          return (
            <label
              key={option.value}
              htmlFor={checkboxId}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                marginBottom: '0.375rem',
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(option.value)}
                onKeyDown={(e) => {
                  // Enter toggles; Space already works natively
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onToggle(option.value);
                  }
                }}
                style={{
                  width: '20px',
                  height: '20px',
                  flexShrink: 0,
                  marginTop: '2px',
                  cursor: 'pointer',
                  accentColor: '#0d4cd3',
                }}
              />
              <span style={{ fontSize: '1rem' }}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="w-full">
      {(label || labelNode) && (
        <label className="form-label" htmlFor={id} id={labelId}>
          {labelNode || label}
        </label>
      )}

      <div className="position-relative">
        <button
          ref={buttonRef}
          id={id}
          type="button"
          onClick={() => (open ? closeMenu(false) : openMenu())}
          onKeyDown={(e) => {
            if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !open) {
              e.preventDefault();
              openMenu();
            }
            if (e.key === 'Escape' && open) {
              e.preventDefault();
              closeMenu(true);
            }
          }}
          className="form-control d-flex justify-content-between align-items-center"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          style={{ minHeight: 44, fontSize: '1rem' }}
        >
          <span
            className={selected.length === 0 ? 'text-muted' : ''}
            style={{ fontSize: '1rem' }}
          >
            {displayText}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            aria-hidden="true"
            style={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 120ms ease',
              flexShrink: 0,
            }}
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

        {open && createPortal(dropdown, document.body)}
      </div>
    </div>
  );
}