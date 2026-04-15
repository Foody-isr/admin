'use client';

import { MenuItemIngredient } from '@/lib/api';
import { convertQuantity } from '@/lib/units';

// Shows the full math behind a prep ingredient's cost: raw ingredients →
// batch cost → cost per unit → line cost at the current portion.
// Lets the user spot unit mismatches or stale data at a glance.
export default function PrepCostBreakdownModal({
  ing, portion, showExVat, vatMultiplier, onClose, t,
}: {
  ing: MenuItemIngredient;
  portion: { qty: number; unit: string } | null;
  showExVat: boolean;
  vatMultiplier: number;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const prep = ing.prep_item;
  if (!prep) return null;

  const toExVat = (c: number, incl: boolean) => incl ? c / vatMultiplier : c;
  const toIncVat = (c: number, incl: boolean) => incl ? c : c * vatMultiplier;
  const normalize = (c: number, incl: boolean) =>
    showExVat ? toExVat(c, incl) : toIncVat(c, incl);

  const rows = (prep.ingredients ?? []).map((pi) => {
    const s = pi.stock_item;
    const rawUnitCost = s?.cost_per_unit ?? 0;
    const incVat = s?.price_includes_vat ?? false;
    const unitCost = normalize(rawUnitCost, incVat);
    const lineCost = pi.quantity_needed * unitCost;
    return {
      id: pi.id,
      name: s?.name ?? '?',
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

  const portionQty = ing.scales_with_variant
    ? (portion ? portion.qty : 0)
    : ing.quantity_needed;
  const portionUnit = ing.scales_with_variant
    ? (portion ? portion.unit : yieldUnit)
    : (ing.unit || yieldUnit);
  const portionInYieldUnit = convertQuantity(portionQty, portionUnit, yieldUnit);
  const lineCost = portionInYieldUnit * costPerUnit;

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
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                      <td className="py-2 font-medium text-fg-primary">{r.name}</td>
                      <td className="py-2 text-right font-mono text-fg-primary">
                        {r.qty} <span className="text-fg-secondary text-xs">{r.stockUnit}</span>
                      </td>
                      <td className="py-2 text-right font-mono text-fg-secondary">
                        {r.unitCost.toFixed(4)} &#8362;/{r.stockUnit}
                      </td>
                      <td className="py-2 text-right font-mono text-fg-primary">
                        {r.lineCost.toFixed(2)} &#8362;
                      </td>
                    </tr>
                  ))}
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
                {portionQty} {portionUnit}
                {portionInYieldUnit !== portionQty && (
                  <span> = {portionInYieldUnit.toFixed(4)} {yieldUnit}</span>
                )}{' '}
                &times; {costPerUnit.toFixed(4)} &#8362;/{yieldUnit}
              </div>
              <div className="text-fg-primary font-semibold">
                = {lineCost.toFixed(2)} &#8362;
              </div>
            </div>
            {ing.scales_with_variant && !portion && (
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
