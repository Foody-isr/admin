'use client';

import { Skeleton } from '@/components/ds';
import {
  DETAIL_BODY_GRID,
  DETAIL_TICKET_COLUMN,
  DETAIL_MAIN_TRACK,
  DETAIL_CONTEXT_TRACK,
  DETAIL_RIBBON_BAND,
  TICKET_RULE_ROW,
} from './layout';

/**
 * Loading placeholder for the takeover body.
 *
 * The order detail had none. `isLoading` only disabled the footer buttons, and
 * the production page went further: with its order still loading it rendered a
 * *closed* dialog, so clicking a row on a slow connection appeared to do
 * nothing at all.
 *
 * The blocks are sized to the real content's boxes so nothing jumps when the
 * order lands. The geometry comes from layout.ts rather than being copied:
 * it WAS copied, the two drifted, and the swap jumped.
 *
 * The scroll classes are deliberately not shared — this replaces the body while
 * loading and has nothing to scroll, so it takes the grid template but
 * overflow-hidden.
 */
export function DetailSkeleton() {
  return (
    <>
      {/* The ribbon is permanent chrome now, so it has to exist here too or the
          content swap shifts everything down by the band's height. */}
      <div className={DETAIL_RIBBON_BAND}>
        <div
          className="mx-auto w-full max-w-[960px] grid"
          style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center">
              <Skeleton className="w-7 h-7 rounded-full mb-2" />
              {/* Same reserved two-line label box as HorizontalStepper. */}
              <div className="min-h-[2.4em] flex items-start justify-center">
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-2.5 w-10 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      <div className={`${DETAIL_BODY_GRID} overflow-hidden`}>
      {/* Centre — the ticket's own grid, so the money lane is already in place */}
      <div className={DETAIL_TICKET_COLUMN}>
      <main className={DETAIL_MAIN_TRACK}>
        {/* One row, exactly HairlineRule's: label, rule, summary. The ticket
            used to open with a separate eyebrow line above this; the skeleton
            has to lose it too or the swap jumps by its height. */}
        <div className={TICKET_RULE_ROW}>
          <Skeleton className="h-3 w-16" />
          <span aria-hidden className="flex-1 h-px bg-[var(--line)] dark:bg-[var(--line-strong)]" />
          <Skeleton className="h-3 w-28" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[28px_minmax(0,1fr)_92px] gap-x-[var(--s-3)] items-baseline py-[var(--s-3)]"
          >
            <Skeleton className="h-3.5 w-5 justify-self-end" />
            <Skeleton className="h-4" style={{ width: `${45 + ((i * 13) % 35)}%` }} />
            <Skeleton className="h-3.5 w-16 justify-self-end" />
          </div>
        ))}
      </main>
      </div>

      {/* Context */}
      <aside className={DETAIL_CONTEXT_TRACK}>
        <div className="flex items-center gap-[var(--s-3)]">
          <Skeleton className="w-12 h-12 rounded-full shrink-0" />
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="flex flex-col gap-[var(--s-3)] mt-[var(--s-6)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--line)] flex items-center justify-between">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-6 w-24" />
        </div>
      </aside>
      </div>
    </>
  );
}
