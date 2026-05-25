'use client';

import { ProductionDay } from '@/lib/api';

interface Props {
  date: string; // YYYY-MM-DD
  days: ProductionDay[]; // ascending days that have orders
  onChange: (date: string) => void;
}

/** Prev/next stepper that jumps between days with scheduled orders, plus a raw date input. */
export function DateStepper({ date, days, onChange }: Props) {
  const idx = days.findIndex((d) => d.date === date);
  const prev = idx > 0 ? days[idx - 1].date : null;
  const next = idx >= 0 && idx < days.length - 1 ? days[idx + 1].date : null;

  return (
    <div className="inline-flex items-center gap-[var(--s-2)] bg-[var(--surface)] border border-[var(--line)] rounded-r-lg px-[var(--s-2)] py-[var(--s-1)]">
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && onChange(prev)}
        className="w-7 h-7 inline-flex items-center justify-center rounded-r-sm text-[var(--fg-muted)] disabled:opacity-30 hover:bg-[var(--surface-2)]"
        aria-label="Previous day"
      >
        ‹
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="bg-transparent text-fs-sm font-semibold tabular-nums outline-none"
      />
      <button
        type="button"
        disabled={!next}
        onClick={() => next && onChange(next)}
        className="w-7 h-7 inline-flex items-center justify-center rounded-r-sm text-[var(--fg-muted)] disabled:opacity-30 hover:bg-[var(--surface-2)]"
        aria-label="Next day"
      >
        ›
      </button>
    </div>
  );
}
