'use client';

import { cn } from '@/lib/utils';
import styles from '../order-detail.module.css';

/**
 * A category heading on the ticket: label, rule, count.
 *
 * Replaces the tinted full-width bar the drawer used. On a printed ticket a
 * section is announced by a rule, not by a filled band — the rule *is* the
 * header, and it leaves the page quiet enough that the item names carry the
 * hierarchy on their own.
 *
 * The label is mono and letter-spaced: this is the printer's voice, distinct
 * from the item names below it, and it holds its own without a background.
 */
export function HairlineRule({
  label,
  count,
  className,
}: {
  label: string;
  /** Right-hand figure: how many lines this section holds, or — when the ticket
   *  is a single section — its whole summary, since there is nothing else for
   *  that number to be confused with. */
  count?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(styles.itemHeading, className)}>
      <span className="text-[18px] leading-[26px] font-semibold">
        {label}
      </span>
      {count != null && (
        <span className="text-fs-xs leading-4 tabular-nums text-[var(--fg-subtle)] shrink-0">{count}</span>
      )}
    </div>
  );
}
