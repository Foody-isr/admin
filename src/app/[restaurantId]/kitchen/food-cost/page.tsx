'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
import { usePermissions } from '@/lib/permissions-context';
import {
  computeItemCostSummary, COST_THRESHOLD, buildVariantOptions,
} from '@/lib/cost-utils';
import { Button, ConfirmDialog, PageHead } from '@/components/ds';
import { FeatureIntro } from '@/components/help/FeatureIntro';
import MenuItemTabCost from '@/components/menu-item/MenuItemTabCost';

// Uses the shared recipe cost calculation; display changes never redefine margins or VAT.

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
      return 'bg-[var(--success-50)] text-[var(--success-500)] border-[var(--line)]';
    case 'Attention':
      return 'bg-[var(--warning-50)] text-[var(--warning-500)] border-[var(--line)]';
    case 'Critique':
      return 'bg-[var(--danger-50)] text-[var(--danger-500)] border-[var(--line)]';
    default:
      return '';
  }
}

function getFoodCostColor(percent: number) {
  if (percent >= 40) return 'text-[var(--danger-500)]';
  if (percent >= 35) return 'text-[var(--warning-500)]';
  return 'text-[var(--success-500)]';
}

export default function FoodCostPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [computing, setComputing] = useState(true);
  const [costErrors, setCostErrors] = useState(0);
  const [ingredientsError, setIngredientsError] = useState(false);
  const selection = useRef(0);
  const detailsRef = useRef<HTMLDivElement>(null);

  const [simulationState, setSimulationState] = useState({dirty:false,busy:false});
  const [pendingDestination, setPendingDestination] = useState<string | EnrichedItem | null>(null);
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => { if (simulationState.dirty || simulationState.busy) {event.preventDefault();event.returnValue='';} };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  }, [simulationState]);
  const navigateFromCost = (href:string) => {
    if (simulationState.busy) return;
    if (simulationState.dirty) setPendingDestination(href);
    else router.push(href);
  };
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
    navigateFromCost(`/${rid}/kitchen/food-cost/compare?ids=${ids}`);
  };

  // Enriched cache: item id → computed cost summary. Keyed by item to avoid
  // re-fetching ingredients for every item in the list (we only pull
  // ingredients when an item is selected).
  const [enrichedCache, setEnrichedCache] = useState<Map<number, EnrichedItem>>(new Map());

  const reload = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [cats, stock, prep, settings] = await Promise.all([
        getAllCategories(rid, { withRecipeOnly: true }),
        listStockItems(rid),
        listPrepItems(rid),
        getRestaurantSettings(rid),
      ]);
      setVatRate(settings.vat_rate ?? 18);
      setCategories(cats);
      setStockItems(stock);
      setPrepItems(prep);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

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
    if (allItems.length === 0) { setEnrichedCache(new Map()); setComputing(false); setCostErrors(0); return; }
    setComputing(true); setCostErrors(0);
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        allItems.map(async (item) => {
          try {
            const [ings, overrides] = await Promise.all([
              getMenuItemIngredients(rid, item.id),
              getItemOptionPrices(rid, item.id),
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
      setCostErrors(entries.filter(entry => !entry).length);
      setComputing(false);
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

  const selectItem = (enriched: EnrichedItem) => {
    if (simulationState.busy) return;
    if (simulationState.dirty) setPendingDestination(enriched);
    else return loadSelectedItem(enriched);
  };
  const loadSelectedItem = async (enriched: EnrichedItem) => {
    setSimulationState({dirty:false,busy:false});
    const requestId = ++selection.current;
    setSelectedItem(enriched);
    setIngredientsError(false); setLoadingIngredients(true);
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ block: window.innerWidth < 1280 ? 'start' : 'nearest' }));
    try {
      const [ings, overrides] = await Promise.all([
        getMenuItemIngredients(rid, enriched.item.id),
        getItemOptionPrices(rid, enriched.item.id),
      ]);
      if (requestId !== selection.current) return;
      setIngredients(ings);
      setItemOptionOverrides(overrides);
    } catch {
      if (requestId === selection.current) setIngredientsError(true);
    } finally {
      if (requestId === selection.current) setLoadingIngredients(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (loadError) return <div><PageHead title={t('costsAndMargins')} /><div role="alert" className="mb-4 text-[var(--danger-500)]">{t('workspaceLoadError')}</div><Button onClick={reload}>{t('retry')}</Button></div>;

  const statusLabel = (status: EnrichedItem['status']) => t(status === 'Bon' ? 'good' : status === 'Attention' ? 'warnStatus' : 'critical');
  return (
    <div className="flex min-w-0 flex-col">
      <PageHead
        title={t('costsAndMargins')}
        desc={t('foodCostSubtitle') || 'Analysez les coûts alimentaires de vos recettes'}
      />

      <div className="mb-4">
        <FeatureIntro feature="foodCost" />
      </div>

      {/* Chart Section — cost % per item with target line + legend */}
      <div className="p-4 sm:p-5 bg-[var(--summary-bg)] text-[var(--summary-fg)] rounded-r-lg border border-[var(--line)]">
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
                {t('critical') || 'Critique'} ≥40 %
              </span>
            </div>
            <button
              onClick={() => setShowChart((v) => !v)}
              className="p-2 border border-[var(--line)] rounded-r-md hover:bg-[var(--surface-2)] transition-colors"
              title={showChart ? (t('hideChart') || 'Masquer le graphique') : (t('showChart') || 'Afficher le graphique')}
              aria-expanded={showChart}
              aria-label={showChart ? t('hideChart') : t('showChart')}
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
          <div className="h-64 overflow-x-auto bg-[var(--bg)] rounded-r-lg border border-[var(--line)] p-[var(--s-4)] relative">
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
                        <span className="text-fs-xs font-mono tabular-nums text-[var(--fg-subtle)] w-8 text-end pe-1">
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
                      style={{ borderColor: 'var(--brand-ink)', opacity: 0.7 }}
                    />
                    <span
                      className="text-fs-xs font-mono tabular-nums px-1 rounded-[2px] ms-1"
                      style={{
                        color: 'var(--brand-ink)',
                        background:
                          'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                      }}
                    >
                      {t('target') || 'Cible'} 35%
                    </span>
                  </div>
                </div>

                {/* Bars */}
                <div className="h-full ps-8 pe-10 flex items-stretch justify-around gap-[var(--s-2)] relative" style={{ minWidth: Math.max(260, filteredItems.length * 72) }}>
                  {!computing && costErrors > 0 && <div role="alert" className="text-fs-sm text-[var(--danger-500)]">{t('foodCostLoadIncomplete')}<Button className="mt-2" onClick={reload}>{t('retry')}</Button></div>}
            {!computing && filteredItems.length === 0 && <p className="py-6 text-fs-sm text-[var(--fg-muted)]">{enrichedList.length ? t('noResults') : t('noItemsWithRecipes')}</p>}
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
                          aria-label={`${e.item.name}: ${e.foodCostPercent.toFixed(1)}% · ${statusLabel(e.status)}`}
                          style={{
                            height: `${heightPercent}%`,
                            background: color,
                          }}
                          className="w-full rounded-t-sm transition-all cursor-pointer hover:opacity-80"
                        />
                        <span className="text-fs-xs text-[var(--fg-muted)] truncate w-full text-center">
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

      {/* Content — content row sits below the chart. Both columns wrap their
          surface/card backgrounds inside the pt-[var(--s-6)] spacer so the
          left panel's light surface and the right panel's L'OR ROUGE card top
          start on the exact same horizontal line. */}
      <div className="grid min-w-0 gap-5 mt-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Items list — outer holds the top spacer; inner holds the surface
            background and border so the bg starts at the same Y as the
            right-side card top. */}
        <div className="min-w-0 flex flex-col">
          <div className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] flex-1 flex flex-col min-h-0">
          {/* Selector block — natural height; bottom padding kept tight so
              the items list begins right under the count text, with no dead
              space pushing the first card down. */}
          <div className="px-[var(--s-6)] pt-[var(--s-5)] pb-[var(--s-3)] border-b border-[var(--line)] space-y-[var(--s-3)]">
            <div className="relative">
              <Search
                className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]"
                size={18}
              />
              <input
                type="text"
                aria-label={t('searchItem')}
                placeholder={t('searchItem') || 'Rechercher un article...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg)] placeholder:text-[var(--fg-subtle)] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t('allStatuses')}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'Tous' | 'Bon' | 'Attention' | 'Critique')}
                className="min-w-0 min-h-10 flex-1 px-3 py-2 border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              >
                <option value="Tous">{t('allStatuses') || 'Tous les statuts'}</option>
                <option value="Bon">{t('good')}</option>
                <option value="Attention">{t('warnStatus')}</option>
                <option value="Critique">{t('critical')}</option>
              </select>
              <select
                aria-label={t('sort')}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="min-w-0 min-h-10 flex-1 px-3 py-2 border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              >
                <option value="cost-high">{t('costHigh') || 'Coût ↓'}</option>
                <option value="cost-low">{t('costLow') || 'Coût ↑'}</option>
                <option value="margin-high">{t('marginHigh') || 'Marge ↓'}</option>
                <option value="margin-low">{t('marginLow') || 'Marge ↑'}</option>
                <option value="name">A → Z</option>
              </select>
            </div>
            <div className="text-xs text-[var(--fg-muted)]">
              {filteredItems.length} · {t('items')}
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
                  className="inline-flex items-center h-8 px-[var(--s-3)] rounded-r-md text-fs-sm font-medium bg-[var(--action)] text-[var(--action-fg)] hover:bg-[var(--action-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('compareCosts') || 'Comparer'}
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-[var(--s-3)] space-y-2">
            {computing && (
              <div className="text-center py-8 text-sm text-[var(--fg-muted)]">
                <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-3" />
                {t('computingCosts') || 'Calcul des coûts...'}
              </div>
            )}
            {!computing && costErrors > 0 && <div role="alert" className="text-fs-sm text-[var(--danger-500)]">{t('foodCostLoadIncomplete')}<Button className="mt-2" onClick={reload}>{t('retry')}</Button></div>}
            {!computing && filteredItems.length === 0 && <p className="py-6 text-fs-sm text-[var(--fg-muted)]">{enrichedList.length ? t('noResults') : t('noItemsWithRecipes')}</p>}
            {filteredItems.map((e) => {
              const checked = compareIds.has(e.item.id);
              const maxReached = !checked && compareIds.size >= MAX_COMPARE;
              return (
                <div
                  key={e.item.id}
                  className={`relative w-full p-3 rounded-r-md border transition-colors ${
                    selectedItem?.item.id === e.item.id
                      ? 'bg-[var(--brand-soft)] border-[var(--brand-ink)]'
                      : checked
                        ? 'bg-[var(--surface-2)] border-[var(--brand-ink)]'
                        : 'bg-[var(--surface)] border-[var(--line)] hover:bg-[var(--surface-2)]'
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
                      aria-label={`${t('compareCosts')} · ${e.item.name}`}
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
                      className="flex-1 min-w-0 text-start flex items-start gap-3"
                    >
                      {e.item.image_url ? (
                        <img
                          src={e.item.image_url}
                          alt=""
                          className="size-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="size-10 rounded-lg bg-[var(--summary-bg)] flex items-center justify-center shrink-0">
                          <ImageIcon className="w-4 h-4 text-[var(--summary-fg)]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[var(--fg)] break-words">
                          {e.item.name}
                        </h3>
                        <p className="text-xs text-[var(--fg-muted)] mb-2">
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
                            {statusLabel(e.status)}
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
        </div>

        {/* Details panel — top padding matches the items-list header (24px)
            so the L'OR ROUGE header card aligns with the search bar on the
            left. Sides/bottom stay at 32px for detail-view breathing room. */}
        <div ref={detailsRef} className="min-w-0 scroll-mt-20">
          {!selectedItem ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <DollarSign aria-hidden className="mx-auto mb-4 h-10 w-10 text-[var(--summary-fg)]" />
                <h3 className="text-xl font-semibold text-[var(--fg)] mb-2">
                  {t('selectItem') || 'Sélectionnez un article'}
                </h3>
                <p className="text-[var(--fg-muted)]">
                  {t('chooseItemForFoodCost') || 'Choisissez un article dans la liste pour voir ses détails de coût'}
                </p>
              </div>
            </div>
          ) : ingredientsError ? (
            <div role="alert" className="rounded-r-lg border border-[var(--line)] p-5 text-[var(--danger-500)]">{t('workspaceLoadError')}<Button className="mt-3" onClick={() => selectItem(selectedItem)}>{t('retry')}</Button></div>
          ) : loadingIngredients ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="max-w-5xl space-y-[var(--s-5)]">
              {/* Item header — portion variants removed (already shown as "Portion active" chips
                  inside the Coût section below); actions consolidated to a single primary CTA. */}
              <div className="bg-[var(--summary-bg)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
                <div className="flex flex-wrap items-start gap-[var(--s-4)]">
                  {selectedItem.item.image_url ? (
                    <img
                      src={selectedItem.item.image_url}
                      alt=""
                      className="size-16 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="size-16 rounded-lg bg-[var(--summary-bg)] flex items-center justify-center shrink-0">
                      <ImageIcon className="w-6 h-6 text-[var(--summary-fg)]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-fs-xl font-semibold text-[var(--summary-fg)] mb-1 break-words">
                      {selectedItem.item.name}
                    </h2>
                    <p className="text-fs-sm text-[var(--fg-muted)]">
                      {selectedItem.item.category_name}
                    </p>
                  </div>
                  <span
                    className={`px-[var(--s-3)] py-1.5 rounded-r-sm font-medium text-fs-xs ${getStatusColor(selectedItem.status)}`}
                  >
                    {statusLabel(selectedItem.status)}
                  </span>
                </div>

                {/* Single primary action — opens the item edit modal on Recipe tab. */}
                {canManage && (
                  <div className="mt-[var(--s-4)] flex items-center justify-end">
                    <button
                      onClick={() => router.push(`/${rid}/menu/items/${selectedItem.item.id}?tab=recipe`)}
                      className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-10 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-fg)] rounded-r-md transition-colors font-medium text-fs-sm"
                    >
                      {t('modifyIngredients')}
                    </button>
                  </div>
                )}
              </div>

              {/* Shared cost section — same component used in the menu-item
                  Coût tab. Clickable KPIs, clickable ingredients, enhanced
                  suggestions. */}
              <MenuItemTabCost
                key={selectedItem.item.id}
                onNavigate={navigateFromCost}
                onSimulationStateChange={setSimulationState}
                rid={rid}
                item={selectedItem.item}
                ingredients={ingredients}
                itemOptionOverrides={itemOptionOverrides}
                vatRate={vatRate}
                price={selectedItem.item.price}
                onChangesApplied={async () => {
                  const id = selectedItem.item.id;
                  const [cats, nextIngredients, overrides, stock, prep] = await Promise.all([
                    getAllCategories(rid, {withRecipeOnly:true}), getMenuItemIngredients(rid,id), getItemOptionPrices(rid,id), listStockItems(rid), listPrepItems(rid),
                  ]);
                  const fresh = cats.flatMap(category => (category.items ?? []).map(item => ({...item,category_name:category.name}))).find(item => item.id === id);
                  if (!fresh) throw new Error(t('itemNotFound'));
                  setCategories(cats); setStockItems(stock); setPrepItems(prep);
                  setIngredients(nextIngredients); setItemOptionOverrides(overrides);
                  setSelectedItem(previous => previous?.item.id === id ? {...previous,item:fresh} : previous);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={pendingDestination !== null} onOpenChange={open => { if (!open) setPendingDestination(null); }} title={t('discardUnsavedChanges')} description={t('simulatorDiscardHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => {
        const destination = pendingDestination; setPendingDestination(null);
        if (typeof destination === 'string') router.push(destination);
        else if (destination) void loadSelectedItem(destination);
      }}/>
      {canManage && showImportModal && selectedItem && (
        <RecipeImportModal
          rid={rid}
          mode={{ kind: 'menu-item', menuItem: selectedItem.item }}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={async () => {
            await reload();
          }}
        />
      )}
    </div>
  );
}
