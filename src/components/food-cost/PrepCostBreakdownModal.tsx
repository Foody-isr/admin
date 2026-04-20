'use client';

import { MenuItem, MenuItemIngredient } from '@/lib/api';
import { convertQuantity, toBaseUnit, sameUnitFamily } from '@/lib/units';
import { costExVat, vatMultiplierForStock } from '@/lib/cost-utils';
import { PhotoIcon } from '@heroicons/react/24/outline';

// Shows the full math behind a prep ingredient's cost: raw ingredients →
// batch cost → cost per unit → line cost at the current portion.
// The "line cost" math here MUST mirror calcLineCost/calcVariantLineCost in
// MenuItemCostPanel so the modal and the Cost table never disagree.
export default function PrepCostBreakdownModal({
  ing, item, portion, optionId, showExVat, restaurantRate,
  simMode, simStockCosts, onEditStockCost, onClose, t,
}: {
  ing: MenuItemIngredient;
  item: MenuItem;
  portion: { qty: number; unit: string } | null;
  optionId?: number | null;
  showExVat: boolean;
  restaurantRate: number;
  // Simulate mode — when true, the unit-cost cell for each sub-ingredient
  // becomes an editable input. Edits flow back via onEditStockCost, keyed by
  // the stock item's id so the same stock used across multiple menu items
  // stays in lockstep.
  simMode?: boolean;
  simStockCosts?: Record<number, number>;
  onEditStockCost?: (stockId: number, value: number) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const prep = ing.prep_item;
  if (!prep) return null;

  const rows = (prep.ingredients ?? []).map((pi) => {
    const s = pi.stock_item;
    const ex = costExVat(s ?? null);
    const unitCost = showExVat ? ex : ex * vatMultiplierForStock(s ?? null, restaurantRate);
    const lineCost = pi.quantity_needed * unitCost;
    return {
      id: pi.id,
      stockId: s?.id ?? null,
      name: s?.name ?? '?',
      imageUrl: s?.image_url ?? '',
      qty: pi.quantity_needed,
      stockUnit: s?.unit ?? '',
      unitCost,
      lineCost,
    };
  });
  const batchCost = rows.reduce((s, r) => s + r.lineCost, 0);
  const yieldQty = prep.yield_per_batch;
  const yieldUnit = prep.unit;
  const costPerUnit = yieldQty > 0 ? batchCost / yieldQty : 0;

  // Mirror the Cost panel's math exactly so this modal and the ingredient
  // table always agree. Precedence:
  //   1) batchMode (item.recipe_yield > 0): prorate base qty by
  //      variant.portion / item.recipe_yield.
  //   2) scales_with_variant ("Match item size"): qty = current variant's
  //      portion (no base number to multiply; the portion IS the qty).
  //   3) variant-scoped (option_id matches the selected variant): literal qty
  //      from this row.
  //   4) base qty.
  const batchMode = (item.recipe_yield ?? 0) > 0;
  let baseQty = ing.quantity_needed;
  let baseUnit = ing.unit || yieldUnit;
  let variantRatio = 1;
  let batchRatio = 1;
  let isMatchSize = false;
  const isVariantScoped = ing.option_id != null && ing.option_id === optionId;

  if (batchMode && portion) {
    const yieldBase = toBaseUnit(item.recipe_yield ?? 0, item.recipe_yield_unit || 'kg');
    const portionBase = toBaseUnit(portion.qty, portion.unit);
    if (yieldBase > 0) batchRatio = portionBase / yieldBase;
  } else if (!batchMode && ing.scales_with_variant && portion) {
    // Match item size: qty IS the variant's portion. Override baseQty/baseUnit
    // because scales_with_variant rows have qty=0 in storage (sentinel).
    baseQty = portion.qty;
    baseUnit = portion.unit || baseUnit;
    isMatchSize = true;
  }
  const effectiveQty = (isVariantScoped || isMatchSize) ? baseQty : baseQty * variantRatio * batchRatio;
  const effectiveInYieldUnit = convertQuantity(effectiveQty, baseUnit, yieldUnit);
  const lineCost = effectiveInYieldUnit * costPerUnit;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        className="rounded-modal shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
          <div>
            <h3 className="font-semibold text-fg-primary">{t('costBreakdownTitle').replace('{name}', prep.name)}</h3>
            <p className="text-xs text-fg-secondary mt-0.5">
              {showExVat ? t('excludingVat') : t('includingVat')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors">
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-fg-secondary font-semibold">
              {t('breakdownBatchRecipe').replace('{yield}', `${yieldQty} ${yieldUnit}`)}
            </h4>
            {rows.length === 0 ? (
              <p className="text-sm text-fg-secondary italic py-2">{t('noRecipeYet')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                    <th className="py-2 font-medium">{t('ingredient')}</th>
                    <th className="py-2 font-medium text-right">{t('qty')}</th>
                    <th className="py-2 font-medium text-right">{t('unitCost')}</th>
                    <th className="py-2 font-medium text-right">{t('lineCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const editable = simMode && r.stockId != null && onEditStockCost;
                    const inputValue = editable && simStockCosts && simStockCosts[r.stockId!] != null
                      ? simStockCosts[r.stockId!]
                      : Number(r.unitCost.toFixed(4));
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td className="py-2 font-medium text-fg-primary">
                          <div className="flex items-center gap-2.5">
                            {r.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.imageUrl} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
                            ) : (
                              <div className="w-7 h-7 rounded-md bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                                <PhotoIcon className="w-4 h-4 text-fg-tertiary" />
                              </div>
                            )}
                            <span className="truncate">{r.name}</span>
                          </div>
                        </td>
                        <td className="py-2 text-right font-mono text-fg-primary">
                          {r.qty} <span className="text-fg-secondary text-xs">{r.stockUnit}</span>
                        </td>
                        <td className="py-2 text-right">
                          {editable ? (
                            <div className="inline-flex items-center gap-1 font-mono">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={inputValue}
                                onChange={(e) => {
                                  const raw = parseFloat(e.target.value);
                                  const v = Number.isFinite(raw) && raw >= 0 ? raw : 0;
                                  onEditStockCost!(r.stockId!, v);
                                }}
                                className="input w-24 text-sm py-1 text-right rounded"
                              />
                              <span className="text-fg-secondary text-xs">&#8362;/{r.stockUnit}</span>
                            </div>
                          ) : (
                            <span className="font-mono text-fg-secondary">
                              {r.unitCost.toFixed(4)} &#8362;/{r.stockUnit}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono text-fg-primary">
                          {r.lineCost.toFixed(2)} &#8362;
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: 'var(--surface-subtle)' }}>
                    <td colSpan={3} className="py-2 text-right font-semibold text-fg-primary">
                      {t('breakdownBatchCost')}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-fg-primary">
                      {batchCost.toFixed(2)} &#8362;
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-fg-secondary font-semibold">
              {t('breakdownPerUnit')}
            </h4>
            <div className="px-3 py-3 rounded-lg space-y-1 font-mono text-sm" style={{ background: 'var(--surface-subtle)' }}>
              <div className="text-fg-secondary">
                {batchCost.toFixed(2)} &#8362; &divide; {yieldQty} {yieldUnit}
              </div>
              <div className="text-fg-primary font-semibold">
                = {costPerUnit.toFixed(4)} &#8362;/{yieldUnit}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-fg-secondary font-semibold">
              {t('breakdownLineCost')}
            </h4>
            <div className="px-3 py-3 rounded-lg space-y-1 font-mono text-sm" style={{ background: 'var(--surface-subtle)' }}>
              <div className="text-fg-secondary">
                {baseQty} {baseUnit}
                {isVariantScoped && (
                  <span className="text-brand-500"> ({t('variantIngredient') || 'variant ingredient'})</span>
                )}
                {isMatchSize && (
                  <span className="text-brand-500"> ({t('scopeFollowVariant') || 'match item size'})</span>
                )}
                {batchRatio !== 1 && (
                  <span> &times; {batchRatio.toFixed(3)} ({t('batch') || 'batch'})</span>
                )}
                {' = '}{Number(effectiveQty.toFixed(4))} {baseUnit}
                {effectiveInYieldUnit !== effectiveQty && (
                  <span> = {effectiveInYieldUnit.toFixed(4)} {yieldUnit}</span>
                )}
              </div>
              <div className="text-fg-secondary">
                &times; {costPerUnit.toFixed(4)} &#8362;/{yieldUnit}
              </div>
              <div className="text-fg-primary font-semibold">
                = {lineCost.toFixed(2)} &#8362;
              </div>
            </div>
            {ing.scales_with_variant && !portion && !batchMode && (
              <p className="text-xs text-amber-500">{t('missingVariantPortion')}</p>
            )}
          </section>

          <p className="text-xs text-fg-tertiary italic">
            {t('breakdownSanityHint')}
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
