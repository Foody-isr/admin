'use client';

import { useMemo } from 'react';
import type { BatchCycleSummary } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * Batch-anchored picker used by the admin carte detail page when a menu has
 * `is_weekly_rotating` enabled. Mirrors the look-and-feel of the calendar
 * WeekPicker on the group-edit page but is driven by the restaurant's
 * configured BatchFulfillmentDays — each option is one batch cycle.
 */
export function BatchPicker({
  cycles,
  selectedIndex,
  onChange,
}: {
  cycles: BatchCycleSummary[];
  selectedIndex: number;
  onChange: (next: number) => void;
}) {
  const { t, locale, direction } = useI18n();

  // Derive a human label for each cycle: "Fri 12 Jun" using its first
  // fulfilment day, or the cutoff date if no fulfilment day resolves.
  const labelFor = useMemo(() => {
    return (cycle: BatchCycleSummary): string => {
      const primary = cycle.fulfillment_days?.[0];
      if (primary?.date) {
        const d = new Date(primary.date + 'T00:00:00');
        return formatBatchLabel(d, locale);
      }
      const cutoff = cycle.cutoff_at ? new Date(cycle.cutoff_at) : null;
      if (cutoff) return formatBatchLabel(cutoff, locale);
      return '—';
    };
  }, [locale]);

  const safeIndex = Math.max(0, Math.min(selectedIndex, cycles.length - 1));
  const canPrev = safeIndex > 0;
  const canNext = safeIndex < cycles.length - 1;

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <button
        type="button"
        onClick={() => canPrev && onChange(safeIndex - 1)}
        disabled={!canPrev}
        className="size-11 shrink-0 rounded-r-md border border-[var(--divider)] hover:bg-[var(--surface-subtle)] flex items-center justify-center text-fg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={t('weekPrev') || 'Previous batch'}
      >
        {direction === 'rtl' ? '›' : '‹'}
      </button>
      <select
        aria-label={t('selectBatch')}
        value={String(safeIndex)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input min-w-0 flex-1 text-sm sm:w-64"
      >
        {cycles.map((cycle, i) => {
          const label = labelFor(cycle);
          const suffix = i === 0 ? ` (${t('currentBatch') || 'current'})` : '';
          return (
            <option key={i} value={i}>
              {`${t('batchLabel')?.replace('{day}', label) || `Batch — ${label}`}${suffix}`}
            </option>
          );
        })}
      </select>
      <button
        type="button"
        onClick={() => canNext && onChange(safeIndex + 1)}
        disabled={!canNext}
        className="size-11 shrink-0 rounded-r-md border border-[var(--divider)] hover:bg-[var(--surface-subtle)] flex items-center justify-center text-fg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={t('weekNext') || 'Next batch'}
      >
        {direction === 'rtl' ? '‹' : '›'}
      </button>
    </div>
  );
}

function formatBatchLabel(d: Date, locale: string): string {
  // Compact label like "Fri 12 Jun" without dragging in a locale dep.
  const weekday = d.toLocaleDateString(locale, { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString(locale, { month: 'short' });
  return `${weekday} ${day} ${month}`;
}
