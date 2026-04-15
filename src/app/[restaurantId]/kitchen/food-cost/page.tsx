'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, listStockItems, listPrepItems,
  getMenuItemIngredients, setMenuItemIngredients,
  getItemOptionPrices,
  updateStockItem,
  setRecipeYield,
  getRestaurantSettings,
  MenuCategory, MenuItem, MenuItemIngredient,
  StockItem, PrepItem, StockItemInput, ItemOptionOverride,
} from '@/lib/api';
import RecipeImportModal from '../RecipeImportModal';
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon, CurrencyDollarIcon,
  SparklesIcon, PencilIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import StockQuantityForm, {
  StockInput, serverToStockInput, stockInputToServer,
} from '@/components/stock/StockQuantityForm';
import { convertQuantity, toBaseUnit } from '@/lib/units';
import { detectPrepSwaps } from '@/lib/prep-swap';

const COST_THRESHOLD = 0.35; // 35% food cost warning

export default function FoodCostPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t, locale } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [ingredients, setIngredients] = useState<MenuItemIngredient[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);

  const [search, setSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingYield, setEditingYield] = useState(false);
  const [yieldValue, setYieldValue] = useState(0);
  const [yieldUnit, setYieldUnit] = useState('kg');
  const [editingStockItem, setEditingStockItem] = useState<StockItem | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(''); // '' = full recipe or default
  const [optionOverrides, setOptionOverrides] = useState<ItemOptionOverride[]>([]);
  const [vatRate, setVatRate] = useState(18);
  const [showCostsExVat, setShowCostsExVat] = useState(true); // Industry standard: food cost uses ex-VAT
  const [breakdownIng, setBreakdownIng] = useState<MenuItemIngredient | null>(null);

  const reload = useCallback(async () => {
    try {
      const [cats, stock, prep] = await Promise.all([
        getAllCategories(rid),
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

  const vatMultiplier = 1 + vatRate / 100;

  // Normalize a cost_per_unit to ex-VAT if needed
  const toExVat = (cost: number, includesVat: boolean) =>
    includesVat ? cost / vatMultiplier : cost;
  // Normalize a cost_per_unit to inc-VAT if needed
  const toIncVat = (cost: number, includesVat: boolean) =>
    includesVat ? cost : cost * vatMultiplier;

  // Load ingredients when item selected
  const selectItem = async (item: MenuItem) => {
    setSelectedItem(item);
    setSelectedVariantId('');
    setLoadingIngredients(true);
    try {
      const [ings, overrides] = await Promise.all([
        getMenuItemIngredients(rid, item.id),
        getItemOptionPrices(rid, item.id).catch(() => [] as ItemOptionOverride[]),
      ]);
      setIngredients(ings);
      setOptionOverrides(overrides);
    } catch {
      setIngredients([]);
      setOptionOverrides([]);
    } finally {
      setLoadingIngredients(false);
    }
  };

  // All menu items flattened
  const allItems = categories.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, category_name: c.name })));
  const filteredItems = search
    ? allItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  // Cost calculations (unit-aware)
  const PACKAGE_UNITS = ['unit', 'pack', 'box', 'bag', 'dose'];
  const MEASURABLE_UNITS = ['g', 'kg', 'ml', 'l'];

  // Resolve the portion an ingredient with scales_with_variant should use.
  // Fallback chain: variant.portion → item.portion → item.recipe_yield.
  const resolveIngredientPortion = (variantId: string): { qty: number; unit: string } | null => {
    if (!selectedItem) return null;
    const v = allVariants.find((vv) => String(vv.id) === variantId);
    if (v && (v.portion_size ?? 0) > 0) {
      return { qty: v.portion_size, unit: v.portion_size_unit || 'g' };
    }
    if ((selectedItem.portion_size ?? 0) > 0) {
      return { qty: selectedItem.portion_size!, unit: selectedItem.portion_size_unit || 'g' };
    }
    if ((selectedItem.recipe_yield ?? 0) > 0) {
      return { qty: selectedItem.recipe_yield!, unit: selectedItem.recipe_yield_unit || 'kg' };
    }
    return null;
  };

  // Aggregate a prep's ingredients into a VAT-normalized cost per prep.unit.
  // Each raw stock ingredient contributes `qty × cost_per_unit` normalized to
  // ex-VAT (so mixed price_includes_vat flags no longer produce hybrid totals).
  // Returns the ex-VAT cost per 1 prep.unit; callers add VAT back if needed.
  const computePrepUnitCostExVat = (prep: PrepItem): number | null => {
    if (!prep.ingredients || prep.ingredients.length === 0) return null;
    if ((prep.yield_per_batch ?? 0) <= 0) return null;
    const batchExVat = prep.ingredients.reduce((sum, pi) => {
      const s = pi.stock_item;
      if (!s) return sum;
      const costExVat = toExVat(s.cost_per_unit ?? 0, s.price_includes_vat ?? false);
      return sum + pi.quantity_needed * costExVat;
    }, 0);
    return batchExVat / prep.yield_per_batch;
  };

  // calcLineCost computes the cost of a single ingredient line.
  // When `ing.scales_with_variant` is true, the consumed quantity is taken
  // from `portionOverride` (typically the current variant's portion) instead of
  // `ing.quantity_needed`. Returns 0 when scaling is requested but no portion
  // is available — callers can surface a warning in that case.
  const calcLineCost = (
    ing: MenuItemIngredient,
    portionOverride?: { qty: number; unit: string } | null,
  ) => {
    const stock = ing.stock_item;
    const prep = ing.prep_item;
    const stockUnit = stock?.unit ?? prep?.unit ?? '';

    let qty: number;
    let qtyUnit: string;
    if (ing.scales_with_variant) {
      if (!portionOverride) return 0;
      qty = portionOverride.qty;
      qtyUnit = portionOverride.unit;
    } else {
      qty = ing.quantity_needed;
      qtyUnit = ing.unit || (MEASURABLE_UNITS.includes(stockUnit) ? stockUnit : '');
    }

    // Prep cost: derive from ingredients with per-stock VAT normalization when
    // we have them (server preloads prep.ingredients). Fall back to the stored
    // prep.cost_per_unit only when ingredients aren't loaded.
    let rawCost: number;
    let includesVat: boolean;
    if (prep && !stock) {
      const prepExVat = computePrepUnitCostExVat(prep);
      if (prepExVat != null) {
        rawCost = prepExVat;      // already ex-VAT
        includesVat = false;
      } else {
        rawCost = prep.cost_per_unit ?? 0;
        includesVat = false;       // legacy fallback: assume ex-VAT
      }
    } else {
      rawCost = stock?.cost_per_unit ?? 0;
      includesVat = stock?.price_includes_vat ?? false;
    }
    const unitCost = showCostsExVat ? toExVat(rawCost, includesVat) : toIncVat(rawCost, includesVat);

    // Same unit or no unit info (both measurable) — direct multiply
    if (qtyUnit === stockUnit || !qtyUnit) {
      // If qtyUnit is empty and stock is a package unit, it's a mismatch — don't blindly multiply
      if (!qtyUnit && PACKAGE_UNITS.includes(stockUnit) && stock?.unit_content && stock?.unit_content_unit) {
        // Assume quantity is in the stock's content unit (e.g., grams)
        const numUnits = qty / stock.unit_content;
        return numUnits * unitCost;
      }
      if (!qtyUnit && PACKAGE_UNITS.includes(stockUnit)) {
        return 0; // Can't compute safely
      }
      return qty * unitCost;
    }

    // Weight/volume conversion (g↔kg, ml↔l)
    const converted = convertQuantity(qty, qtyUnit, stockUnit);
    if (converted !== qty) return converted * unitCost;

    // Stock is "unit"/"pack"/"box"/"bag" with known content — convert via content
    if (PACKAGE_UNITS.includes(stockUnit) && stock?.unit_content && stock?.unit_content_unit) {
      const inContentUnit = convertQuantity(qty, qtyUnit, stock.unit_content_unit);
      const numUnits = inContentUnit / stock.unit_content;
      return numUnits * unitCost;
    }

    // Incompatible units (e.g. "g" vs "unit" without content info)
    if (PACKAGE_UNITS.includes(stockUnit) && MEASURABLE_UNITS.includes(qtyUnit)) {
      return 0;
    }
    if (MEASURABLE_UNITS.includes(stockUnit) && PACKAGE_UNITS.includes(qtyUnit)) {
      return 0;
    }

    // Fallback — same family, direct multiply
    return qty * unitCost;
  };

  const hasUnitMismatch = (ing: MenuItemIngredient): boolean => {
    const stock = ing.stock_item;
    const stockUnit = stock?.unit ?? '';
    const ingUnit = ing.unit || '';
    // No ingredient unit set + stock is a package unit without content info
    if (!ingUnit && PACKAGE_UNITS.includes(stockUnit) && !(stock?.unit_content)) return true;
    if (ingUnit === stockUnit || !ingUnit) return false;
    if (PACKAGE_UNITS.includes(stockUnit) && MEASURABLE_UNITS.includes(ingUnit) && !(stock?.unit_content)) return true;
    if (MEASURABLE_UNITS.includes(stockUnit) && PACKAGE_UNITS.includes(ingUnit)) return true;
    return false;
  };

  const totalRecipeCost = ingredients.reduce((sum, ing) => sum + calcLineCost(ing), 0);

  // Build variant options for the selector — merge option set options with overrides
  type VariantOption = { id: string; name: string; price: number; portion_size: number; portion_size_unit: string };
  const allVariants: VariantOption[] = [];
  if (selectedItem) {
    // From option sets (primary variant system)
    for (const os of selectedItem.option_sets ?? []) {
      for (const opt of os.options ?? []) {
        if (!opt.is_active) continue;
        const override = optionOverrides.find(o => o.option_id === opt.id);
        allVariants.push({
          id: `opt:${opt.id}`,
          name: opt.name,
          price: override?.price ?? opt.price,
          portion_size: override?.portion_size ?? 0,
          portion_size_unit: override?.portion_size_unit ?? 'g',
        });
      }
    }
    // From variant groups (legacy system)
    for (const g of selectedItem.variant_groups ?? []) {
      for (const v of g.variants ?? []) {
        if (!v.is_active) continue;
        allVariants.push({
          id: `var:${v.id}`,
          name: v.name,
          price: v.price,
          portion_size: v.portion_size ?? 0,
          portion_size_unit: v.portion_size_unit ?? 'g',
        });
      }
    }
  }
  const hasYield = (selectedItem?.recipe_yield ?? 0) > 0;
  const yieldBaseUnit = hasYield ? toBaseUnit(selectedItem!.recipe_yield!, selectedItem!.recipe_yield_unit || 'kg') : 0;

  // Resolve the currently-active variant id (explicit selection, or first with portion).
  const activeVariantId = selectedVariantId
    || (allVariants.find((v) => (v.portion_size ?? 0) > 0)?.id ?? '');

  // Per-variant line cost: non-scaling ingredients prorate batch cost via
  // portion/yield; scaling ingredients compute directly at the variant portion.
  const calcVariantLineCost = (
    ing: MenuItemIngredient,
    portion: { qty: number; unit: string } | null,
  ) => {
    const raw = calcLineCost(ing, portion);
    if (ing.scales_with_variant) return raw;
    if (!portion || !hasYield || yieldBaseUnit <= 0) return raw;
    const portionBase = toBaseUnit(portion.qty, portion.unit);
    return raw * (portionBase / yieldBaseUnit);
  };

  const sumVariantCost = (portion: { qty: number; unit: string } | null) =>
    ingredients.reduce((sum, ing) => sum + calcVariantLineCost(ing, portion), 0);

  const currentPortion = resolveIngredientPortion(activeVariantId);

  // Display cost = total at the currently-active variant portion.
  let displayCost = currentPortion ? sumVariantCost(currentPortion) : totalRecipeCost;
  let displayPrice = selectedItem?.price ?? 0;
  let displayLabel = '';

  if (selectedItem) {
    if (activeVariantId) {
      const variant = allVariants.find((v) => String(v.id) === activeVariantId);
      if (variant) {
        displayPrice = variant.price;
        if ((variant.portion_size ?? 0) > 0) {
          displayLabel = `${variant.name} (${variant.portion_size}${variant.portion_size_unit || 'g'})`;
        } else {
          displayLabel = variant.name;
        }
      }
    } else if ((selectedItem.portion_size ?? 0) > 0) {
      displayPrice = selectedItem.price;
    }
  }

  // Selling prices include VAT — normalize to same basis as costs for accurate %
  const normalizedPrice = showCostsExVat ? displayPrice / vatMultiplier : displayPrice;
  const costPct = normalizedPrice > 0 ? displayCost / normalizedPrice : 0;
  // Total shown in the ingredients table footer = sum at current variant.
  const totalCost = displayCost;

  // Detect "scales_with_variant" ingredients with no resolvable portion.
  const hasMissingVariantPortion =
    ingredients.some((i) => i.scales_with_variant) && !currentPortion;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex gap-5" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Left: Menu item list */}
      <div className="w-80 flex-shrink-0 space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input
            type="text"
            placeholder={t('searchMenuItems')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-3 py-2 text-sm w-full"
          />
        </div>

        <div className="card p-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {categories.map((cat) => {
            const catItems = (cat.items ?? []).filter((i) =>
              !search || i.name.toLowerCase().includes(search.toLowerCase())
            );
            if (catItems.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="px-3 py-2 text-xs text-fg-secondary uppercase tracking-wider font-medium" style={{ background: 'var(--surface-subtle)' }}>
                  {cat.name}
                </div>
                {catItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => selectItem(item)}
                    className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between hover:bg-[var(--surface-subtle)] transition-colors ${
                      selectedItem?.id === item.id ? 'bg-brand-500/10 text-brand-500 font-medium' : 'text-fg-primary'
                    }`}
                    style={{ borderBottom: '1px solid var(--divider)' }}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="text-xs text-fg-secondary font-mono">{item.price.toFixed(2)} &#8362;</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Ingredient detail panel */}
      <div className="flex-1">
        {!selectedItem ? (
          <div className="card text-center py-16 space-y-3">
            <CurrencyDollarIcon className="w-12 h-12 mx-auto text-fg-secondary" />
            <p className="text-lg font-semibold text-fg-primary">{t('selectMenuItem')}</p>
            <p className="text-sm text-fg-secondary">{t('chooseItemForFoodCost')}</p>
          </div>
        ) : loadingIngredients ? (
          <div className="card flex justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          /* View mode (read-only dashboard) */
          <div className="space-y-4">
            {/* Item header */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-fg-primary text-lg">{selectedItem.name}</h3>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => router.push(`/${rid}/kitchen/recipes/${selectedItem.id}`)} className="btn-secondary text-sm flex items-center gap-1.5">
                    {t('viewRecipe')}
                  </button>
                  <button onClick={() => setShowImportModal(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4" /> {t('importRecipe')}
                  </button>
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.id}`)}
                    className="btn-primary text-sm flex items-center gap-1.5"
                  >
                    {t('editIngredients').replace('{name}', '').replace(/[:\s]+$/, '')} &rarr;
                  </button>
                </div>
              </div>

              {/* Variant/portion pills */}
              {hasYield && allVariants.filter(v => (v.portion_size ?? 0) > 0).length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {allVariants.filter(v => (v.portion_size ?? 0) > 0).map((v) => {
                    const isActive = (selectedVariantId || String(allVariants.find(vv => (vv.portion_size ?? 0) > 0)?.id ?? 'full')) === String(v.id);
                    return (
                      <button key={v.id} type="button" onClick={() => setSelectedVariantId(String(v.id))}
                        className={`flex flex-col items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-brand-500 text-white'
                            : 'bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary hover:bg-[var(--divider)]'
                        }`}>
                        <span>{v.name} ({v.portion_size}{v.portion_size_unit || 'g'})</span>
                        <span className={`text-xs ${isActive ? 'text-white/80' : 'text-fg-tertiary'}`}>{v.price.toFixed(2)} &#8362;</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-fg-secondary mb-4">
                  {t('sellingPrice').replace('{price}', normalizedPrice.toFixed(2))}
                  <span className="ml-2 text-xs text-fg-tertiary">
                    ({showCostsExVat ? t('excludingVat') : t('includingVat')} · {showCostsExVat ? t('includingVat') : t('excludingVat')}{' '}
                    {(showCostsExVat ? displayPrice : displayPrice / vatMultiplier).toFixed(2)} &#8362;)
                  </span>
                </p>
              )}

              {/* VAT toggle + Cost summary */}
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setShowCostsExVat((v) => !v)}
                  className="text-xs text-brand-500 hover:text-brand-400 transition-colors"
                >
                  {showCostsExVat ? t('showIncVat') : t('showExVat')}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
                  <p className="text-xs text-fg-secondary">{t('foodCostLabel')}</p>
                  <p className="text-xl font-bold text-fg-primary">{displayCost.toFixed(2)} &#8362;</p>
                </div>
                <div className={`rounded-lg p-3 ${costPct > COST_THRESHOLD ? 'bg-red-500/10' : ''}`} style={costPct <= COST_THRESHOLD ? { background: 'var(--surface-subtle)' } : {}}>
                  <p className="text-xs text-fg-secondary">{t('costPercent')}</p>
                  <p className={`text-xl font-bold ${costPct > COST_THRESHOLD ? 'text-red-500' : 'text-fg-primary'}`}>
                    {(costPct * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
                  <p className="text-xs text-fg-secondary">{t('grossProfit')}</p>
                  <p className={`text-xl font-bold ${(normalizedPrice - displayCost) >= 0 ? 'text-status-ready' : 'text-red-500'}`}>{(normalizedPrice - displayCost).toFixed(2)} &#8362;</p>
                </div>
              </div>

              {costPct > COST_THRESHOLD && (
                <div className="flex items-center gap-2 mt-3 text-sm text-red-500">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  {t('foodCostExceedsThreshold').replace('{threshold}', (COST_THRESHOLD * 100).toFixed(0))}
                </div>
              )}
            </div>

            {(() => {
              const top = detectPrepSwaps(ingredients, prepItems)[0];
              if (!top) return null;
              const rawCount = ingredients.filter((i) => i.stock_item_id).length;
              return (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-brand-500/30 bg-brand-500/10 text-sm">
                  <span className="text-xl leading-none shrink-0">💡</span>
                  <div className="flex-1 text-fg-primary">
                    {t('swapSuggestionBanner')
                      .replace('{prep}', top.prep.name)
                      .replace('{matched}', String(top.matchedIngredients.length))
                      .replace('{total}', String(rawCount))}
                  </div>
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.id}`)}
                    className="btn-primary text-xs py-1.5 px-3 rounded-full whitespace-nowrap"
                  >
                    {t('replaceWithPrep')} &rarr;
                  </button>
                </div>
              );
            })()}

            {hasMissingVariantPortion && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-500">
                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{t('missingVariantPortion')}</p>
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.id}/variants`)}
                    className="mt-1 text-amber-400 underline hover:text-amber-300"
                  >
                    {t('configureVariants')} →
                  </button>
                </div>
              </div>
            )}

            {/* Ingredients table */}
            <div className="card overflow-hidden p-0">
              {ingredients.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-fg-secondary">{t('noIngredientsLinked')}</p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => router.push(`/${rid}/menu/items/${selectedItem.id}`)}
                      className="text-sm text-brand-500 hover:text-brand-400"
                    >
                      {t('addIngredients')}
                    </button>
                    <span className="text-fg-secondary text-xs">{t('or')}</span>
                    <button onClick={() => setShowImportModal(true)} className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1">
                      <SparklesIcon className="w-3.5 h-3.5" /> {t('importRecipe')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                {hasYield && (
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--divider)' }}>
                    <span className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">
                      {t('recipeCostBreakdown')} — {t('fullRecipe')} ({selectedItem.recipe_yield} {selectedItem.recipe_yield_unit})
                    </span>
                    <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer select-none">
                      <input type="checkbox" checked={!showCostsExVat}
                        onChange={(e) => setShowCostsExVat(!e.target.checked)}
                        className="rounded border-fg-secondary" />
                      {t('showIncVat')}
                    </label>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                      <th className="py-3 px-4 font-medium">{t('ingredient')}</th>
                      <th className="py-3 px-4 font-medium">{t('type')}</th>
                      <th className="py-3 px-4 font-medium text-right">{t('qtyPerServing')}</th>
                      <th className="py-3 px-4 font-medium text-right">{t('unitCost')}</th>
                      <th className="py-3 px-4 font-medium text-right">{t('lineCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing) => {
                      const name = ing.stock_item?.name ?? ing.prep_item?.name ?? '?';
                      const unit = ing.unit || ing.stock_item?.unit || ing.prep_item?.unit || '';
                      const stockUnit = ing.stock_item?.unit ?? '';
                      // Same VAT-aware derivation as calcLineCost so the table and
                      // the summary agree on the unit cost shown to the user.
                      let rawUnitCost: number;
                      let incVat: boolean;
                      if (ing.prep_item && !ing.stock_item) {
                        const prepExVat = computePrepUnitCostExVat(ing.prep_item);
                        if (prepExVat != null) { rawUnitCost = prepExVat; incVat = false; }
                        else { rawUnitCost = ing.prep_item.cost_per_unit ?? 0; incVat = false; }
                      } else {
                        rawUnitCost = ing.stock_item?.cost_per_unit ?? 0;
                        incVat = ing.stock_item?.price_includes_vat ?? false;
                      }
                      const unitCost = showCostsExVat ? toExVat(rawUnitCost, incVat) : toIncVat(rawUnitCost, incVat);
                      const lineCost = calcVariantLineCost(ing, currentPortion);
                      const mismatch = hasUnitMismatch(ing);
                      const type = ing.stock_item_id ? t('raw') : t('prep');
                      const qtyDisplay = ing.scales_with_variant
                        ? (currentPortion ? `${currentPortion.qty} ${currentPortion.unit}` : '—')
                        : `${ing.quantity_needed} ${unit}`;
                      return (
                        <tr key={ing.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                          <td className="py-3 px-4">
                            <span className="font-medium text-fg-primary">{name}</span>
                            {mismatch && (
                              <div className="flex items-center gap-1 mt-0.5 text-xs text-amber-500">
                                <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                <span>{t('unitMismatchWarning').replace('{ingUnit}', unit).replace('{stockUnit}', stockUnit)}</span>
                                {ing.stock_item && (
                                  <button onClick={() => setEditingStockItem(ing.stock_item!)}
                                    className="ml-1 underline hover:text-amber-400">{t('fix')}</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${ing.stock_item_id ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                              {type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-fg-primary">
                            {ing.scales_with_variant ? (
                              <span className="inline-flex flex-col items-end">
                                <span>{qtyDisplay}</span>
                                <span className="text-[10px] uppercase text-fg-tertiary tracking-wider">
                                  {t('followVariantPortion')}
                                </span>
                              </span>
                            ) : (
                              <>{ing.quantity_needed} <span className="text-fg-secondary text-xs">{unit}</span></>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {ing.prep_item ? (
                              <button
                                onClick={() => setBreakdownIng(ing)}
                                className="font-mono text-fg-secondary hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                                title={t('showCostBreakdown')}
                              >
                                {unitCost.toFixed(2)} &#8362;/{stockUnit || unit}
                              </button>
                            ) : (
                              <button onClick={() => ing.stock_item && setEditingStockItem(ing.stock_item)}
                                className="font-mono text-fg-secondary hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                                title={t('clickToEditCost')}>
                                {unitCost.toFixed(2)} &#8362;/{stockUnit || unit}
                              </button>
                            )}
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-bold ${mismatch ? 'text-amber-500' : 'text-fg-primary'}`}>
                            {ing.prep_item ? (
                              <button
                                onClick={() => setBreakdownIng(ing)}
                                className="hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                                title={t('showCostBreakdown')}
                              >
                                {mismatch ? '—' : `${lineCost.toFixed(2)} ₪`}
                              </button>
                            ) : (
                              mismatch ? '—' : `${lineCost.toFixed(2)} ₪`
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: 'var(--surface-subtle)' }}>
                      <td colSpan={4} className="py-3 px-4 text-right font-semibold text-fg-primary">{t('totalFoodCost')}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-fg-primary">{totalCost.toFixed(2)} &#8362;</td>
                    </tr>
                  </tbody>
                </table>
                </>
              )}
            </div>

            {/* Recipe Type & Yield */}
            {ingredients.length > 0 && (() => {
              const isPerItem = selectedItem.recipe_yield_unit === 'unit' && (selectedItem.recipe_yield ?? 0) === 1;
              const isBulk = (selectedItem.recipe_yield ?? 0) > 0 && selectedItem.recipe_yield_unit !== 'unit';
              return (
                <div className="card p-4 space-y-3">
                  {/* Recipe type toggle */}
                  <div>
                    <p className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-2">{t('recipeType')}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await setRecipeYield(rid, selectedItem.id, 1, 'unit');
                          setSelectedItem({ ...selectedItem, recipe_yield: 1, recipe_yield_unit: 'unit' });
                          setEditingYield(false);
                        }}
                        className={`flex-1 rounded-lg p-3 text-left border-2 transition-colors ${
                          isPerItem ? 'border-brand bg-brand/5' : 'border-border hover:border-fg-secondary/30'
                        }`}
                      >
                        <p className="text-sm font-semibold text-fg-primary">{t('perItemRecipe')}</p>
                        <p className="text-[11px] text-fg-secondary mt-0.5">{t('perItemRecipeDesc')}</p>
                      </button>
                      <button
                        onClick={() => {
                          if (isPerItem) {
                            // Switching from per-item to bulk: reset yield so user can set it
                            setYieldValue(0);
                            setYieldUnit('kg');
                            setEditingYield(true);
                          }
                        }}
                        className={`flex-1 rounded-lg p-3 text-left border-2 transition-colors ${
                          isBulk ? 'border-brand bg-brand/5' : 'border-border hover:border-fg-secondary/30'
                        }`}
                      >
                        <p className="text-sm font-semibold text-fg-primary">{t('bulkRecipe')}</p>
                        <p className="text-[11px] text-fg-secondary mt-0.5">{t('bulkRecipeDesc')}</p>
                      </button>
                    </div>
                  </div>

                  {/* Yield editor — only for bulk recipes */}
                  {!isPerItem && (
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <p className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-1">{t('recipeYield')}</p>
                        {isBulk ? (
                          <p className="text-sm font-medium text-fg-primary">
                            {selectedItem.recipe_yield} {selectedItem.recipe_yield_unit}
                          </p>
                        ) : (
                          <p className="text-sm text-fg-secondary">{t('yieldNotSet')}</p>
                        )}
                      </div>
                      {editingYield ? (
                        <div className="flex items-center gap-2">
                          <input type="number" step="any" min="0" className="input w-20 py-1.5 text-sm text-right"
                            value={yieldValue || ''} onChange={(e) => setYieldValue(+e.target.value)} />
                          <select className="input w-20 py-1.5 text-sm" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)}>
                            <option value="kg">kg</option><option value="g">g</option>
                            <option value="l">l</option><option value="ml">ml</option>
                          </select>
                          <button className="btn-primary text-xs py-1.5 px-3" onClick={async () => {
                            if (yieldValue > 0) {
                              await setRecipeYield(rid, selectedItem.id, yieldValue, yieldUnit);
                              setSelectedItem({ ...selectedItem, recipe_yield: yieldValue, recipe_yield_unit: yieldUnit });
                            }
                            setEditingYield(false);
                          }}>{t('save')}</button>
                          <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => setEditingYield(false)}>{t('cancel')}</button>
                        </div>
                      ) : (
                        <button className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1"
                          onClick={() => {
                            setYieldValue(selectedItem.recipe_yield ?? 0);
                            setYieldUnit(selectedItem.recipe_yield_unit || 'kg');
                            setEditingYield(true);
                          }}>
                          <PencilIcon className="w-3.5 h-3.5" /> {isBulk ? t('edit') : t('setRecipeYield')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Per-variant cost breakdown */}
            {ingredients.length > 0 && (selectedItem.recipe_yield ?? 0) > 0 && (() => {
              const variants = (selectedItem.variant_groups ?? []).flatMap(g => g.variants ?? []).filter(v => (v.portion_size ?? 0) > 0);
              if (variants.length === 0) return null;
              return (
                <div className="card overflow-hidden p-0">
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
                    <p className="text-xs text-fg-secondary uppercase tracking-wider font-medium">{t('variantCostBreakdown')}</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                        <th className="py-2 px-4 font-medium">{t('variant')}</th>
                        <th className="py-2 px-4 font-medium text-right">{t('portion')}</th>
                        <th className="py-2 px-4 font-medium text-right">{t('foodCostLabel')}</th>
                        <th className="py-2 px-4 font-medium text-right">{t('price')}</th>
                        <th className="py-2 px-4 font-medium text-right">{t('costPercent')}</th>
                        <th className="py-2 px-4 font-medium text-right">{t('grossProfit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v) => {
                        const vPortion = { qty: v.portion_size!, unit: v.portion_size_unit || 'g' };
                        const vCost = sumVariantCost(vPortion);
                        const vPct = v.price > 0 ? vCost / v.price : 0;
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                            <td className="py-2.5 px-4 font-medium text-fg-primary">{v.name}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-fg-primary">{v.portion_size} {v.portion_size_unit}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-fg-primary">{vCost.toFixed(2)} &#8362;</td>
                            <td className="py-2.5 px-4 text-right font-mono text-fg-secondary">{v.price.toFixed(2)} &#8362;</td>
                            <td className={`py-2.5 px-4 text-right font-mono font-bold ${vPct > COST_THRESHOLD ? 'text-red-500' : 'text-fg-primary'}`}>
                              {(vPct * 100).toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-status-ready">{(v.price - vCost).toFixed(2)} &#8362;</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Recipe Import Modal */}
      {showImportModal && selectedItem && (
        <RecipeImportModal
          rid={rid}
          menuItem={selectedItem}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={async () => {
            setShowImportModal(false);
            const [cats] = await Promise.all([getAllCategories(rid), reload()]);
            // Find the fresh item from reloaded data (with updated recipe_yield)
            const freshItem = cats.flatMap(c => c.items || []).find(i => i.id === selectedItem.id);
            if (freshItem) selectItem(freshItem); else selectItem(selectedItem);
          }}
        />
      )}

      {/* Prep cost breakdown popup */}
      {breakdownIng && breakdownIng.prep_item && (
        <PrepCostBreakdownModal
          ing={breakdownIng}
          portion={currentPortion}
          showExVat={showCostsExVat}
          vatMultiplier={vatMultiplier}
          onClose={() => setBreakdownIng(null)}
          t={t}
        />
      )}

      {/* Inline Stock Item Cost Editor */}
      {editingStockItem && (
        <StockCostEditor
          rid={rid}
          item={editingStockItem}
          vatRate={vatRate}
          onClose={() => setEditingStockItem(null)}
          onSaved={async () => {
            setEditingStockItem(null);
            // Reload stock items + re-select current menu item to refresh costs
            const [, stock] = await Promise.all([reload(), listStockItems(rid)]);
            setStockItems(stock);
            if (selectedItem) selectItem(selectedItem);
          }}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Stock Cost Editor (inline from food cost page) ─────────────────

function StockCostEditor({
  rid, item, vatRate, onClose, onSaved, t,
}: {
  rid: number;
  item: StockItem;
  vatRate: number;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const [qty, setQty] = useState<StockInput>(() => serverToStockInput(item));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const serverFields = stockInputToServer(qty);
      await updateStockItem(rid, item.id, {
        name: item.name,
        ...serverFields,
        // Food-cost edits price/packaging only; preserve the stock quantity.
        quantity: item.quantity,
        reorder_threshold: item.reorder_threshold,
        supplier: item.supplier,
        category: item.category,
        notes: item.notes,
        is_active: item.is_active,
      } as StockItemInput);
      onSaved();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-modal shadow-xl p-5 w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg-primary">{item.name}</h3>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
        </div>

        <StockQuantityForm value={qty} onChange={setQty} vatRate={vatRate} />

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? t('saving') : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Prep Cost Breakdown Modal ─────────────────────────────────────
//
// Shows the full math behind a prep ingredient's cost: raw ingredients →
// batch cost → cost per unit → line cost at the current portion.
// Lets the user spot unit mismatches or stale data at a glance.
function PrepCostBreakdownModal({
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

  // Line cost for the displayed portion
  const portionQty = ing.scales_with_variant
    ? (portion ? portion.qty : 0)
    : ing.quantity_needed;
  const portionUnit = ing.scales_with_variant
    ? (portion ? portion.unit : yieldUnit)
    : (ing.unit || yieldUnit);
  // Convert portion into prep's yield unit for multiplication
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
          {/* Section A — Batch recipe */}
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

          {/* Section B — Derivation */}
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

          {/* Section C — Line cost for current portion */}
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

          {/* Sanity-check hint */}
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

