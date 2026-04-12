'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';

export interface RowAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
}

export default function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1.5 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] text-fg-primary transition-colors"
      >
        <EllipsisHorizontalIcon className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden z-30">
          {actions.map((action, i) => {
            const isDanger = action.variant === 'danger';
            return (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  action.onClick();
                }}
                className={`w-full text-left px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
                  isDanger
                    ? 'text-red-500 hover:bg-red-500/10'
                    : 'hover:bg-[var(--surface-subtle)]'
                } ${i > 0 ? 'border-t border-[var(--divider)]' : ''}`}
              >
                {action.icon}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
