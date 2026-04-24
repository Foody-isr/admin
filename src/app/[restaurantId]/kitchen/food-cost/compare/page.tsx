'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getAllCategories,
  getRestaurantSettings,
  getMenuItemIngredients,
  getItemOptionPrices,
  MenuCategory,
  MenuItem,
  MenuItemIngredient,
  ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { COST_THRESHOLD, computeItemCostSummary, ItemCostSummary } from '@/lib/cost-utils';
import CostPctBreakdownModal from '@/components/food-cost/CostPctBreakdownModal';
import FoodCostBreakdownModal from '@/components/food-cost/FoodCostBreakdownModal';
import { AlertTriangle, ExternalLink, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ds';

const MIN_ITEMS = 2;
const MAX_ITEMS = 6;

// Side-by-side cost comparison for 2–6 menu items. Entry point: the food-cost
// page (Cuisine → Coût alimentaire). URL: /{rid}/kitchen/food-cost/compare?ids=1,2,3
export default function CompareCostsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const ids = useMemo(() => {
    const raw = searchParams.get('ids') ?? '';
    return raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [searchParams]);

  useEffect(() => {
    if (ids.length < MIN_ITEMS || ids.length > MAX_ITEMS) {
      router.replace(`/${rid}/kitchen/food-cost`);
    }
  }, [ids, rid, router]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Array<MenuItem & { category_name: string }>>([]);
  const [ingredientsByItem, setIngredientsByItem] = useState<Record<number, MenuItemIngredient[]>>({});
  const [overridesByItem, setOverridesByItem] = useState<Record<number, ItemOptionOverride[]>>({});
  const [vatRate, setVatRate] = useState(18);
  const [showCostsExVat, setShowCostsExVat] = useState(true);
  const [breakdownIdx, setBreakdownIdx] = useState<number | null>(null);
  const [foodCostIdx, setFoodCostIdx] = useState<number | null>(null);

  useEffect(() => {
    if (ids.length < MIN_ITEMS) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [cats, settings, perItemIngs, perItemOverrides] = await Promise.all([
          getAllCategories(rid),
          getRestaurantSettings(rid),
          Promise.all(ids.map((id) => getMenuItemIngredients(rid, id))),
          Promise.all(ids.map((id) => getItemOptionPrices(rid, id))),
        ]);
        if (cancelled) return;

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
        setVatRate(settings.vat_rate ?? 18);
        setIngredientsByItem(ings);
        setOverridesByItem(ovs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ids, rid]);

  const summaries: Array<{ item: MenuItem & { category_name: string }; s: ItemCostSummary }> =
    useMemo(() => {
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

  // Winner / loser per row. Highlighted with semantic success / danger tints.
  const rankCells = (
    values: number[],
    direction: 'min' | 'max',
  ): { bestIdx: number | null; worstIdx: number | null } => {
    if (values.length < 2) return { bestIdx: null, worstIdx: null };
    const finite = values.map((v) => (Number.isFinite(v) ? v : null));
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

  const rankStyle = (idx: number, best: number | null, worst: number | null): React.CSSProperties => {
    if (idx === best) {
      return {
        background: 'color-mix(in oklab, var(--success-500) 10%, transparent)',
        color: 'var(--success-500)',
      };
    }
    if (idx === worst) {
      return {
        background: 'color-mix(in oklab, var(--danger-500) 10%, transparent)',
        color: 'var(--danger-500)',
      };
    }
    return {};
  };

  if (loading || ids.length < MIN_ITEMS) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }}
        />
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

  const gridTemplate = `220px repeat(${summaries.length}, minmax(200px, 1fr))`;

  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg)] overflow-y-auto flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--line)] px-[var(--s-6)] py-[var(--s-4)] flex items-center justify-between gap-[var(--s-4)]">
        <div className="flex items-center gap-[var(--s-3)]">
          <Button
            variant="ghost"
            size="md"
            icon
            onClick={() => router.push(`/${rid}/kitchen/food-cost`)}
            aria-label={t('close') || 'Fermer'}
          >
            <X />
          </Button>
          <div>
            <h1 className="text-fs-lg font-semibold text-[var(--fg)]">
              {t('compareCosts') || 'Comparer les coûts'}
            </h1>
            <p className="text-fs-xs text-[var(--fg-muted)]">
              {(t('selectedCount') || '{n} sélectionnés').replace(
                '{n}',
                String(summaries.length),
              )}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCostsExVat((v) => !v)}
          className="text-[var(--brand-500)]"
        >
          {showCostsExVat ? t('showIncVat') || 'Afficher TTC' : t('showExVat') || 'Afficher HT'}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-[var(--s-6)]">
        {/* Column headers — one card per compared item */}
        <div className="grid gap-[var(--s-4)] mb-[var(--s-5)]" style={{ gridTemplateColumns: gridTemplate }}>
          <div /> {/* corner */}
          {summaries.map(({ item, s }) => (
            <div
              key={item.id}
              className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 p-[var(--s-3)] flex flex-col gap-[var(--s-2)]"
            >
              <div className="flex items-center gap-[var(--s-2)]">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-10 h-10 rounded-r-md object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-r-md bg-[var(--surface-2)] grid place-items-center shrink-0">
                    <ImageIcon className="w-4 h-4 text-[var(--fg-subtle)]" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-fs-sm font-semibold text-[var(--fg)] truncate">
                    {item.name}
                  </p>
                  <p className="text-fs-xs text-[var(--fg-subtle)] uppercase tracking-[0.04em] truncate">
                    {item.category_name}
                  </p>
                </div>
              </div>
              {s.activeVariant && (
                <span
                  className="inline-flex items-center w-fit h-[20px] px-2 rounded-r-full text-fs-xs font-medium"
                  style={{
                    background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                    color: 'var(--brand-500)',
                  }}
                >
                  {s.activeVariant.name}
                  {s.activeVariant.portion_size > 0 &&
                    ` · ${s.activeVariant.portion_size}${s.activeVariant.portion_size_unit}`}
                </span>
              )}
              <button
                onClick={() => router.push(`/${rid}/menu/items/${item.id}?tab=cost`)}
                className="inline-flex items-center gap-[var(--s-1)] text-fs-xs text-[var(--brand-500)] hover:text-[var(--brand-600)] transition-colors w-fit"
              >
                {t('openItemCta') || 'Ouvrir l’article'}
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Metrics table */}
        <div className="rounded-r-lg border border-[var(--line)] overflow-hidden bg-[var(--surface)] shadow-1">
          <MetricRow label={t('metricPrice') || 'Prix'} gridTemplate={gridTemplate}>
            {summaries.map(({ item, s }, i) => (
              <Cell key={item.id} style={rankStyle(i, priceRank.bestIdx, priceRank.worstIdx)}>
                {s.displayPrice > 0 ? `${s.displayPrice.toFixed(2)} ₪` : '—'}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricFoodCost') || 'Coût alimentaire'} gridTemplate={gridTemplate}>
            {summaries.map(({ item, s }, i) => (
              <Cell key={item.id} style={rankStyle(i, costRank.bestIdx, costRank.worstIdx)}>
                {s.hasIngredients ? (
                  <button
                    type="button"
                    onClick={() => setFoodCostIdx(i)}
                    className="hover:underline text-start"
                    title={t('showFoodCostBreakdown') || 'Détail du coût'}
                  >
                    {s.foodCost.toFixed(2)} ₪
                  </button>
                ) : (
                  '—'
                )}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricCostPct') || '% coût'} gridTemplate={gridTemplate}>
            {summaries.map(({ item, s }, i) => {
              const over = s.costPct > COST_THRESHOLD;
              const clickable = s.displayPrice > 0 && s.hasIngredients;
              return (
                <Cell key={item.id} style={rankStyle(i, pctRank.bestIdx, pctRank.worstIdx)}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => setBreakdownIdx(i)}
                      className={`hover:underline text-start ${over ? 'font-semibold' : ''}`}
                      style={over ? { color: 'var(--danger-500)' } : undefined}
                      title={t('showCostBreakdown') || 'Détail'}
                    >
                      {(s.costPct * 100).toFixed(1)}%
                      {over && ' ⚠'}
                    </button>
                  ) : (
                    '—'
                  )}
                </Cell>
              );
            })}
          </MetricRow>
          <MetricRow label={t('metricMargin') || 'Marge'} gridTemplate={gridTemplate}>
            {summaries.map(({ item, s }, i) => (
              <Cell key={item.id} style={rankStyle(i, marginRank.bestIdx, marginRank.worstIdx)}>
                {s.displayPrice > 0 && s.hasIngredients
                  ? `${s.margin.toFixed(2)} ₪`
                  : '—'}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricTopIngredient') || 'Ingrédient principal'} gridTemplate={gridTemplate}>
            {summaries.map(({ item, s }) => (
              <Cell key={item.id}>
                {s.topIngredient ? (
                  <span className="flex items-baseline gap-[var(--s-1)] min-w-0">
                    <span className="font-medium text-[var(--fg)] truncate">
                      {s.topIngredient.name}
                    </span>
                    <span className="text-fs-xs text-[var(--fg-subtle)] whitespace-nowrap">
                      ({(s.topIngredient.contributionPct * 100).toFixed(0)}%)
                    </span>
                  </span>
                ) : (
                  '—'
                )}
              </Cell>
            ))}
          </MetricRow>
          <MetricRow label={t('metricIngredientCount') || 'Ingrédients'} gridTemplate={gridTemplate}>
            {summaries.map(({ item, s }) => {
              const names = (ingredientsByItem[item.id] ?? [])
                .filter(
                  (ing) =>
                    ing.option_id == null ||
                    (s.activeVariant && s.activeVariant.id === `opt:${ing.option_id}`),
                )
                .map((ing) => ing.stock_item?.name ?? ing.prep_item?.name ?? '?');
              return (
                <Cell key={item.id}>
                  {s.ingredientCount > 0 ? (
                    <span
                      className="relative group inline-block cursor-help border-b border-dotted border-[var(--fg-subtle)]"
                      title={names.join(', ')}
                    >
                      {s.ingredientCount}
                    </span>
                  ) : (
                    '—'
                  )}
                </Cell>
              );
            })}
          </MetricRow>
          <MetricRow
            label={t('metricConfigIssues') || 'Problèmes de configuration'}
            gridTemplate={gridTemplate}
            last
          >
            {summaries.map(({ item, s }) => (
              <Cell key={item.id} align="start">
                {s.configIssues.length === 0 ? (
                  <span className="text-[var(--fg-subtle)]">—</span>
                ) : (
                  <ul className="flex flex-col gap-[var(--s-1)] py-[var(--s-1)]">
                    {s.configIssues.map(({ prep, issue }) => {
                      const reason =
                        issue === 'missing_yield'
                          ? t('prepMissingYield') || 'rendement manquant'
                          : issue === 'no_ingredients'
                            ? t('prepNoIngredients') || 'sans ingrédients'
                            : t('prepZeroCostIngredients') ||
                              'ingrédients sans coût d’achat';
                      return (
                        <li
                          key={prep.id}
                          className="flex items-start gap-[var(--s-1)] text-fs-xs"
                          style={{ color: 'var(--warning-500)' }}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="flex-1 text-[var(--fg)]">
                            <span className="font-semibold">{prep.name}</span>
                            {': '}
                            <span className="text-[var(--fg-muted)]">{reason}.</span>{' '}
                            <button
                              onClick={() => router.push(`/${rid}/kitchen/prep?edit=${prep.id}`)}
                              className="underline hover:no-underline"
                              style={{ color: 'var(--warning-500)' }}
                            >
                              {t('fix') || 'Corriger'} →
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

      {breakdownIdx != null &&
        summaries[breakdownIdx] &&
        (() => {
          const { item, s } = summaries[breakdownIdx];
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

      {foodCostIdx != null && summaries[foodCostIdx] && (
        <FoodCostBreakdownModal
          itemName={summaries[foodCostIdx].item.name}
          foodCost={summaries[foodCostIdx].s.foodCost}
          lines={summaries[foodCostIdx].s.lines}
          showCostsExVat={showCostsExVat}
          onClose={() => setFoodCostIdx(null)}
        />
      )}
    </div>
  );
}

function MetricRow({
  label,
  children,
  last,
  gridTemplate,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
  gridTemplate: string;
}) {
  return (
    <div
      className={`grid ${last ? '' : 'border-b border-[var(--line)]'}`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div className="px-[var(--s-4)] py-[var(--s-3)] text-fs-xs uppercase tracking-[0.06em] text-[var(--fg-muted)] font-medium bg-[var(--surface-2)] flex items-center">
        {label}
      </div>
      {children}
    </div>
  );
}

function Cell({
  children,
  className,
  style,
  align = 'center',
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  align?: 'start' | 'center';
}) {
  return (
    <div
      className={`px-[var(--s-4)] py-[var(--s-3)] font-mono tabular-nums text-fs-sm text-[var(--fg)] flex ${align === 'start' ? 'items-start' : 'items-center'} ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  );
}
