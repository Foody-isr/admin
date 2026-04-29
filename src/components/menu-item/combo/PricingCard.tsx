'use client';

// Pricing model card for the Composition tab. Holds:
//   • segmented mode picker (only "Fixed" enabled in v1)
//   • base price + computed range + savings vs solo
//
// `basePrice` is the canonical "Prix" field already on the MenuItem record;
// we just expose its label here as "Prix de base" since that's what it
// represents for combos.

import { Pin, Layers, DollarSign, Info, AlertTriangle } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Chip } from '@/components/ds';
import type { ComboStepDraft } from './types';
import { computeComboSavings, type PricingMode } from './pricing';

interface Props {
  basePrice: string;
  onBasePriceChange: (next: string) => void;
  steps: ComboStepDraft[];
  itemsById: Map<number, MenuItem>;
  pricingMode: PricingMode;
  onPricingModeChange: (next: PricingMode) => void;
  /** Optional drilldown — when set, the savings cell becomes a button that
   *  calls this on click (the host page opens the breakdown modal). */
  onShowSavingsDetail?: () => void;
}

export default function PricingCard({
  basePrice, onBasePriceChange, steps, itemsById, pricingMode, onPricingModeChange,
  onShowSavingsDetail,
}: Props) {
  const { t } = useI18n();
  const baseNum = parseFloat(basePrice) || 0;
  const summary = computeComboSavings(baseNum, steps, itemsById);

  // Three states for the savings cell:
  //   • unknown: items haven't loaded — no comparison possible. Render "—".
  //   • saves:   savingsMax > 0 — combo cheaper than solo in at least the
  //     pricier scenarios. We key off savingsMax (not savingsMin) so a combo
  //     that breaks even at the cheapest pick but saves money elsewhere still
  //     surfaces the upside.
  //   • costs more: savingsMin < 0 — combo MORE expensive than solo in at
  //     least one scenario (operator misconfiguration warning).
  const savingsState: 'unknown' | 'saves' | 'costs-more' | 'even' =
    summary.unknown ? 'unknown'
    : summary.savingsMax > 0 ? 'saves'
    : summary.savingsMin < 0 ? 'costs-more'
    : 'even';
  const absSaveMin = Math.abs(summary.savingsMin);
  const absSaveMax = Math.abs(summary.savingsMax);
  const absSavePct = Math.round(Math.abs(summary.savingsPct));
  const detailable = !!onShowSavingsDetail && (savingsState === 'saves' || savingsState === 'costs-more');

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
            {summary.comboMin === summary.comboMax
              ? <>₪{summary.comboMin.toFixed(2)}</>
              : <>₪{summary.comboMin.toFixed(2)} – ₪{summary.comboMax.toFixed(2)}</>
            }
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-fs-xs font-semibold uppercase tracking-[.04em] text-[var(--fg-subtle)]">
            {t('composeSavings')}
          </span>
          {(() => {
            const cellClass = `flex items-center gap-1.5 h-9 px-[var(--s-3)] rounded-r-md tabular-nums text-fs-sm font-semibold ${
              detailable ? 'cursor-pointer hover:brightness-110' : ''
            }`;
            const cellStyle: React.CSSProperties = {
              background: savingsState === 'saves'
                ? 'color-mix(in oklab, var(--success-500) 10%, transparent)'
                : savingsState === 'costs-more'
                  ? 'color-mix(in oklab, var(--warning-500) 10%, transparent)'
                  : 'var(--surface-2)',
              border: '1px solid ' + (
                savingsState === 'saves'
                  ? 'color-mix(in oklab, var(--success-500) 30%, transparent)'
                  : savingsState === 'costs-more'
                    ? 'color-mix(in oklab, var(--warning-500) 30%, transparent)'
                    : 'var(--line)'
              ),
              color: savingsState === 'saves'
                ? 'var(--success-500)'
                : savingsState === 'costs-more'
                  ? 'var(--warning-500)'
                  : 'var(--fg-muted)',
            };
            const inner = (
              <>
                {savingsState === 'unknown' && <>—</>}
                {savingsState === 'even' && <>±₪0 · 0%</>}
                {savingsState === 'saves' && (
                  absSaveMin === absSaveMax
                    ? <>−₪{absSaveMin.toFixed(2)} · {absSavePct}%</>
                    : (absSaveMin === 0
                        ? <>₪0 … −₪{absSaveMax.toFixed(2)}</>
                        : <>−₪{absSaveMin.toFixed(2)} … −₪{absSaveMax.toFixed(2)}</>)
                )}
                {savingsState === 'costs-more' && (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {absSaveMin === absSaveMax
                      ? <>+₪{absSaveMin.toFixed(2)} · {absSavePct}%</>
                      : (absSaveMin === 0
                          ? <>₪0 … +₪{absSaveMax.toFixed(2)}</>
                          : <>+₪{absSaveMin.toFixed(2)} … +₪{absSaveMax.toFixed(2)}</>)}
                  </>
                )}
              </>
            );
            return detailable ? (
              <button
                type="button"
                onClick={onShowSavingsDetail}
                title={t('savingsBreakdownDetailButton')}
                className={cellClass}
                style={cellStyle}
              >
                {inner}
              </button>
            ) : (
              <div className={cellClass} style={cellStyle}>{inner}</div>
            );
          })()}
        </div>
      </div>

      <p className="text-fs-xs text-[var(--fg-subtle)] mt-[var(--s-3)] flex items-start gap-1.5">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>{t('composePriceAutoExplain')}</span>
      </p>
    </div>
  );
}
