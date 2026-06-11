'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontalIcon } from 'lucide-react';
import { useDropdownPosition } from '@/lib/use-dropdown-position';

// Keep in sync with the w-48 class on the menu below.
const MENU_WIDTH = 192;

export interface RowAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
}

// RowActionsMenu — kebab menu for table row actions.
//
// The dropdown is rendered into document.body via a React portal because table
// rows live inside DataTable wrappers that use overflow-hidden (for the rounded
// corners + horizontal scrolling). With a normal `position: absolute` dropdown,
// any action below the button got visually clipped — typically the "Supprimer"
// row stayed invisible. Fixed positioning + portal escapes that clipping while
// the button keeps its in-flow layout.
//
// Position is recomputed on open and on scroll/resize so the menu stays
// pinned to the button as the user scrolls or the viewport changes size.
export default function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pos = useDropdownPosition(buttonRef, open, MENU_WIDTH);

  // Close on outside click — guard both the button and the portal-rendered
  // menu so clicking inside the menu doesn't immediately dismiss it.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape so the menu is keyboard-friendly.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] text-fg-primary transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontalIcon className="w-5 h-5" />
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: 'fixed', top: pos.top, left: pos.left }}
              className="w-48 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-[100]"
              onClick={(e) => e.stopPropagation()}
            >
              {actions.map((action, i) => {
                const isDanger = action.variant === 'danger';
                return (
                  <button
                    key={i}
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      action.onClick();
                    }}
                    className={`w-full text-start px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
                      isDanger
                        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                        : 'text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    } ${i > 0 ? 'border-t border-neutral-200 dark:border-neutral-700' : ''}`}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
