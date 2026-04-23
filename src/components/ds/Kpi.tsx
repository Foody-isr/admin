'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface KpiProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { value: React.ReactNode; direction: 'up' | 'down' };
}

export function Kpi({ label, value, sub, delta, className, ...props }: KpiProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'bg-[var(--surface)] border border-[var(--line)] rounded-r-lg',
        'p-[var(--s-5)]',
        'flex flex-col gap-[var(--s-3)]',
        className,
      )}
      {...props}
    >
      <div className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
        {label}
      </div>
      <div className="text-fs-3xl font-semibold leading-none text-[var(--fg)] tabular-nums">
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
          {sub && <span className="text-[var(--fg-muted)]">{sub}</span>}
        </div>
      )}
    </div>
  );
}
