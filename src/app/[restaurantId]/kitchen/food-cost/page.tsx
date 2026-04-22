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
  ChevronDown, ChevronUp, Search, Sparkles,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  computeItemCostSummary, COST_THRESHOLD, buildVariantOptions,
} from '@/lib/cost-utils';
import KPIInfoModal, { KPI_INFO } from '@/components/common/KPIInfoModal';
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
  const [showKpis, setShowKpis] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);

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

  // KPI figures
  const averageFoodCost = enrichedList.length > 0
    ? enrichedList.reduce((sum, e) => sum + e.foodCostPercent, 0) / enrichedList.length
    : 0;
  const criticalItems = enrichedList.filter((e) => e.status === 'Critique').length;
  const totalMargin = enrichedList.reduce((sum, e) => sum + e.margin, 0);
  const goodItems = enrichedList.filter((e) => e.status === 'Bon').length;

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
    <div className="-mx-6 -my-6 lg:-mx-8 flex flex-col">
      {/* Header — Figma foodcost.tsx:80 */}
      <header className="bg-white dark:bg-[#111111] border-b border-neutral-200 dark:border-neutral-800 px-8 py-6">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {t('kitchen') || 'Cuisine'}
              </span>
              <ChevronDown size={14} className="rotate-[-90deg] text-neutral-400" />
              <span className="text-sm font-medium text-orange-500">Food Cost</span>
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Food Cost</h2>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              {t('foodCostSubtitle') || 'Analysez les coûts alimentaires de vos recettes'}
            </p>
          </div>
          <button
            onClick={() => setShowKpis((v) => !v)}
            className="p-3 border border-neutral-200 dark:border-neutral-700 rounded-xl hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors"
            title={showKpis ? 'Masquer les KPIs' : 'Afficher les KPIs'}
            aria-label="Toggle KPIs"
          >
            {showKpis ? (
              <ChevronUp size={20} className="text-neutral-600 dark:text-neutral-400" />
            ) : (
              <ChevronDown size={20} className="text-neutral-600 dark:text-neutral-400" />
            )}
          </button>
        </div>

        {/* KPIs — Figma:96 */}
        {showKpis && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => setSelectedKpi('food-cost-moyen')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border border-orange-200 dark:border-orange-700 rounded-xl p-4 hover:shadow-lg hover:border-orange-500 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="size-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
                  <DollarSign size={24} />
                </div>
              </div>
              <h3 className="text-orange-800 dark:text-orange-300 text-sm mb-1">
                {t('avgCostPct') || '% Coût Moyen'}
              </h3>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-200">
                {averageFoodCost.toFixed(1)}%
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpi('articles-critiques')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-700 rounded-xl p-4 hover:shadow-lg hover:border-red-500 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="size-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/25">
                  <AlertCircle size={24} />
                </div>
              </div>
              <h3 className="text-red-800 dark:text-red-300 text-sm mb-1">
                {t('criticalItems') || 'Articles Critiques'}
              </h3>
              <p className="text-2xl font-bold text-red-900 dark:text-red-200">{criticalItems}</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpi('marge-totale')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border border-green-200 dark:border-green-700 rounded-xl p-4 hover:shadow-lg hover:border-green-500 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="size-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white shadow-lg shadow-green-500/25">
                  <TrendingUp size={24} />
                </div>
              </div>
              <h3 className="text-green-800 dark:text-green-300 text-sm mb-1">
                {t('totalMargin') || 'Marge Totale'}
              </h3>
              <p className="text-2xl font-bold text-green-900 dark:text-green-200">
                {totalMargin.toFixed(2)} ₪
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedKpi('articles-optimaux')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 hover:shadow-lg hover:border-blue-500 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="size-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
                  <TrendingDown size={24} />
                </div>
              </div>
              <h3 className="text-blue-800 dark:text-blue-300 text-sm mb-1">
                {t('optimalItems') || 'Articles Optimaux'}
              </h3>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-200">{goodItems}</p>
            </button>
          </div>
        )}
      </header>

      {/* Chart Section — Figma:140 */}
      <div className="px-8 py-6 bg-white dark:bg-[#111111] border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {t('costDistribution') || 'Distribution des coûts'}
          </h3>
          <button
            onClick={() => setShowChart((v) => !v)}
            className="p-2 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors"
            title={showChart ? (t('hideChart') || 'Masquer le graphique') : (t('showChart') || 'Afficher le graphique')}
            aria-label="Toggle chart"
          >
            {showChart ? (
              <ChevronUp size={18} className="text-neutral-600 dark:text-neutral-400" />
            ) : (
              <ChevronDown size={18} className="text-neutral-600 dark:text-neutral-400" />
            )}
          </button>
        </div>
        {showChart && (
          <div className="h-64 bg-neutral-50 dark:bg-[#0a0a0a] rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
            {filteredItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
                {t('noItemsWithRecipes') || 'Aucun article avec une recette.'}
              </div>
            ) : (
              <div className="h-full flex items-stretch justify-around gap-2">
                {filteredItems.map((e) => {
                  const heightPercent = Math.max(5, Math.min(100, (e.foodCostPercent / 50) * 100));
                  return (
                    <div key={e.item.id} className="flex-1 flex flex-col justify-end gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => selectItem(e)}
                        title={`${e.item.name}: ${e.foodCostPercent.toFixed(1)}%`}
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-lg transition-all cursor-pointer hover:opacity-80 ${
                          e.status === 'Critique'
                            ? 'bg-gradient-to-t from-red-500 to-red-400'
                            : e.status === 'Attention'
                              ? 'bg-gradient-to-t from-orange-500 to-orange-400'
                              : 'bg-gradient-to-t from-green-500 to-green-400'
                        }`}
                      />
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate w-full text-center">
                        {e.foodCostPercent.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content — Figma:172 */}
      <div className="flex flex-1">
        {/* Items list */}
        <div className="w-96 shrink-0 bg-white dark:bg-[#111111] border-r border-neutral-200 dark:border-neutral-800 flex flex-col">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-3">
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
                className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'Tous' | 'Bon' | 'Attention' | 'Critique')}
                className="flex-1 px-3 py-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              >
                <option value="Tous">{t('allStatuses') || 'Tous les statuts'}</option>
                <option value="Bon">✓ Bon</option>
                <option value="Attention">⚠ Attention</option>
                <option value="Critique">✕ Critique</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="flex-1 px-3 py-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
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

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredItems.length === 0 && enrichedList.length === 0 && (
              <div className="text-center py-8 text-sm text-neutral-500 dark:text-neutral-400">
                <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-3" />
                {t('computingCosts') || 'Calcul des coûts...'}
              </div>
            )}
            {filteredItems.map((e) => (
              <button
                key={e.item.id}
                onClick={() => selectItem(e)}
                className={`w-full text-left p-4 rounded-xl transition-all ${
                  selectedItem?.item.id === e.item.id
                    ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500'
                    : 'bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-[#222222]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30 flex items-center justify-center text-xl shrink-0">
                    🍽️
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-neutral-900 dark:text-white truncate">
                      {e.item.name}
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                      {e.item.category_name}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-bold ${getFoodCostColor(e.foodCostPercent)}`}>
                        {e.foodCostPercent.toFixed(1)}%
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(e.status)}`}>
                        {e.status}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Details panel */}
        <div className="flex-1 bg-neutral-50 dark:bg-[#0a0a0a] p-8 overflow-y-auto">
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
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Item header */}
              <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="text-4xl">🍽️</div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
                      {selectedItem.item.name}
                    </h2>
                    <p className="text-neutral-600 dark:text-neutral-400">
                      {selectedItem.item.category_name}
                    </p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-lg border font-medium ${getStatusColor(selectedItem.status)}`}>
                    {selectedItem.status}
                  </span>
                </div>

                {/* Variants */}
                {selectedItem.variants.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.variants.map((v, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-lg text-sm font-medium"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}

                {/* Quick actions — feature preservation */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.item.id}?tab=recipe`)}
                    className="px-4 py-2 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-200 dark:hover:bg-[#222222] transition-colors text-sm font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    {t('viewRecipe') || 'Voir la recette'}
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-4 py-2 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-200 dark:hover:bg-[#222222] transition-colors text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5"
                  >
                    <Sparkles size={16} />
                    {t('importRecipe') || 'Importer la recette'}
                  </button>
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.item.id}?tab=cost`)}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium text-sm"
                  >
                    {t('editIngredients')?.replace('{name}', '').replace(/[:\s]+$/, '') || 'Modifier'} →
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
              />
            </div>
          )}
        </div>
      </div>

      {/* Top-header KPIs info modal (% Coût Moyen / Articles Critiques /
          Marge Totale / Articles Optimaux). The 3 selected-item KPIs now
          live inside <MenuItemTabCost /> with their own modals. */}
      <KPIInfoModal
        kpiInfo={selectedKpi ? KPI_INFO[selectedKpi] ?? null : null}
        onClose={() => setSelectedKpi(null)}
      />

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
