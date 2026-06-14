'use client';

import { ProductionDay } from '@/lib/api';

interface Props {
  date: string; // YYYY-MM-DD
  days: ProductionDay[]; // ascending days that have orders (used for the order-count hint)
  onChange: (date: string) => void;
}

/** Shift a YYYY-MM-DD string by `delta` calendar days. Uses UTC math so it never
 *  drifts across DST / timezone boundaries the way `new Date('YYYY-MM-DD')` can. */
function shiftISODate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Prev/next stepper that walks one calendar day at a time (any date is reachable),
 *  plus a raw date input. Surfaces a small badge when the selected day has orders. */
export function DateStepper({ date, days, onChange }: Props) {
  const orderCount = days.find((d) => d.date === date)?.order_count ?? 0;

  return (
    <div className="inline-flex items-center gap-[var(--s-2)] bg-[var(--surface)] border border-[var(--line)] rounded-r-lg px-[var(--s-2)] py-[var(--s-1)]">
      <button
        type="button"
        onClick={() => onChange(shiftISODate(date, -1))}
        className="w-7 h-7 inline-flex items-center justify-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
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
      {orderCount > 0 && (
        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[var(--brand-50)] text-[var(--brand-500)] text-fs-micro font-semibold tabular-nums">
          {orderCount}
        </span>
      )}
      <button
        type="button"
        onClick={() => onChange(shiftISODate(date, 1))}
        className="w-7 h-7 inline-flex items-center justify-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
        aria-label="Next day"
      >
        ›
      </button>
    </div>
  );
}
