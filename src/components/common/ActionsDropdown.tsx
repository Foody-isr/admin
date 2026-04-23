'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export interface ActionItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

export default function ActionsDropdown({
  label,
  actions,
}: {
  label?: string;
  actions: ActionItem[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (actions.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-secondary rounded-full px-5 py-2 flex items-center gap-2"
      >
        {label ?? t('actions')} <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden z-30">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={`flex items-center gap-2 w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors ${
                i > 0 ? 'border-t border-[var(--divider)]' : ''
              }`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
