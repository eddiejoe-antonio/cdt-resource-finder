// src/components/Tooltip.tsx
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  text: string;
  ariaLabel?: string;
  className?: string;
};

export function Tooltip({
  text,
  ariaLabel = "More info",
  className,
}: Props) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;

    const updatePosition = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      
      // Position tooltip directly above the icon, offset by just 8px
      setPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2, // Center on icon
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

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (bubbleRef.current?.contains(t)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const bubble = open ? (
    <div
      ref={bubbleRef}
      id={id}
      role="tooltip"
      className="bg-white border rounded shadow-lg p-3"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -100%)', // Center horizontally and position above
        zIndex: 10000,
        width: '90vw',
        maxWidth: '280px',
        fontSize: '0.875rem',
        lineHeight: 1.5,
        pointerEvents: 'auto',
      }}
    >
      {/* Caret pointing down at icon */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid white',
        }}
      />
      <div>{text}</div>
    </div>
  ) : null;

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="border-0 bg-transparent p-1 ms-2 rounded"
        style={{
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        <span
          className="ca-gov-icon-info"
          aria-hidden="true"
          style={{ fontSize: "1.1rem", lineHeight: 1, color: "#72717c" }}
        />
      </button>

      {open ? createPortal(bubble, document.body) : null}
    </span>
  );
}