'use client';

import { useI18n } from '@/lib/i18n';
import type { CostLineDetail } from '@/lib/cost-utils';

interface Props {
  itemName?: string;
  foodCost: number;              // VAT-normalized total, matches the sum of lines
  lines: CostLineDetail[];
  showCostsExVat: boolean;
  onClose: () => void;
}

// Re-usable popup that lists each ingredient's contribution to the food cost
// total. Used from the compare view where there's no always-visible ingredient
// breakdown table.
export default function FoodCostBreakdownModal({
  itemName, foodCost, lines, showCostsExVat, onClose,
}: Props) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-modal shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        style={{ background: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
          <div>
            <h3 className="font-semibold text-fg-primary">
              {t('foodCostBreakdownTitle') || 'How Food cost is calculated'}
            </h3>
            {itemName && <p className="text-xs text-fg-tertiary">{itemName}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
          <p className="text-fg-secondary">
            {showCostsExVat
              ? (t('foodCostBreakdownIntroEx') || 'Food cost sums each ingredient\u2019s line cost on an ex-VAT basis. The totals you see on the Cost tab match this sum exactly.')
              : (t('foodCostBreakdownIntroInc') || 'Food cost sums each ingredient\u2019s line cost on an inc-VAT basis (all numbers include VAT).')}
          </p>

          {lines.length === 0 ? (
            <div className="rounded-lg p-4 text-center text-fg-tertiary text-sm" style={{ background: 'var(--surface-subtle)' }}>
              {t('noIngredientsLinked') || 'No ingredients linked yet.'}
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--divider)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--divider)' }}>
                    <th className="py-2.5 px-3 font-medium">{t('ingredient') || 'Ingredient'}</th>
                    <th className="py-2.5 px-3 font-medium">{t('type') || 'Type'}</th>
                    <th className="py-2.5 px-3 font-medium text-right">{t('qtyPerServing') || 'Qty / Serving'}</th>
                    <th className="py-2.5 px-3 font-medium text-right">{t('unitCost') || 'Unit Cost'}</th>
                    <th className="py-2.5 px-3 font-medium text-right">{t('lineCost') || 'Line Cost'}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const pct = foodCost > 0 ? (l.lineCost / foodCost) * 100 : 0;
                    return (
                      <tr key={`${l.ingredient.id}-${i}`} style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-fg-primary">{l.name}</span>
                          {pct > 0 && (
                            <span className="ml-2 text-xs text-fg-tertiary">({pct.toFixed(0)}%)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${l.isPrep ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {l.isPrep ? (t('prep') || 'Prep') : (t('raw') || 'Raw')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-fg-primary">
                          {Number(l.qty.toFixed(3))} <span className="text-fg-secondary text-xs">{l.qtyUnit}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-fg-secondary">
                          {l.unitCost.toFixed(2)} &#8362;/{l.sourceUnit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-fg-primary">
                          {l.lineCost.toFixed(2)} &#8362;
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: 'var(--surface-subtle)' }}>
                    <td colSpan={4} className="py-2.5 px-3 text-right font-semibold text-fg-primary">
                      {t('totalFoodCost') || 'Total Food Cost'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-fg-primary">
                      {foodCost.toFixed(2)} &#8362;
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-fg-tertiary italic">
            {t('foodCostBreakdownNote') || 'Click a prep ingredient on the Cost tab for its own sub-recipe breakdown.'}
          </p>
        </div>

        <div
          className="px-5 py-3 border-t flex items-center justify-end shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
          <button onClick={onClose} className="btn-secondary text-sm">
            {t('close') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
