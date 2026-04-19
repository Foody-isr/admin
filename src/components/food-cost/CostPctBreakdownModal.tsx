'use client';

import { useI18n } from '@/lib/i18n';
import { COST_THRESHOLD } from '@/lib/cost-utils';

interface Props {
  // Title item (e.g. "Salade Tuna"); optional. Omit when the modal is
  // embedded on a single-item page where the context is already visible.
  itemName?: string;
  // Raw item price (inc-VAT — same as stored on MenuItem.price).
  displayPrice: number;
  // Food cost on the basis selected by showCostsExVat.
  displayCost: number;
  // Cost % = displayCost / price-on-same-basis.
  costPct: number;
  showCostsExVat: boolean;
  vatRate: number;
  onClose: () => void;
}

// Re-usable popup that explains the food-cost % math step by step. Used
// both from the single-item Cost tab (click the Cost % KPI card) and the
// multi-item compare page (click a Cost % cell).
export default function CostPctBreakdownModal({
  itemName, displayPrice, displayCost, costPct, showCostsExVat, vatRate, onClose,
}: Props) {
  const { t } = useI18n();
  const vatMultiplier = 1 + vatRate / 100;
  const normalizedPrice = showCostsExVat ? displayPrice / vatMultiplier : displayPrice;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-modal shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        style={{ background: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
          <div>
            <h3 className="font-semibold text-fg-primary">
              {t('costPctBreakdownTitle') || 'How % Coût is calculated'}
            </h3>
            {itemName && (
              <p className="text-xs text-fg-tertiary">{itemName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          <p className="text-fg-secondary">
            {showCostsExVat
              ? (t('costPctBreakdownIntroEx') || 'Food cost % compares the item\u2019s cost and its price on an ex-VAT basis so the number reflects the true margin.')
              : (t('costPctBreakdownIntroInc') || 'Food cost % compares the item\u2019s cost and its price on an inc-VAT basis (both with VAT).')}
          </p>

          {/* Step 1: price — highlights the basis actually used by the ratio */}
          <section className="space-y-1.5">
            <h4 className="text-xs uppercase tracking-wider text-fg-secondary font-semibold">
              {t('costPctStep1') || '1. Price'}
            </h4>
            <div className="px-3 py-3 rounded-lg font-mono text-sm space-y-1" style={{ background: 'var(--surface-subtle)' }}>
              <div className={`flex justify-between ${!showCostsExVat ? 'text-fg-primary font-semibold' : 'text-fg-secondary'}`}>
                <span>{t('pnlPriceInc') || 'Price (inc. VAT)'}{!showCostsExVat && ` \u2190`}</span>
                <span>{displayPrice.toFixed(2)} &#8362;</span>
              </div>
              <div className="flex justify-between text-fg-secondary">
                <span>&minus; {t('pnlVat').replace('{rate}', String(vatRate))}</span>
                <span>{(displayPrice - displayPrice / vatMultiplier).toFixed(2)} &#8362;</span>
              </div>
              <div className={`flex justify-between pt-1 border-t ${showCostsExVat ? 'text-fg-primary font-semibold' : 'text-fg-secondary'}`} style={{ borderColor: 'var(--divider)' }}>
                <span>{t('pnlPriceEx') || 'Price (ex. VAT)'}{showCostsExVat && ` \u2190`}</span>
                <span>{(displayPrice / vatMultiplier).toFixed(2)} &#8362;</span>
              </div>
            </div>
          </section>

          {/* Step 2: food cost */}
          <section className="space-y-1.5">
            <h4 className="text-xs uppercase tracking-wider text-fg-secondary font-semibold">
              {showCostsExVat
                ? (t('costPctStep2Ex') || '2. Food cost (ex-VAT)')
                : (t('costPctStep2Inc') || '2. Food cost (inc-VAT)')}
            </h4>
            <div className="px-3 py-3 rounded-lg font-mono text-sm" style={{ background: 'var(--surface-subtle)' }}>
              <div className="flex justify-between">
                <span className="text-fg-secondary">{t('foodCostLabel')}</span>
                <span className="text-fg-primary font-semibold">{displayCost.toFixed(2)} &#8362;</span>
              </div>
              <p className="text-xs text-fg-tertiary mt-1.5">
                {t('costPctStep2Hint') || 'Sum of each ingredient\u2019s line cost.'}
              </p>
            </div>
          </section>

          {/* Step 3: ratio */}
          <section className="space-y-1.5">
            <h4 className="text-xs uppercase tracking-wider text-fg-secondary font-semibold">
              {t('costPctStep3') || '3. Ratio'}
            </h4>
            <div className="px-3 py-3 rounded-lg font-mono text-sm space-y-1" style={{ background: 'var(--surface-subtle)' }}>
              <div className="text-fg-secondary">
                {displayCost.toFixed(2)} &#8362; &divide; {normalizedPrice.toFixed(2)} &#8362;
              </div>
              <div className={`font-semibold ${costPct > COST_THRESHOLD ? 'text-red-500' : 'text-fg-primary'}`}>
                = {(costPct * 100).toFixed(1)}%
              </div>
              {costPct > COST_THRESHOLD && (
                <p className="text-xs text-red-500 mt-1.5">
                  {t('foodCostExceedsThreshold').replace('{threshold}', (COST_THRESHOLD * 100).toFixed(0))}
                </p>
              )}
            </div>
          </section>

          <p className="text-xs text-fg-tertiary italic">
            {t('costPctBreakdownNote') || 'Industry guideline: food cost % under 35% is healthy for most restaurants. Above that, the item eats margin.'}
          </p>
        </div>
        <div
          className="px-5 py-3 border-t flex items-center justify-end shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
          <button onClick={onClose} className="btn-secondary text-sm">
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
