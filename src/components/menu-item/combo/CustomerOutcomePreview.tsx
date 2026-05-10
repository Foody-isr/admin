'use client';

// Customer-outcome explainer card for the bottom of the Composition tab.
// Renders sample combos derived from the first step's first option's
// variants, so the operator can see how their combo will appear in the
// customer-facing app.

import { Info } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { ComboStepDraft } from './types';
import { buildSampleCombos } from './pricing';

interface Props {
  comboName: string;
  basePrice: number;
  steps: ComboStepDraft[];
  itemsById: Map<number, MenuItem>;
}

export default function CustomerOutcomePreview({ comboName, basePrice, steps, itemsById }: Props) {
  const { t } = useI18n();
  const samples = buildSampleCombos(
    comboName || t('typeCombo'),
    basePrice,
    steps,
    itemsById,
    t('customerOutcomeBaseDefault'),
    t('customerOutcomeWithUpcharge'),
    4,
  );

  if (samples.length === 0) return null;

  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden">
      <div className="flex items-center gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)]">
        <div
          className="w-7 h-7 grid place-items-center rounded-r-sm shrink-0"
          style={{ background: 'color-mix(in oklab, var(--info-500) 14%, transparent)', color: 'var(--info-500)' }}
        >
          <Info className="w-3.5 h-3.5" />
        </div>
        <div className="text-fs-md font-semibold text-[var(--fg)]">
          {t('customerOutcomeTitle')}
        </div>
      </div>

      <div className="p-[var(--s-4)] grid grid-cols-1 sm:grid-cols-2 gap-[var(--s-3)]">
        {samples.map((sample, i) => (
          <div
            key={i}
            className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-[var(--s-3)]"
          >
            <div className="flex items-baseline justify-between gap-[var(--s-2)] mb-1">
              <div className="text-fs-sm font-semibold text-[var(--fg)] truncate">{sample.label}</div>
              <div className="text-fs-md font-bold text-[var(--fg)] tabular-nums shrink-0">₪{sample.price.toFixed(2)}</div>
            </div>
            <div className="text-fs-xs text-[var(--fg-subtle)]">{sample.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
