'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, listStockItems, listPrepItems,
  getMenuItemIngredients, getItemOptionPrices,
  getRestaurantSettings,
  MenuCategory, MenuItem, MenuItemIngredient,
  StockItem, PrepItem, ItemOptionOverride,
} from '@/lib/api';
import RecipeImportModal from '../RecipeImportModal';
import {
  DollarSign, TrendingDown, TrendingUp, AlertCircle,
  ChevronDown, ChevronUp, Search, Sparkles, Image as ImageIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  computeItemCostSummary, COST_THRESHOLD, buildVariantOptions,
} from '@/lib/cost-utils';
import { Button, PageHead } from '@/components/ds';
import MenuItemTabCost from '@/components/menu-item/MenuItemTabCost';

// Figma page: foodyadmin_figma/src/app/pages/cuisine/foodcost.tsx
// We replace the Figma mock data with real cost math via computeItemCostSummary.

interface EnrichedItem {
  item: MenuItem & { category_name: string };
  foodCost: number;
  foodCostPercent: number; // 0-100
  margin: number;
  status: 'Bon' | 'Attention' | 'Critique';
  variants: string[];
}

type SortOption = 'name' | 'cost-high' | 'cost-low' | 'margin-high' | 'margin-low';

function statusFor(pct: number): 'Bon' | 'Attention' | 'Critique' {
  if (pct >= 40) return 'Critique';
  if (pct >= COST_THRESHOLD * 100) return 'Attention';
  return 'Bon';
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Bon':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
    case 'Attention':
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800';
    case 'Critique':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
    default:
      return '';
  }
}

function getFoodCostColor(percent: number) {
  if (percent >= 40) return 'text-red-600 dark:text-red-400';
  if (percent >= 35) return 'text-orange-600 dark:text-orange-400';
  return 'text-green-600 dark:text-green-400';
}

export default function FoodCostPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedItem, setSelectedItem] = useState<EnrichedItem | null>(null);
  const [ingredients, setIngredients] = useState<MenuItemIngredient[]>([]);
  const [itemOptionOverrides, setItemOptionOverrides] = useState<ItemOptionOverride[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Tous' | 'Bon' | 'Attention' | 'Critique'>('Tous');
  const [sortBy, setSortBy] = useState<SortOption>('cost-high');
  const [vatRate, setVatRate] = useState(18);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showChart, setShowChart] = useState(true);
  // Cost-comparison multi-select. 2–6 items, triggered via the bar shown above
  // the items list when anything is selected.
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const MIN_COMPARE = 2;
  const MAX_COMPARE = 6;
  const toggleCompareId = (id: number) =>
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  const clearCompare = () => setCompareIds(new Set());
  const goCompare = () => {
    if (compareIds.size < MIN_COMPARE) return;
    const ids = Array.from(compareIds).join(',');
    router.push(`/${rid}/kitchen/food-cost/compare?ids=${ids}`);
  };

  // Enriched cache: item id → computed cost summary. Keyed by item to avoid
  // re-fetching ingredients for every item in the list (we only pull
  // ingredients when an item is selected).
  const [enrichedCache, setEnrichedCache] = useState<Map<number, EnrichedItem>>(new Map());

  const reload = useCallback(async () => {
    try {
      const [cats, stock, prep] = await Promise.all([
        getAllCategories(rid, { withRecipeOnly: true }),
        listStockItems(rid),
        listPrepItems(rid),
      ]);
      setCategories(cats);
      setStockItems(stock);
      setPrepItems(prep);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    getRestaurantSettings(rid).then((s) => setVatRate(s.vat_rate ?? 18)).catch(() => {});
  }, [rid]);

  // All menu items flattened
  const allItems = useMemo(
    () => categories.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, category_name: c.name }))),
    [categories],
  );

  // Bulk-load ingredients for every item on first render so we can compute
  // cost % for the list view. Firing N parallel requests is reasonable for
  // this view (catalog is small on normal restaurants). Later we can switch
  // to a backend endpoint that returns pre-computed summaries.
  useEffect(() => {
    if (allItems.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        allItems.map(async (item) => {
          try {
            const [ings, overrides] = await Promise.all([
              getMenuItemIngredients(rid, item.id),
              getItemOptionPrices(rid, item.id).catch(() => [] as ItemOptionOverride[]),
            ]);
            const s = computeItemCostSummary({
              item,
              ingredients: ings,
              overrides,
              vatRate,
              showCostsExVat: true,
            });
            const pct = s.costPct * 100;
            const variantNames = buildVariantOptions(item, overrides).map((v) => v.name);
            return [
              item.id,
              {
                item,
                foodCost: s.foodCost,
                foodCostPercent: pct,
                margin: s.margin,
                status: statusFor(pct),
                variants: variantNames,
              } as EnrichedItem,
            ] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setEnrichedCache(new Map(entries.filter(Boolean) as Array<readonly [number, EnrichedItem]>));
    })();
    return () => {
      cancelled = true;
    };
  }, [rid, allItems, vatRate]);

  const enrichedList = useMemo(() => Array.from(enrichedCache.values()), [enrichedCache]);

  const filteredItems = useMemo(
    () =>
      enrichedList
        .filter((e) => {
          const matchesSearch = e.item.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesStatus = statusFilter === 'Tous' || e.status === statusFilter;
          return matchesSearch && matchesStatus;
        })
        .sort((a, b) => {
          switch (sortBy) {
            case 'name':
              return a.item.name.localeCompare(b.item.name);
            case 'cost-high':
              return b.foodCostPercent - a.foodCostPercent;
            case 'cost-low':
              return a.foodCostPercent - b.foodCostPercent;
            case 'margin-high':
              return b.margin - a.margin;
            case 'margin-low':
              return a.margin - b.margin;
            default:
              return 0;
          }
        }),
    [enrichedList, searchTerm, statusFilter, sortBy],
  );

  const selectItem = async (enriched: EnrichedItem) => {
    setSelectedItem(enriched);
    setLoadingIngredients(true);
    try {
      const [ings, overrides] = await Promise.all([
        getMenuItemIngredients(rid, enriched.item.id),
        getItemOptionPrices(rid, enriched.item.id).catch(() => [] as ItemOptionOverride[]),
      ]);
      setIngredients(ings);
      setItemOptionOverrides(overrides);
    } catch {
      setIngredients([]);
      setItemOptionOverrides([]);
    } finally {
      setLoadingIngredients(false);
    }
  };

  const selectedSummary = useMemo(() => {
    if (!selectedItem) return null;
    return computeItemCostSummary({
      item: selectedItem.item,
      ingredients,
      overrides: itemOptionOverrides,
      vatRate,
      showCostsExVat: true,
    });
  }, [selectedItem, ingredients, itemOptionOverrides, vatRate]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHead
        title="Food Cost"
        desc={t('foodCostSubtitle') || 'Analysez les coûts alimentaires de vos recettes'}
      />

      {/* Chart Section — cost % per item with target line + legend */}
      <div className="px-8 py-6 bg-[var(--surface)] border-b border-[var(--line)]">
        <div className="flex items-center justify-between mb-[var(--s-2)] gap-[var(--s-4)]">
          <div className="min-w-0">
            <h3 className="text-fs-lg font-semibold text-[var(--fg)]">
              {t('costDistribution') || 'Répartition des coûts'}
            </h3>
            <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
              {t('costDistributionDesc') ||
                '% de coût matière par plat · cible 35 %'}
            </p>
          </div>
          <div className="flex items-center gap-[var(--s-4)] shrink-0">
            {/* Legend */}
            <div className="hidden md:flex items-center gap-[var(--s-3)] text-fs-xs text-[var(--fg-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--success-500)]" />
                {t('good') || 'Bon'} &lt;35 %
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--warning-500)]" />
                {t('warnStatus') || 'Attention'} 35–40 %
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--danger-500)]" />
                {t('critical') || 'Critique'} &gt;40 %
              </span>
            </div>
            <button
              onClick={() => setShowChart((v) => !v)}
              className="p-2 border border-[var(--line)] rounded-r-md hover:bg-[var(--surface-2)] transition-colors"
              title={showChart ? (t('hideChart') || 'Masquer le graphique') : (t('showChart') || 'Afficher le graphique')}
              aria-label="Toggle chart"
            >
              {showChart ? (
                <ChevronUp size={16} className="text-[var(--fg-muted)]" />
              ) : (
                <ChevronDown size={16} className="text-[var(--fg-muted)]" />
              )}
            </button>
          </div>
        </div>
        {showChart && (
          <div className="h-64 bg-[var(--bg)] rounded-r-lg border border-[var(--line)] p-[var(--s-4)] relative">
            {filteredItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-fs-sm text-[var(--fg-muted)]">
                {t('noItemsWithRecipes') || 'Aucun article avec une recette.'}
              </div>
            ) : (
              <>
                {/* Y-axis gridlines + labels. 0 % at bottom, 50 % at top. */}
                <div className="absolute inset-[var(--s-4)] pointer-events-none">
                  {[0, 25, 50, 75, 100].map((pct) => {
                    // pct of chart height = (1 - value/50) since axis runs 0-50%
                    const value = Math.round((pct / 100) * 50);
                    return (
                      <div
                        key={pct}
                        className="absolute inset-x-0 flex items-center"
                        style={{ top: `${pct}%` }}
                      >
                        <span className="text-[10px] font-mono tabular-nums text-[var(--fg-subtle)] w-8 text-right pr-1">
                          {50 - value}%
                        </span>
                        <span className="flex-1 border-t border-dashed border-[var(--line)] opacity-50" />
                      </div>
                    );
                  })}
                  {/* 35 % target line in brand color */}
                  <div
                    className="absolute inset-x-8 flex items-center"
                    style={{ top: `${((50 - 35) / 50) * 100}%` }}
                  >
                    <span
                      className="flex-1 border-t-2 border-dashed"
                      style={{ borderColor: 'var(--brand-500)', opacity: 0.7 }}
                    />
                    <span
                      className="text-[10px] font-mono tabular-nums px-1 rounded-[2px] ms-1"
                      style={{
                        color: 'var(--brand-500)',
                        background:
                          'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                      }}
                    >
                      {t('target') || 'Cible'} 35%
                    </span>
                  </div>
                </div>

                {/* Bars */}
                <div className="h-full ps-8 pe-10 flex items-stretch justify-around gap-[var(--s-2)] relative">
                  {filteredItems.map((e) => {
                    const heightPercent = Math.max(
                      3,
                      Math.min(100, (e.foodCostPercent / 50) * 100),
                    );
                    const color =
                      e.status === 'Critique'
                        ? 'var(--danger-500)'
                        : e.status === 'Attention'
                          ? 'var(--warning-500)'
                          : 'var(--success-500)';
                    return (
                      <div
                        key={e.item.id}
                        className="flex-1 flex flex-col justify-end items-center gap-1.5 min-w-0"
                      >
                        <span className="text-fs-xs font-mono tabular-nums font-semibold text-[var(--fg)]">
                          {e.foodCostPercent.toFixed(0)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => selectItem(e)}
                          title={`${e.item.name}: ${e.foodCostPercent.toFixed(1)}% · ${e.status}`}
                          style={{
                            height: `${heightPercent}%`,
                            background: color,
                          }}
                          className="w-full rounded-t-sm transition-all cursor-pointer hover:opacity-80"
                        />
                        <span className="text-fs-xs text-[var(--fg-muted)] truncate w-full text-center uppercase tracking-[.02em]">
                          {e.item.name.length > 10
                            ? `${e.item.name.slice(0, 9)}…`
                            : e.item.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content — content row sits below the chart with the same breathing
          room on both panels (search/filter column on the left, item detail
          on the right). Both panels apply pt at the outer level so the
          search bar (left) and the item header card (right) start on the
          same horizontal line. */}
      <div className="flex flex-1 mt-[var(--s-6)]">
        {/* Items list */}
        <div className="w-96 shrink-0 bg-[var(--surface)] border-r border-[var(--line)] flex flex-col pt-[var(--s-6)]">
          {/* Selector block — fixed min-height pairs with the right header
              card's matching min-h so both blocks end on the same horizontal
              line (search + filters + count sit at the top; any extra space
              falls below the count, just above the bottom border). */}
          <div className="px-[var(--s-6)] pb-[var(--s-6)] border-b border-[var(--line)] space-y-[var(--s-3)] min-h-[184px]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                size={18}
              />
              <input
                type="text"
                placeholder={t('searchItem') || 'Rechercher un article...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 dark:border-neutral-700 bg-[var(--surface-2)] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'Tous' | 'Bon' | 'Attention' | 'Critique')}
                className="flex-1 px-3 py-2 border border-neutral-200 dark:border-neutral-700 bg-[var(--surface-2)] text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              >
                <option value="Tous">{t('allStatuses') || 'Tous les statuts'}</option>
                <option value="Bon">✓ Bon</option>
                <option value="Attention">⚠ Attention</option>
                <option value="Critique">✕ Critique</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="flex-1 px-3 py-2 border border-neutral-200 dark:border-neutral-700 bg-[var(--surface-2)] text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              >
                <option value="cost-high">{t('costHigh') || 'Coût ↓'}</option>
                <option value="cost-low">{t('costLow') || 'Coût ↑'}</option>
                <option value="margin-high">{t('marginHigh') || 'Marge ↓'}</option>
                <option value="margin-low">{t('marginLow') || 'Marge ↑'}</option>
                <option value="name">A → Z</option>
              </select>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {filteredItems.length} article{filteredItems.length > 1 ? 's' : ''}
            </div>
          </div>

          {/* Compare bar — appears when 1+ items selected. Button enables at 2. */}
          {compareIds.size > 0 && (
            <div
              className="flex items-center justify-between gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-2)] border-b border-[var(--line)]"
              style={{
                background: 'color-mix(in oklab, var(--brand-500) 10%, var(--surface))',
              }}
            >
              <div className="flex items-center gap-[var(--s-2)] text-fs-sm min-w-0">
                <span className="font-semibold text-[var(--brand-500)] tabular-nums">
                  {compareIds.size}
                </span>
                <span className="text-[var(--fg-muted)] truncate">
                  {compareIds.size < MIN_COMPARE
                    ? t('compareMinHint') || `Sélectionnez ${MIN_COMPARE}+ articles`
                    : t('selectedCount')?.replace('{n}', String(compareIds.size)) ||
                      `${compareIds.size} sélectionnés`}
                </span>
              </div>
              <div className="flex items-center gap-[var(--s-1)] shrink-0">
                <button
                  type="button"
                  onClick={clearCompare}
                  className="text-fs-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] px-[var(--s-2)] py-1 transition-colors"
                >
                  {t('deselectAll') || 'Effacer'}
                </button>
                <button
                  type="button"
                  onClick={goCompare}
                  disabled={compareIds.size < MIN_COMPARE}
                  className="inline-flex items-center h-8 px-[var(--s-3)] rounded-r-md text-fs-sm font-medium bg-[var(--brand-500)] text-white hover:bg-[var(--brand-600)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('compareCosts') || 'Comparer'}
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredItems.length === 0 && enrichedList.length === 0 && (
              <div className="text-center py-8 text-sm text-neutral-500 dark:text-neutral-400">
                <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-3" />
                {t('computingCosts') || 'Calcul des coûts...'}
              </div>
            )}
            {filteredItems.map((e) => {
              const checked = compareIds.has(e.item.id);
              const maxReached = !checked && compareIds.size >= MAX_COMPARE;
              return (
                <div
                  key={e.item.id}
                  className={`relative w-full p-4 rounded-xl transition-all ${
                    selectedItem?.item.id === e.item.id
                      ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500'
                      : checked
                        ? 'bg-[var(--surface-2)] border-2 border-[var(--brand-500)]'
                        : 'bg-[var(--surface-2)] border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-[#222222]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Compare-mode checkbox. Stop propagation so clicking it
                        doesn't also open the detail view. */}
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (!maxReached) toggleCompareId(e.item.id);
                      }}
                      disabled={maxReached}
                      title={
                        maxReached
                          ? t('compareMaxHint') || `Max ${MAX_COMPARE} articles`
                          : undefined
                      }
                      className={`shrink-0 w-5 h-5 rounded-r-sm grid place-items-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        checked
                          ? 'bg-[var(--brand-500)] border border-[var(--brand-500)]'
                          : 'bg-[var(--surface)] border border-[var(--line-strong)] hover:border-[var(--fg-subtle)]'
                      }`}
                      aria-label={t('compareCosts') || 'Comparer les coûts'}
                      aria-pressed={checked}
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 12 12"
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="m2.5 6.5 2.5 2.5 4.5-5" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectItem(e)}
                      className="flex-1 min-w-0 text-left flex items-start gap-3"
                    >
                      {e.item.image_url ? (
                        <img
                          src={e.item.image_url}
                          alt=""
                          className="size-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="size-10 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30 flex items-center justify-center shrink-0">
                          <ImageIcon className="w-4 h-4 text-orange-600 dark:text-orange-200" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-neutral-900 dark:text-white truncate">
                          {e.item.name}
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                          {e.item.category_name}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-sm font-bold ${getFoodCostColor(e.foodCostPercent)}`}
                          >
                            {e.foodCostPercent.toFixed(1)}%
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(e.status)}`}
                          >
                            {e.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Details panel — top padding matches the items-list header (24px)
            so the L'OR ROUGE header card aligns with the search bar on the
            left. Sides/bottom stay at 32px for detail-view breathing room. */}
        <div className="flex-1 bg-[var(--bg)] px-8 pt-[var(--s-6)] pb-8 overflow-y-auto">
          {!selectedItem ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                  {t('selectItem') || 'Sélectionnez un article'}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {t('chooseItemForFoodCost') || 'Choisissez un article dans la liste pour voir ses détails de coût'}
                </p>
              </div>
            </div>
          ) : loadingIngredients ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-[var(--s-5)]">
              {/* Item header — portion variants removed (already shown as "Portion active" chips
                  inside the Coût section below); actions consolidated to a single primary CTA.
                  min-h pairs with the left selector block so both blocks end on
                  the same horizontal line. flex-col + mt-auto on the action row
                  pushes the button to the card's bottom edge. */}
              <div className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)] min-h-[184px] flex flex-col">
                <div className="flex items-start gap-[var(--s-4)]">
                  {selectedItem.item.image_url ? (
                    <img
                      src={selectedItem.item.image_url}
                      alt=""
                      className="size-16 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="size-16 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-6 h-6 text-orange-600 dark:text-orange-200" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-fs-2xl font-semibold text-[var(--fg)] mb-1 truncate">
                      {selectedItem.item.name}
                    </h2>
                    <p className="text-fs-sm text-[var(--fg-muted)] uppercase tracking-[.04em]">
                      {selectedItem.item.category_name}
                    </p>
                  </div>
                  <span
                    className={`px-[var(--s-3)] py-1.5 rounded-r-sm font-medium text-fs-xs ${getStatusColor(selectedItem.status)}`}
                  >
                    {selectedItem.status}
                  </span>
                </div>

                {/* Single primary action — opens the item edit modal on Recipe tab.
                    mt-auto pushes the row to the card's bottom edge under min-h. */}
                <div className="mt-auto pt-[var(--s-4)] flex items-center justify-end">
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.item.id}?tab=recipe`)}
                    className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-10 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-r-md transition-colors font-medium text-fs-sm"
                  >
                    {t('modifyIngredients') || 'Modifier les ingrédients'} →
                  </button>
                </div>
              </div>

              {/* Shared cost section — same component used in the menu-item
                  Coût tab. Clickable KPIs, clickable ingredients, enhanced
                  suggestions. */}
              <MenuItemTabCost
                rid={rid}
                item={selectedItem.item}
                ingredients={ingredients}
                itemOptionOverrides={itemOptionOverrides}
                vatRate={vatRate}
                price={selectedItem.item.price}
                onChangesApplied={async () => {
                  // Refetch categories + the selected item's ingredients +
                  // overrides so the simulator's persisted edits flow back
                  // through into the KPI cards and breakdown table.
                  await reload();
                  if (selectedItem) await selectItem(selectedItem);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {showImportModal && selectedItem && (
        <RecipeImportModal
          rid={rid}
          mode={{ kind: 'menu-item', menuItem: selectedItem.item }}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={async () => {
            setShowImportModal(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}
