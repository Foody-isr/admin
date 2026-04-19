'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories, listStockItems, listPrepItems, getRestaurantSettings,
  getMenuItemIngredients, getItemOptionPrices,
  MenuCategory, MenuItem, MenuItemIngredient, StockItem, PrepItem, ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { COST_THRESHOLD, computeItemCostSummary, ItemCostSummary } from '@/lib/cost-utils';
import CostPctBreakdownModal from '@/components/food-cost/CostPctBreakdownModal';
import {
  XMarkIcon, ExclamationTriangleIcon, PhotoIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

const MIN_ITEMS = 2;
const MAX_ITEMS = 6;

// Side-by-side cost comparison for 2-6 menu items. The user lands here via
// the bulk-action bar on the items library page (/{rid}/menu/items).
// URL shape: /{rid}/menu/items/compare?ids=1,2,3
export default function CompareItemsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  // ── Parse & validate ids from the URL ───────────────────────────────────
  const ids = useMemo(() => {
    const raw = searchParams.get('ids') ?? '';
    return raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [searchParams]);

  // Bail if the URL doesn't give us a workable selection.
  useEffect(() => {
    if (ids.length < MIN_ITEMS || ids.length > MAX_ITEMS) {
      router.replace(`/${rid}/menu/items`);
    }
  }, [ids, rid, router]);

  // ── Data ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Array<MenuItem & { category_name: string }>>([]);
  const [ingredientsByItem, setIngredientsByItem] = useState<Record<number, MenuItemIngredient[]>>({});
  const [overridesByItem, setOverridesByItem] = useState<Record<number, ItemOptionOverride[]>>({});
  const [vatRate, setVatRate] = useState(18);
  const [showCostsExVat, setShowCostsExVat] = useState(true);
  // Index of the item whose Cost % breakdown is currently open, or null.
  const [breakdownIdx, setBreakdownIdx] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);

  useEffect(() => {
    if (ids.length < MIN_ITEMS) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // One parallel fan-out for the whole view. Per-item ingredient +
        // override calls are zipped back by id after Promise.all settles.
        const [cats, stock, preps, settings, perItemIngs, perItemOverrides] = await Promise.all([
          getAllCategories(rid),
          listStockItems(rid),
          listPrepItems(rid),
          getRestaurantSettings(rid),
          Promise.all(ids.map((id) => getMenuItemIngredients(rid, id))),
          Promise.all(ids.map((id) => getItemOptionPrices(rid, id))),
        ]);
        if (cancelled) return;

        // Resolve each id to its MenuItem via the category catalog, preserving
        // the order in the URL so the columns line up with the selection.
        const byId = new Map<number, MenuItem & { category_name: string }>();
        for (const cat of cats as MenuCategory[]) {
          for (const mi of cat.items ?? []) {
            byId.set(mi.id, { ...mi, category_name: cat.name });
          }
        }
        const resolved = ids
          .map((id) => byId.get(id))
          .filter((x): x is MenuItem & { category_name: string } => !!x);

        const ings: Record<number, MenuItemIngredient[]> = {};
        const ovs: Record<number, ItemOptionOverride[]> = {};
        ids.forEach((id, i) => {
          ings[id] = perItemIngs[i] ?? [];
          ovs[id] = perItemOverrides[i] ?? [];
        });

        setItems(resolved);
        setStockItems(stock);
        setPrepItems(preps);
        setVatRate(settings.vat_rate ?? 18);
        setIngredientsByItem(ings);
        setOverridesByItem(ovs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [ids, rid]);

  // ── Per-item summaries ──────────────────────────────────────────────────
  const summaries: Array<{ item: MenuItem & { category_name: string }; s: ItemCostSummary }> = useMemo(() => {
    return items.map((item) => ({
      item,
      s: computeItemCostSummary({
        item,
        ingredients: ingredientsByItem[item.id] ?? [],
        overrides: overridesByItem[item.id] ?? [],
        vatRate,
        showCostsExVat,
      }),
    }));
  }, [items, ingredientsByItem, overridesByItem, vatRate, showCostsExVat]);

  // Winner / loser cell highlighting per row. direction = "min" → lowest is
  // best (cost, cost%); "max" → highest is best (margin). Returns index of
  // best / worst, or null when all values are equal or ranking makes no sense
  // (e.g. some items have no price yet).
  const rankCells = (values: number[], direction: 'min' | 'max'): { bestIdx: number | null; worstIdx: number | null } => {
    if (values.length < 2) return { bestIdx: null, worstIdx: null };
    const finite = values.map((v) => Number.isFinite(v) ? v : null);
    if (finite.some((v) => v == null)) return { bestIdx: null, worstIdx: null };
    const min = Math.min(...(finite as number[]));
    const max = Math.max(...(finite as number[]));
    if (min === max) return { bestIdx: null, worstIdx: null };
    const best = direction === 'min' ? min : max;
    const worst = direction === 'min' ? max : min;
    return {
      bestIdx: values.findIndex((v) => v === best),
      worstIdx: values.findIndex((v) => v === worst),
    };
  };

  const cellClass = (idx: number, best: number | null, worst: number | null) =>
    idx === best ? 'bg-status-ready/10 text-status-ready'
    : idx === worst ? 'bg-red-500/10 text-red-400'
    : '';

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading || ids.length < MIN_ITEMS) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const prices = summaries.map(({ s }) => s.displayPrice);
  const costs = summaries.map(({ s }) => s.foodCost);
  const costPcts = summaries.map(({ s }) => s.costPct);
  const margins = summaries.map(({ s }) => s.margin);

  const priceRank = rankCells(prices, 'min');
  const costRank = rankCells(costs, 'min');
  const pctRank = rankCells(costPcts, 'min');
  const marginRank = rankCells(margins, 'max');

  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg)] overflow-y-auto">
      {/* Sticky header: Back, title, VAT toggle */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
            aria-label={t('back') || 'Back'}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-fg-primary">
              {t('compareCosts') || 'Compare costs'}
            </h1>
            <p className="text-xs text-fg-tertiary">
              {(t('selectedCount') || '{n} selected').replace('{n}', String(summaries.length))}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCostsExVat((v) => !v)}
          className="text-sm text-brand-500 hover:text-brand-400 transition-colors"
        >
          {showCostsExVat ? (t('showIncVat') || 'Show inc VAT') : (t('showExVat') || 'Show ex VAT')}
        </button>
      </div>

      {/* Grid of item column headers */}
      <div className="p-6">
        <div
          className="grid gap-4 mb-6"
          style={{ gridTemplateColumns: `200px repeat(${summaries.length}, minmax(200px, 1fr))` }}
        >
          <div /> {/* corner */}
          {summaries.map(({ item, s }) => (
            <div key={item.id} className="rounded-xl border border-[var(--divider)] p-3 bg-[var(--surface)] flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                    <PhotoIcon className="w-5 h-5 text-fg-tertiary" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg-primary truncate">{item.name}</p>
                  <p className="text-xs text-fg-tertiary truncate">{item.category_name}</p>
                </div>
              </div>
              {s.activeVariant && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-brand-500/10 text-brand-500 w-fit">
                  {s.activeVariant.name}
                  {s.activeVariant.portion_size > 0 && ` · ${s.activeVariant.portion_size}${s.activeVariant.portion_size_unit}`}
                </span>
              )}
              <button
                onClick={() => router.push(`/${rid}/menu/items/${item.id}?tab=cost`)}
                className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1 mt-1"
              >
                {t('openItemCta') || 'Open item'} <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Metrics table — rows = metric, columns = item */}
        <div className="rounded-xl border border-[var(--divider)] overflow-hidden bg-[var(--surface)]">
          <MetricRow label={t('metricPrice') || 'Price'}>
            {summaries.map(({ item, s }, i) => (
              <Cell key={item.id} className={cellClass(i, priceRank.bestIdx, priceRank.worstIdx)}>
                {s.displayPrice > 0 ? `${s.displayPrice.toFixed(2)} ₪` : '—'}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricFoodCost') || 'Food cost'}>
            {summaries.map(({ item, s }, i) => (
              <Cell key={item.id} className={cellClass(i, costRank.bestIdx, costRank.worstIdx)}>
                {s.hasIngredients ? `${s.foodCost.toFixed(2)} ₪` : '—'}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricCostPct') || 'Cost %'}>
            {summaries.map(({ item, s }, i) => {
              const over = s.costPct > COST_THRESHOLD;
              const clickable = s.displayPrice > 0 && s.hasIngredients;
              return (
                <Cell key={item.id} className={cellClass(i, pctRank.bestIdx, pctRank.worstIdx)}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => setBreakdownIdx(i)}
                      className={`hover:underline transition-colors text-left ${over ? 'font-semibold text-red-400 hover:text-red-300' : 'hover:text-brand-500'}`}
                      title={t('showCostBreakdown') || 'Show cost breakdown'}
                    >
                      {(s.costPct * 100).toFixed(1)}%
                      {over && ' ⚠'}
                    </button>
                  ) : '—'}
                </Cell>
              );
            })}
          </MetricRow>
          <MetricRow label={t('metricMargin') || 'Margin'}>
            {summaries.map(({ item, s }, i) => (
              <Cell key={item.id} className={cellClass(i, marginRank.bestIdx, marginRank.worstIdx)}>
                {s.displayPrice > 0 && s.hasIngredients ? `${s.margin.toFixed(2)} ₪` : '—'}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricTopIngredient') || 'Top ingredient'}>
            {summaries.map(({ item, s }) => (
              <Cell key={item.id}>
                {s.topIngredient ? (
                  <span>
                    <span className="font-medium text-fg-primary">{s.topIngredient.name}</span>
                    <span className="text-xs text-fg-tertiary ml-1">
                      ({(s.topIngredient.contributionPct * 100).toFixed(0)}%)
                    </span>
                  </span>
                ) : '—'}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricIngredientCount') || 'Ingredients'}>
            {summaries.map(({ item, s }) => {
              const names = (ingredientsByItem[item.id] ?? [])
                .filter((ing) => ing.option_id == null || (s.activeVariant && s.activeVariant.id === `opt:${ing.option_id}`))
                .map((ing) => ing.stock_item?.name ?? ing.prep_item?.name ?? '?');
              return (
                <Cell key={item.id}>
                  {s.ingredientCount > 0 ? (
                    <span className="relative group inline-block cursor-help border-b border-dotted border-fg-tertiary">
                      {s.ingredientCount}
                      <span
                        className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute bottom-full left-0 mb-2 z-50 min-w-[200px] max-w-[320px] rounded-lg border p-3 shadow-xl text-xs"
                        style={{ background: 'var(--surface)', borderColor: 'var(--divider)' }}
                      >
                        <span className="block font-semibold text-fg-primary mb-1.5">
                          {t('metricIngredientCount') || 'Ingredients'}
                        </span>
                        <ul className="space-y-0.5 font-normal text-fg-secondary">
                          {names.map((n, i) => <li key={i}>&bull; {n}</li>)}
                        </ul>
                      </span>
                    </span>
                  ) : '—'}
                </Cell>
              );
            })}
          </MetricRow>
          <MetricRow label={t('metricConfigIssues') || 'Config issues'} last>
            {summaries.map(({ item, s }) => (
              <Cell key={item.id}>
                {s.configIssues.length === 0 ? (
                  <span className="text-fg-tertiary">—</span>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {s.configIssues.map(({ prep, issue }) => {
                      const reason =
                        issue === 'missing_yield' ? (t('prepMissingYield') || 'no yield per batch set')
                        : issue === 'no_ingredients' ? (t('prepNoIngredients') || 'no raw ingredients linked')
                        : (t('prepZeroCostIngredients') || 'linked ingredients have no purchase cost set');
                      return (
                        <li key={prep.id} className="flex items-start gap-1 text-amber-400">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="flex-1">
                            <span className="font-semibold">{prep.name}</span>{': '}{reason}.{' '}
                            <button
                              onClick={() => router.push(`/${rid}/kitchen/prep?edit=${prep.id}`)}
                              className="underline hover:text-amber-300"
                            >
                              {t('fix') || 'Fix'} &rarr;
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Cell>
            ))}
          </MetricRow>
        </div>
      </div>

      {breakdownIdx != null && summaries[breakdownIdx] && (() => {
        const { item, s } = summaries[breakdownIdx];
        // The modal derives VAT-layered display from a raw inc-VAT price, so
        // hand it the variant price when a variant is active, otherwise the
        // item base price.
        const rawPrice = s.activeVariant?.price ?? item.price ?? 0;
        return (
          <CostPctBreakdownModal
            itemName={item.name}
            displayPrice={rawPrice}
            displayCost={s.foodCost}
            costPct={s.costPct}
            showCostsExVat={showCostsExVat}
            vatRate={vatRate}
            onClose={() => setBreakdownIdx(null)}
          />
        );
      })()}
    </div>
  );
}

// ─── Row + Cell primitives ──────────────────────────────────────────────────

function MetricRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      className={`grid ${last ? '' : 'border-b border-[var(--divider)]'}`}
      style={{
        gridTemplateColumns: `200px repeat(${Array.isArray(children) ? (children as React.ReactNode[]).length : 1}, minmax(200px, 1fr))`,
      }}
    >
      <div className="px-4 py-3 text-xs uppercase tracking-wider text-fg-secondary font-medium bg-[var(--surface-subtle)] flex items-center">
        {label}
      </div>
      {children}
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-4 py-3 font-mono text-sm text-fg-primary flex items-center ${className ?? ''}`}>
      {children}
    </div>
  );
}
