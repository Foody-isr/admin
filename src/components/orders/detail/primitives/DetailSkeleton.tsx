'use client';

import { Skeleton } from '@/components/ds';

/**
 * Loading placeholder for the three zones.
 *
 * The order detail had none. `isLoading` only disabled the footer buttons, and
 * the production page went further: with its order still loading it rendered a
 * *closed* dialog, so clicking a row on a slow connection appeared to do
 * nothing at all.
 *
 * The blocks are sized to the real content's boxes so nothing jumps when the
 * order lands.
 */
export function DetailSkeleton() {
  return (
    <div className="flex-1 min-h-0 flex flex-col md:grid md:[grid-template-columns:minmax(0,1fr)_320px] lg:[grid-template-columns:288px_minmax(0,1fr)_360px] xl:[grid-template-columns:300px_minmax(0,1fr)_384px]">
      {/* Spine */}
      <aside className="hidden lg:flex lg:flex-col gap-[var(--s-6)] border-e border-[var(--line)] px-[var(--s-5)] py-[var(--s-5)]">
        <div className="flex flex-col gap-[var(--s-4)]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-[var(--s-3)]">
              <Skeleton className="w-7 h-7 rounded-full shrink-0" />
              <div className="flex flex-col gap-1.5 pt-1 flex-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Centre — the ticket's own grid, so the money lane is already in place */}
      <main className="min-w-0 bg-[var(--surface)] px-[var(--s-4)] md:px-[var(--s-6)] xl:px-[var(--s-8)] py-[var(--s-5)]">
        <div className="flex items-center justify-between pb-[var(--s-4)]">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-3 w-full mb-[var(--s-4)]" />
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

      {/* Context */}
      <aside className="min-w-0 bg-[var(--surface)] md:border-s border-[var(--line)] px-[var(--s-4)] md:px-[var(--s-5)] py-[var(--s-5)]">
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
  );
}
