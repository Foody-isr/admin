'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Empty state: an icon, a line saying what is not here, and optionally the one
 * action that would change that.
 *
 * The app had no convention — every screen hand-rolled
 * `flex flex-col items-center justify-center py-20` with its own spacing — and
 * several surfaces had no empty state at all (the order detail's item list and
 * activity timeline both rendered an empty box). This is the shared shape.
 *
 * An empty screen is an invitation to act, so lead with what the reader can do
 * rather than apologising for the absence.
 */
// `title` is omitted from the DOM attributes: HTMLAttributes types it as a
// string (the tooltip attribute), and here it is the heading node.
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A lucide icon element. Sized here — do not pass size classes. */
  icon?: React.ReactNode;
  /** What is not here. One short line, sentence case. */
  title: React.ReactNode;
  /** Optional second line: why, or what to do about it. */
  desc?: React.ReactNode;
  /** The single action that resolves the emptiness. */
  action?: React.ReactNode;
  /** `compact` suits a panel inside a column; `default` suits a page. */
  size?: 'compact' | 'default';
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, desc, action, size = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'compact' ? 'py-[var(--s-8)] gap-[var(--s-2)]' : 'py-[var(--s-16)] gap-[var(--s-3)]',
        className,
      )}
      {...props}
    >
      {icon && (
        <div
          aria-hidden
          className="text-[var(--fg-subtle)] [&_svg]:w-6 [&_svg]:h-6 [&_svg]:shrink-0"
        >
          {icon}
        </div>
      )}
      <div className="text-fs-sm font-medium text-[var(--fg)]">{title}</div>
      {desc && (
        <div className="text-fs-xs text-[var(--fg-subtle)] max-w-[42ch] text-balance">{desc}</div>
      )}
      {action && <div className="mt-[var(--s-2)]">{action}</div>}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
