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
/**
 * The block's chrome for customer, delivery and money sections.
 *
 * Exported so adjacent context primitives can align their own chrome with the
 * same narrow-column rhythm without wrapping interactive headings in buttons.
 */
export const CONTEXT_BLOCK_SHELL =
  'py-[var(--s-3)] first:pt-0 border-t border-[var(--line)] first:border-t-0';

/** The block's eyebrow. Same reason. */
export const CONTEXT_BLOCK_EYEBROW =
  'text-[11px] leading-4 font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)]';

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
    <section className={cn(CONTEXT_BLOCK_SHELL, className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-[var(--s-3)] mb-[var(--s-2)]">
          {label && <span className={CONTEXT_BLOCK_EYEBROW}>{label}</span>}
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
    <div className={cn('flex items-start justify-between gap-[var(--s-3)] text-fs-sm leading-5', className)}>
      <span className="text-[var(--fg-subtle)] shrink-0">{label}</span>
      <span className="text-end break-words min-w-0">{children}</span>
    </div>
  );
}
