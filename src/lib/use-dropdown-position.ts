'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

export interface DropdownPos {
  top: number;
  left: number;
}

/**
 * Computes a fixed-position anchor for a portal dropdown rendered below a
 * trigger button. The menu is end-aligned with the trigger (right edge in LTR,
 * left edge in RTL — read from the document dir attribute) and clamped inside
 * the viewport so it never overflows either screen edge. Recomputes on
 * scroll/resize while open.
 */
export function useDropdownPosition(
  buttonRef: RefObject<HTMLElement | null>,
  open: boolean,
  menuWidth: number,
): DropdownPos | null {
  const [pos, setPos] = useState<DropdownPos | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const compute = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const isRtl = document.documentElement.dir === 'rtl';
      let left = isRtl ? rect.left : rect.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      setPos({ top: rect.bottom + 4, left });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, buttonRef, menuWidth]);

  return pos;
}
