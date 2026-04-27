'use client';

// One option row inside a step — for items WITHOUT variants.
//
// Layout: [drag] [thumb] [name + default badge] [upcharge chip / inclus] [edit] [remove]

import { GripVertical, Pin, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { ComboOptionView } from './types';

interface Props {
  option: ComboOptionView;
  onUpchargeChange: (next: number) => void;
  onRemove: () => void;
  onSetDefault: () => void;
}

export default function OptionRow({ option, onUpchargeChange, onRemove, onSetDefault }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md bg-[var(--surface-2)] border border-[var(--line)]">
      <span className="text-[var(--fg-subtle)] cursor-grab" aria-hidden>
        <GripVertical className="w-3.5 h-3.5" />
      </span>
      <Thumb url={option.imageUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-fs-sm font-medium text-[var(--fg)] truncate">{option.itemName}</span>
          {option.isDefault && (
            <span className="inline-flex items-center gap-1 text-fs-xs px-1.5 h-[18px] rounded-r-sm bg-[color-mix(in_oklab,#2563eb_14%,transparent)] text-[#60a5fa] border border-[color-mix(in_oklab,#2563eb_30%,transparent)]">
              <Pin className="w-2.5 h-2.5" /> {t('composeDefaultBadge')}
            </span>
          )}
        </div>
      </div>

      {/* Upcharge: pill (collapsed) → inline number input (editing) */}
      {editing ? (
        <div className="flex items-center h-7 px-2 rounded-r-sm border border-[var(--brand-500)] bg-[var(--surface)]">
          <input
            type="number"
            min={0}
            step="0.50"
            autoFocus
            value={option.upcharge}
            onChange={(e) => onUpchargeChange(Math.max(0, parseFloat(e.target.value) || 0))}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false); }}
            className="w-16 bg-transparent border-none outline-none text-end text-fs-sm tabular-nums text-[var(--brand-500)] font-semibold"
          />
          <span className="text-fs-xs text-[var(--fg-muted)] ms-1">₪</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`inline-flex items-center h-[22px] px-2 rounded-r-sm text-fs-xs font-medium transition-colors hover:bg-[var(--surface-3)] ${
            option.upcharge > 0
              ? 'bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-500)]'
              : 'text-[var(--fg-muted)]'
          }`}
        >
          {option.upcharge > 0 ? `+₪${option.upcharge.toFixed(2)}` : t('composeIncluded')}
        </button>
      )}

      {!option.isDefault && (
        <button
          type="button"
          onClick={onSetDefault}
          title={t('composeSetDefault')}
          className="text-fs-xs text-[var(--brand-500)] hover:underline whitespace-nowrap"
        >
          {t('composeSetDefault')}
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-500)]"
        aria-label="Remove"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  if (url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={url} alt="" className="w-7 h-7 rounded-r-sm object-cover bg-[var(--surface-3)] shrink-0" />;
  }
  return (
    <div
      className="w-7 h-7 rounded-r-sm shrink-0"
      style={{
        background: 'var(--surface-3)',
        backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--fg) 14%, transparent) 0 4px, transparent 4px 8px)',
      }}
      aria-hidden
    />
  );
}
