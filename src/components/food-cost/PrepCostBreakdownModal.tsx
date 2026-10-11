'use client';

import { MenuItem, MenuItemIngredient } from '@/lib/api';
import { convertQuantity } from '@/lib/units';
import { costExVat, vatMultiplierForStock } from '@/lib/cost-utils';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import { useCurrency } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';

// Shows the full math behind a prep ingredient's cost: raw ingredients →
// batch cost → cost per unit → line cost at the current portion.
// The "line cost" math here MUST mirror calcLineCost/calcVariantLineCost in
// cost-utils so the modal and the Cost table never disagree.
//
// When `onEditStockCost` is provided (the simulator path), each sub-ingredient
// row's unit cost becomes editable. Overrides are passed in via
// `simStockCosts` (keyed by stock_item.id) and the modal recomputes batch
// cost / cost per unit / line cost in real-time.
export default function PrepCostBreakdownModal({
  ing, item, showExVat, restaurantRate,
  simStockCosts, onEditStockCost, onClose, t,
}: {
  ing: MenuItemIngredient;
  item: MenuItem;
  showExVat: boolean;
  restaurantRate: number;
  /** Display-basis overrides keyed by stock_item.id. */
  simStockCosts?: Record<number, number>;
  /** When set, sub-ingredient unit costs become editable. */
  onEditStockCost?: (stockId: number, value: number) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const { money, symbol } = useCurrency();
  const prep = ing.prep_item;
  if (!prep) return null;

  const editable = !!onEditStockCost;

  const rows = (prep.ingredients ?? []).map((pi) => {
    const s = pi.stock_item;
    const ex = costExVat(s ?? null);
    const baseUnitCost = showExVat ? ex : ex * vatMultiplierForStock(s ?? null, restaurantRate);
    const stockId = s?.id ?? null;
    const overridden = stockId != null && simStockCosts?.[stockId] != null;
    const unitCost = overridden ? simStockCosts![stockId!] : baseUnitCost;
    const lineCost = pi.quantity_needed * unitCost;
    return {
      id: pi.id,
      stockId,
      name: s?.name ?? '?',
      imageUrl: s?.image_url ?? '',
      qty: pi.quantity_needed,
      stockUnit: s?.unit ?? '',
      baseUnitCost,
      unitCost,
      lineCost,
      overridden,
    };
  });
  const batchCost = rows.reduce((s, r) => s + r.lineCost, 0);
  const yieldQty = prep.yield_per_batch;
  const yieldUnit = prep.unit;
  const costPerUnit = yieldQty > 0 ? batchCost / yieldQty : 0;

  // Mirror the Cost panel's math exactly so this modal and the ingredient
  // table always agree. Precedence:
  //   1) variant-scoped (option_id matches the selected variant): literal qty
  //      from this row.
  //   2) base qty.
  const baseQty = ing.quantity_needed;
  const baseUnit = ing.unit || yieldUnit;
  const effectiveInYieldUnit = convertQuantity(baseQty, baseUnit, yieldUnit);
  const lineCost = effectiveInYieldUnit * costPerUnit;

  return (
    <Modal title={t('costBreakdownTitle').replace('{name}', prep.name)}
      subtitle={showExVat ? t('excludingVat') : t('includingVat')} size="2xl" onClose={onClose}
      footer={<div className="flex justify-end"><Button size="lg" variant="secondary" onClick={onClose}>{t('close')}</Button></div>}>
      <div className="space-y-5 text-sm">
        {editable && <p className="rounded-r-md bg-[var(--info-50)] p-3 text-[var(--info-500)]">{t('simulatorPrepDraftHint')}</p>}
        <section className="space-y-3">
          <h3 className="font-semibold">{t('breakdownBatchRecipe').split('{yield}').map((part, index) => <span key={index}>{index > 0 && <bdi dir="ltr">{yieldQty} {yieldUnit}</bdi>}{part}</span>)}</h3>
          {rows.length === 0 ? <p className="text-fg-secondary">{t('noRecipeYet')}</p> : <div className="divide-y divide-[var(--line)] rounded-r-md border border-[var(--line)]">
            {rows.map(row => <div key={row.id} className="p-3 space-y-3">
              <p className="font-medium">{row.name}</p>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><dt className="text-xs text-fg-secondary mb-1">{t('qty')}</dt><dd><bdi dir="ltr" className="tabular-nums">{row.qty} {row.stockUnit}</bdi></dd></div>
                <div><dt className="text-xs text-fg-secondary mb-1">{t('unitCost')}</dt><dd>
                  {editable && row.stockId != null ? <div className="flex min-h-11 items-center gap-2 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-2">
                    <NumberInput min={0} value={row.unitCost} aria-label={`${t('unitCost')} — ${row.name}`} onChange={value => onEditStockCost!(row.stockId!, value)} className="min-h-11 w-full min-w-0 bg-transparent text-end tabular-nums"/>
                    <bdi dir="ltr" className="text-xs whitespace-nowrap text-fg-secondary">{symbol}/{row.stockUnit}</bdi>
                  </div> : <bdi dir="ltr" className="tabular-nums">{money(row.unitCost, {decimals:4})}/{row.stockUnit}</bdi>}
                  {row.overridden && <span className="block text-xs text-fg-secondary line-through mt-1"><bdi>{money(row.baseUnitCost, {decimals:4})}</bdi></span>}
                </dd></div>
                <div><dt className="text-xs text-fg-secondary mb-1">{t('lineCost')}</dt><dd className="font-semibold tabular-nums"><bdi>{money(row.lineCost)}</bdi></dd></div>
              </dl>
            </div>)}
            <dl className="flex flex-wrap justify-between gap-3 bg-[var(--surface-2)] p-3 font-semibold"><dt>{t('breakdownBatchCost')}</dt><dd className="tabular-nums"><bdi>{money(batchCost)}</bdi></dd></dl>
          </div>}
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">{t('breakdownPerUnit')}</h3>
          <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-2 tabular-nums">
            <bdi dir="ltr" className="block">{money(batchCost)} ÷ {yieldQty} {yieldUnit}</bdi>
            <bdi dir="ltr" className="block font-semibold">= {money(costPerUnit, {decimals:4})}/{yieldUnit}</bdi>
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">{t('breakdownLineCost')}</h3>
          <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-2 tabular-nums">
            <bdi dir="ltr" className="block">{baseQty} {baseUnit}{effectiveInYieldUnit !== baseQty && <> = {effectiveInYieldUnit.toFixed(4)} {yieldUnit}</>}</bdi>
            <bdi dir="ltr" className="block">× {money(costPerUnit, {decimals:4})}/{yieldUnit}</bdi>
            <bdi dir="ltr" className="block font-semibold">= {money(lineCost)}</bdi>
          </div>
        </section>
        <p className="text-xs text-fg-secondary leading-relaxed">{t('breakdownSanityHint')}</p>
      </div>
    </Modal>
  );
}
