'use client';

import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export interface ActionItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

// ActionsDropdown — labelled dropdown for page-level bulk actions. Mirrors
// RowActionsMenu's portal-based positioning so the menu escapes parent
// overflow:hidden clipping (typical inside DataTable wrappers and toolbars
// with rounded corners). Solid background + strong shadow so the menu reads
// clearly over busy table contents.
export default function ActionsDropdown({
  label,
  actions,
}: {
  label?: string;
  actions: ActionItem[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const compute = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="btn-secondary rounded-full px-5 py-2 flex items-center gap-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label ?? t('actions')} <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: 'fixed', top: pos.top, right: pos.right }}
              className="w-56 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-[100]"
              onClick={(e) => e.stopPropagation()}
            >
              {actions.map((action, i) => (
                <button
                  key={i}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    action.onClick();
                  }}
                  className={`flex items-center gap-2 w-full text-left px-4 py-3 text-sm text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                    i > 0 ? 'border-t border-neutral-200 dark:border-neutral-700' : ''
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
