'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type KpiTone = 'default' | 'success' | 'warning' | 'danger';

export interface KpiProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { value: React.ReactNode; direction: 'up' | 'down' };
  tone?: KpiTone;
  /** Renders the card as an interactive <button> with hover state. */
  onClick?: () => void;
}

const TONE_STYLES: Record<KpiTone, { card: React.CSSProperties; value: string; sub: string }> = {
  default: {
    card: {},
    value: 'text-[var(--fg)]',
    sub: 'text-[var(--fg-subtle)]',
  },
  success: {
    card: {
      background: 'color-mix(in oklab, var(--success-500) 8%, var(--surface))',
      border: '1px solid color-mix(in oklab, var(--success-500) 30%, var(--line))',
    },
    value: 'text-[var(--success-500)]',
    sub: 'text-[var(--success-500)]',
  },
  warning: {
    card: {
      background: 'color-mix(in oklab, var(--warning-500) 8%, var(--surface))',
      border: '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))',
    },
    value: 'text-[var(--warning-500)]',
    sub: 'text-[var(--warning-500)]',
  },
  danger: {
    card: {
      background: 'color-mix(in oklab, var(--danger-500) 6%, var(--surface))',
      border: '1px solid color-mix(in oklab, var(--danger-500) 25%, var(--line))',
    },
    value: 'text-[var(--danger-500)]',
    sub: 'text-[var(--danger-500)]',
  },
};

export function Kpi({
  label,
  value,
  sub,
  delta,
  tone = 'default',
  onClick,
  className,
  style,
  ...props
}: KpiProps) {
  const toneStyle = TONE_STYLES[tone];
  const interactive = typeof onClick === 'function';

  const baseClasses = cn(
    'relative overflow-hidden text-left',
    'rounded-r-lg p-[var(--s-5)]',
    'flex flex-col gap-[var(--s-3)]',
    tone === 'default' && 'bg-[var(--surface)] border border-[var(--line)]',
    interactive && 'transition-all hover:border-[var(--line-strong)] hover:shadow-2',
    className,
  );

  const content = (
    <>
      <div className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div className={cn('text-fs-3xl font-semibold leading-none tabular-nums', toneStyle.value)}>
        {value}
      </div>
      {(sub || delta) && (
        <div className="flex items-center gap-[var(--s-2)] text-fs-xs">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium tabular-nums',
                delta.direction === 'up'
                  ? 'text-[var(--success-500)] dark:text-[#4ade80]'
                  : 'text-[var(--danger-500)] dark:text-[#fb7185]',
              )}
            >
              {delta.direction === 'up' ? '↑' : '↓'} {delta.value}
            </span>
          )}
          {sub && <span className={toneStyle.sub}>{sub}</span>}
        </div>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={baseClasses}
        style={{ ...toneStyle.card, ...style }}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClasses} style={{ ...toneStyle.card, ...style }} {...props}>
      {content}
    </div>
  );
}
