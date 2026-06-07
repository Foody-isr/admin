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
  const { t } = useI18n();

  // Derive a human label for each cycle: "Fri 12 Jun" using its first
  // fulfilment day, or the cutoff date if no fulfilment day resolves.
  const labelFor = useMemo(() => {
    return (cycle: BatchCycleSummary): string => {
      const primary = cycle.fulfillment_days?.[0];
      if (primary?.date) {
        const d = new Date(primary.date + 'T00:00:00');
        return formatBatchLabel(d);
      }
      const cutoff = cycle.cutoff_at ? new Date(cycle.cutoff_at) : null;
      if (cutoff) return formatBatchLabel(cutoff);
      return '—';
    };
  }, []);

  const safeIndex = Math.max(0, Math.min(selectedIndex, cycles.length - 1));
  const canPrev = safeIndex > 0;
  const canNext = safeIndex < cycles.length - 1;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => canPrev && onChange(safeIndex - 1)}
        disabled={!canPrev}
        className="w-8 h-8 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] flex items-center justify-center text-fg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={t('weekPrev') || 'Previous batch'}
      >
        ‹
      </button>
      <select
        value={String(safeIndex)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input-sm text-sm min-w-[14rem]"
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
        className="w-8 h-8 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] flex items-center justify-center text-fg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={t('weekNext') || 'Next batch'}
      >
        ›
      </button>
    </div>
  );
}

function formatBatchLabel(d: Date): string {
  // Compact label like "Fri 12 Jun" without dragging in a locale dep.
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday} ${day} ${month}`;
}
