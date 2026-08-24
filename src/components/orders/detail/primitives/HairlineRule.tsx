'use client';

import { cn } from '@/lib/utils';
import { TICKET_RULE_ROW } from './layout';

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
    <div className={cn(TICKET_RULE_ROW, className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-subtle)] whitespace-nowrap">
        {label}
      </span>
      {/*
        --line on --surface is nearly invisible in the dark theme (#2d2a26 on
        #1a1917), so the rule steps up to --line-strong there. This is the one
        place the two themes genuinely need different tokens.
      */}
      <span
        aria-hidden
        className="flex-1 h-px bg-[var(--line)] dark:bg-[var(--line-strong)]"
      />
      {count != null && (
        <span className="num text-[10px] text-[var(--fg-subtle)] shrink-0">{count}</span>
      )}
    </div>
  );
}
