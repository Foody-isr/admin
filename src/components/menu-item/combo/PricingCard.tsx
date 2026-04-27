'use client';

// Pricing model card for the Composition tab. Holds:
//   • segmented mode picker (only "Fixed" enabled in v1)
//   • base price + computed range + savings vs solo
//
// `basePrice` is the canonical "Prix" field already on the MenuItem record;
// we just expose its label here as "Prix de base" since that's what it
// represents for combos.

import { Pin, Layers, DollarSign, Info } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Chip } from '@/components/ds';
import type { ComboStepDraft } from './types';
import { computePriceRange, computeSoldSeparately, type PricingMode } from './pricing';

interface Props {
  basePrice: string;
  onBasePriceChange: (next: string) => void;
  steps: ComboStepDraft[];
  itemsById: Map<number, MenuItem>;
  pricingMode: PricingMode;
  onPricingModeChange: (next: PricingMode) => void;
}

export default function PricingCard({
  basePrice, onBasePriceChange, steps, itemsById, pricingMode, onPricingModeChange,
}: Props) {
  const { t } = useI18n();
  const baseNum = parseFloat(basePrice) || 0;
  const range = computePriceRange(baseNum, steps);
  const solo = computeSoldSeparately(steps, itemsById);

  const savingsMin = Math.max(0, solo.min - range.min);
  const savingsMax = Math.max(0, solo.max - range.max);
  const savingsPct = solo.min > 0 ? Math.round((savingsMin / solo.min) * 100) : 0;
  const showSavings = solo.min > 0;

  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 p-[var(--s-4)]">
      <div className="flex items-start justify-between gap-[var(--s-3)] mb-[var(--s-4)] flex-wrap">
        <div>
          <div className="text-fs-md font-semibold text-[var(--fg)]">{t('composePricingTitle')}</div>
          <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{t('composePricingSubtitle')}</div>
        </div>
        <div className="flex items-center gap-[var(--s-2)] flex-wrap">
          <Chip
            active={pricingMode === 'fixed'}
            onClick={() => onPricingModeChange('fixed')}
            leading={<Pin className="w-3 h-3" />}
          >
            {t('composePricingFixed')}
          </Chip>
          <Chip
            active={pricingMode === 'sumMinusPercent'}
            disabled
            title={t('composePricingSoon')}
            leading={<Layers className="w-3 h-3" />}
          >
            {t('composePricingSumPercent')}
          </Chip>
          <Chip
            active={pricingMode === 'sumMinusFixed'}
            disabled
            title={t('composePricingSoon')}
            leading={<DollarSign className="w-3 h-3" />}
          >
            {t('composePricingSumFixed')}
          </Chip>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-4)]">
        <div className="flex flex-col gap-1.5">
          <span className="text-fs-xs font-semibold uppercase tracking-[.04em] text-[var(--fg-subtle)]">
            {t('composeBasePriceLabel')}
          </span>
          <div className="flex items-center h-9 px-[var(--s-3)] rounded-r-md bg-[var(--surface)] border border-[var(--line-strong)] focus-within:border-[var(--brand-500)] focus-within:shadow-ring">
            <input
              type="number"
              min={0}
              step="0.50"
              value={basePrice}
              onChange={(e) => onBasePriceChange(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent border-none outline-none text-fs-sm tabular-nums"
            />
            <span className="text-fs-sm text-[var(--fg-muted)]">₪</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-fs-xs font-semibold uppercase tracking-[.04em] text-[var(--fg-subtle)]">
            {t('composePriceRange')}
          </span>
          <div className="flex items-center h-9 px-[var(--s-3)] rounded-r-md bg-[var(--surface-2)] border border-[var(--line)] tabular-nums text-fs-sm font-medium">
            {range.static
              ? <>₪{range.min.toFixed(2)}</>
              : <>₪{range.min.toFixed(2)} – ₪{range.max.toFixed(2)}</>
            }
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-fs-xs font-semibold uppercase tracking-[.04em] text-[var(--fg-subtle)]">
            {t('composeSavings')}
          </span>
          <div
            className="flex items-center h-9 px-[var(--s-3)] rounded-r-md tabular-nums text-fs-sm font-semibold"
            style={{
              background: showSavings && savingsMin > 0
                ? 'color-mix(in oklab, var(--success-500) 10%, transparent)'
                : 'var(--surface-2)',
              border: '1px solid ' + (showSavings && savingsMin > 0
                ? 'color-mix(in oklab, var(--success-500) 30%, transparent)'
                : 'var(--line)'),
              color: showSavings && savingsMin > 0
                ? 'var(--success-500)'
                : 'var(--fg-muted)',
            }}
          >
            {!showSavings ? '—' : (
              savingsMin === savingsMax
                ? <>−₪{savingsMin.toFixed(2)} · {savingsPct}%</>
                : <>−₪{savingsMin.toFixed(2)} … −₪{savingsMax.toFixed(2)}</>
            )}
          </div>
        </div>
      </div>

      <p className="text-fs-xs text-[var(--fg-subtle)] mt-[var(--s-3)] flex items-start gap-1.5">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>{t('composePriceAutoExplain')}</span>
      </p>
    </div>
  );
}
