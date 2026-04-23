'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, active, leading, trailing, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 h-[30px] px-[var(--s-3)]',
        'rounded-r-xl border text-fs-sm font-medium whitespace-nowrap',
        'transition-colors duration-fast ease-out',
        active
          ? 'bg-[var(--brand-500)] text-white border-[var(--brand-500)]'
          : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--line)] hover:text-[var(--fg)] hover:border-[var(--line-strong)]',
        className,
      )}
      {...props}
    >
      {leading}
      {children}
      {trailing}
    </button>
  ),
);
Chip.displayName = 'Chip';
