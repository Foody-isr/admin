'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A block in the context column: an eyebrow and its body, separated from the
 * next by a rule rather than boxed in a card.
 *
 * The old right column stacked six `Section` cards — customer, address, courier,
 * total, invoice, notes — in a 340px lane, so the eye met six borders and six
 * shadows before reaching any content. In a column this narrow the cards were
 * doing no grouping work the headings did not already do.
 */
export function ContextBlock({
  label,
  aside,
  children,
  className,
}: {
  label?: React.ReactNode;
  /** Right-hand affordance on the heading row, e.g. a quiet link. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'py-[var(--s-4)] first:pt-0 border-t border-[var(--line)] first:border-t-0',
        className,
      )}
    >
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-[var(--s-3)] mb-[var(--s-3)]">
          {label && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--fg-subtle)]">
              {label}
            </span>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** A label/value pair. Values are `text-end` so they stack down the column. */
export function ContextRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-[var(--s-3)] text-fs-sm', className)}>
      <span className="text-[var(--fg-subtle)] shrink-0">{label}</span>
      <span className="text-end break-words min-w-0">{children}</span>
    </div>
  );
}
