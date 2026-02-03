// src/components/portalSelectUtils.ts
import { useEffect, useLayoutEffect, useState } from "react";

export function normalizeSearch(s: string) {
  return s.trim().toLowerCase();
}

export function useAnchoredPortal(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement>
) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  const recomputePos = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + window.scrollY,
      left: r.left + window.scrollX,
      width: r.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    recomputePos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onReflow() {
      recomputePos();
    }

    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return pos;
}
