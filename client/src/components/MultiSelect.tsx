// src/components/MultiSelect.tsx
import React, { useState, useRef, useEffect } from 'react';
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

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  const selectedLabels = selected
    .map(v => options.find(o => o.value === v)?.label)
    .filter(Boolean);

  const displayText = selected.length === 0 
    ? placeholder 
    : selected.length === 1
    ? selectedLabels[0]
    : `${selected.length} selected`;

  const dropdown = open ? (
    <>
      <div
        className="position-fixed"
        style={{ 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          zIndex: 10 
        }}
        onClick={() => setOpen(false)}
      />
      <div 
        className="bg-white border shadow-sm"
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 9999,
        }}
      >
        <div className="d-flex justify-content-between gap-2 px-3 py-2 border-bottom">
          <button
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
              setOpen(false);
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
                className="d-flex align-items-start gap-2 cursor-pointer select-none m-b-sm"
                style={{ fontSize: '1rem' }}
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(option.value)}
                  className="mt-0.5"
                  style={{ 
                    width: '20px', 
                    height: '20px',
                    cursor: 'pointer'
                  }}
                />
                <span className="text-normal" style={{ fontSize: '1rem' }}>
                  {option.label}
                </span>
              </label>
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
          onClick={() => setOpen(!open)}
          className="form-select d-flex justify-content-between align-items-center"
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{ minHeight: 44, fontSize: '1rem' }}
        >
          <span className={selected.length === 0 ? 'text-muted' : ''} style={{ fontSize: '1rem' }}>
            {displayText}
          </span>
        </button>

        {open && createPortal(dropdown, document.body)}
      </div>
    </div>
  );
}