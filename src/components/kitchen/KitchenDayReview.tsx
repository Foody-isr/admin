'use client';

import { useState } from 'react';
import { AlertTriangleIcon, ChevronDownIcon, RefreshCwIcon } from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import { useI18n } from '@/lib/i18n';
import { priorityKitchenStocks, priorityKitchenPreparations, kitchenStockPriority } from '@/lib/kitchen-review';
import type { DailyFoodCostReport, KitchenSummary, KitchenStockSummary } from '@/lib/api';

function quantity(value: number, decimals = 2): string {
  return Number(value.toFixed(decimals)).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** A short automatic review; independent counts are requested only on demand. */
export default function KitchenDayReview({ report, summary, loading, error, canCount, onCount, onRetry }: {
  report: DailyFoodCostReport; summary: KitchenSummary | null; loading: boolean; error: string;
  canCount: boolean; onCount: (stockItemId: number, quantity: number) => Promise<void>; onRetry: () => void;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [showAllPrep, setShowAllPrep] = useState(false);
  const sales = (report.sales ?? []).reduce((sum, sale) => sum + sale.quantity, 0);
  const stocks = priorityKitchenStocks(summary?.stocks ?? []);
  const preparations = priorityKitchenPreparations(summary?.preparations ?? []);
  return (
    <section aria-label={t('chefReviewTitle')} className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-lg font-semibold">{t('chefReviewTitle')}</h2>
        <span className="text-sm text-fg-secondary">{t('chefSoldSummary').replace('{qty}', quantity(sales))}</span>
      </div>
      {error ? <div role="alert" className="flex items-center justify-between gap-3 p-5 text-sm text-red-500"><p>{t('chefReviewError')}</p><button className="btn-secondary" onClick={onRetry}>{t('refresh')}</button></div>
        : loading || !summary ? <p className="flex items-center gap-2 p-5 text-sm text-fg-secondary"><RefreshCwIcon className="size-4 animate-spin" />{t('loading')}</p>
        : <div className="space-y-4 px-5 py-4">
          {preparations.length > 0 && <div className="divide-y divide-[var(--line)]">{(showAllPrep ? preparations : preparations.slice(0, 3)).map((item) => <div key={item.prep_item_id} className="py-2 text-sm">
            <p className="font-medium">{item.name}</p>
            <p className="mt-1 text-fg-secondary">{item.target_qty == null ? t('chefNoObjective') : t('chefPlannedQty').replace('{qty}', `${quantity(item.target_qty)} ${item.unit}`)}{' · '}{t('chefProducedQty').replace('{qty}', `${quantity(item.produced_qty)} ${item.unit}`)}{' · '}{t('chefPrepRemaining').replace('{qty}', `${quantity(item.remaining_qty)} ${item.unit}`)}</p>
            {item.target_qty != null && item.produced_qty < item.target_qty && <p className="mt-1 text-xs text-[var(--warning-500)]">{t('chefProductionShortfall').replace('{qty}', `${quantity(item.target_qty - item.produced_qty)} ${item.unit}`)}</p>}
            {item.remaining_qty < 0 && <p className="mt-1 text-xs text-red-500">{t('chefNegativePrep')}</p>}
            {item.waste_qty > 0 && <p className="mt-1 text-xs text-[var(--warning-500)]">{t('chefDeclaredWaste').replace('{qty}', `${quantity(item.waste_qty)} ${item.unit}`)}</p>}
          </div>)}{preparations.length > 3 && <button className="py-2 text-sm text-brand-500" onClick={() => setShowAllPrep(!showAllPrep)}>{showAllPrep ? t('chefShowLess') : t('chefShowAllProduction').replace('{count}', String(preparations.length))}</button>}</div>}
          {summary.unmapped_sales > 0 && <p role="alert" className="text-sm text-[var(--warning-500)]">{t('chefUnmappedSales').replace('{qty}', quantity(summary.unmapped_sales))}</p>}
          <p className="max-w-3xl text-xs leading-relaxed text-fg-secondary">{t('chefReviewEvidenceHint')}</p>
          {stocks.length === 0 ? <p className="text-sm text-fg-secondary">{t('chefNoMovements')}</p> : <div className="divide-y divide-[var(--line)]">{(showAll ? stocks : stocks.slice(0, 3)).map((row, index) => <StockStory key={`${report.id}-${row.stock_item_id}`} row={row} initialOpen={index === 0} canCount={canCount} onCount={onCount} />)}</div>}
          {stocks.length > 3 && <button className="inline-flex items-center gap-1 text-sm font-medium text-brand-500" onClick={() => setShowAll(!showAll)}><ChevronDownIcon className="size-4" />{showAll ? t('chefShowLess') : t('chefShowAllStocks').replace('{count}', String(stocks.length))}</button>}
        </div>}
    </section>
  );
}

function StockStory({ row, initialOpen, canCount, onCount }: { row: KitchenStockSummary; initialOpen: boolean; canCount: boolean; onCount: (id: number, quantity: number) => Promise<void> }) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [count, setCount] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const qty = (n: number) => `${quantity(n)} ${row.unit}`;
  const alert = kitchenStockPriority(row) >= 2;
  return <article className="py-3">
    <details open={initialOpen}>
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 font-semibold">{alert && <AlertTriangleIcon className="size-4 text-[var(--warning-500)]" />}{row.name}</span>
      <span className="flex items-center gap-2 text-xs text-fg-secondary">{row.unexplained_qty != null && Math.abs(row.unexplained_qty) > 0.001 ? `${t('variance')} : ${qty(row.unexplained_qty)}` : t('chefExpectedRemainder').replace('{qty}', qty(row.expected_remaining))}<ChevronDownIcon className="size-4" /></span>
    </summary>
    <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
      <div className="min-w-0 flex-1">
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-fg-secondary">{t('chefStockAvailable').replace('{total}', qty(row.opening_qty + row.received_qty)).replace('{opening}', qty(row.opening_qty)).replace('{received}', qty(row.received_qty))}</p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-fg-secondary">{t('chefStockUsed').replace('{production}', qty(row.production_usage)).replace('{sales}', qty(row.order_usage + row.pending_usage))}</p>
        {row.unexplained_qty != null && Math.abs(row.unexplained_qty) > 0.001 && <p className="mt-1 text-sm font-medium">{t('chefExpectedRemainder').replace('{qty}', qty(row.expected_remaining))}</p>}
        {row.pending_usage > 0 && <p className="mt-1 text-xs text-fg-secondary">{t('chefPendingRemainder')}</p>}
        {row.adjustment_qty !== 0 && <p className="mt-1 text-xs text-fg-secondary">{t('chefStockAdjustment').replace('{qty}', qty(row.adjustment_qty))}</p>}
        {row.waste_qty > 0 && <p className="mt-1 text-xs text-[var(--warning-500)]">{t('chefDeclaredWaste').replace('{qty}', qty(row.waste_qty))}</p>}
        {row.counted_remaining != null && <p className="mt-1 text-sm">{t('chefMeasuredRemainder').replace('{qty}', qty(row.counted_remaining))}</p>}
        {row.unexplained_qty != null && Math.abs(row.unexplained_qty) > 0.001 && <p className="mt-1 max-w-3xl text-sm text-[var(--warning-500)]">{t(row.unexplained_qty > 0 ? 'chefMissingStock' : 'chefExtraStock').replace('{qty}', qty(Math.abs(row.unexplained_qty)))}</p>}
        {row.counted_remaining == null && row.expected_remaining < 0 && <p className="mt-1 max-w-3xl text-sm text-[var(--warning-500)]">{t('chefNegativeStock')}</p>}
        {(row.recipes ?? []).length > 0 && <details className="mt-2 text-xs text-fg-secondary"><summary className="cursor-pointer">{t('chefRecipeDetails')}</summary><div className="space-y-1 py-2">{row.recipes.map((recipe, index) => <p key={index}>{recipe.name} : {quantity(recipe.produced_qty)} {recipe.prep_unit} × {quantity(recipe.quantity_per_unit, 6)} {row.unit} = {qty(recipe.produced_qty * recipe.quantity_per_unit)}</p>)}<p>{t('chefCurrentRecipeHint')}</p></div></details>}
      </div>
      {canCount && <button className="btn-secondary shrink-0 text-xs" aria-expanded={checking} onClick={() => setChecking(!checking)}>{t('chefCheckRemaining')}</button>}
    </div>
    {checking && <form className="mt-3 flex flex-wrap items-end gap-3 rounded-r-md bg-[var(--surface-2)] p-3" onSubmit={async (event) => {
      event.preventDefault(); if (count === undefined || count < 0 || !Number.isFinite(count)) return;
      setSaving(true); setError('');
      try { await onCount(row.stock_item_id, count); setChecking(false); }
      catch { setError(t('saveFailed')); } finally { setSaving(false); }
    }}><label className="text-xs text-fg-secondary">{t('chefActualRemaining')} ({row.unit})<NumberInput value={count} format={String} min={0} onChange={setCount} className="input mt-1 w-40" /></label>
      <button type="submit" className="btn-primary text-sm" disabled={saving || count === undefined || count < 0}>{saving ? t('saving') : t('chefSaveCheck')}</button>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </form>}
    </details>
  </article>;
}
