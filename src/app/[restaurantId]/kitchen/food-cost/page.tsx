'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getAllCategories, listStockItems, listPrepItems,
  getMenuItemIngredients, setMenuItemIngredients,
  getItemOptionPrices,
  updateStockItem,
  importRecipesFromFile, importRecipesFromText, confirmRecipes,
  setRecipeYield,
  MenuCategory, MenuItem, MenuItemIngredient, IngredientInput,
  StockItem, PrepItem, StockItemInput, ItemOptionOverride,
  RecipeExtraction, ExtractedRecipe, ConfirmRecipeItemInput,
} from '@/lib/api';
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon,
  ExclamationTriangleIcon, CurrencyDollarIcon,
  SparklesIcon, PencilIcon,
} from '@heroicons/react/24/outline';
import SearchableSelect from '@/components/SearchableSelect';
import { useI18n } from '@/lib/i18n';

const COST_THRESHOLD = 0.35; // 35% food cost warning

export default function FoodCostPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [ingredients, setIngredients] = useState<MenuItemIngredient[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(false);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [editIngredients, setEditIngredients] = useState<IngredientInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingYield, setEditingYield] = useState(false);
  const [yieldValue, setYieldValue] = useState(0);
  const [yieldUnit, setYieldUnit] = useState('kg');
  const [editingStockItem, setEditingStockItem] = useState<StockItem | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(''); // '' = full recipe or default
  const [optionOverrides, setOptionOverrides] = useState<ItemOptionOverride[]>([]);

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

  // Load ingredients when item selected
  const selectItem = async (item: MenuItem) => {
    setSelectedItem(item);
    setEditing(false);
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

  const calcLineCost = (ing: MenuItemIngredient) => {
    const stock = ing.stock_item;
    const prep = ing.prep_item;
    const stockUnit = stock?.unit ?? prep?.unit ?? '';
    // Only fallback to stock unit when it's a measurable unit (g/kg/ml/l), not package units
    const ingUnit = ing.unit || (MEASURABLE_UNITS.includes(stockUnit) ? stockUnit : '');
    const unitCost = stock?.cost_per_unit ?? prep?.cost_per_unit ?? 0;

    // Same unit or no unit info (both measurable) — direct multiply
    if (ingUnit === stockUnit || !ingUnit) {
      // But if ingUnit is empty and stock is a package unit, it's a mismatch — don't blindly multiply
      if (!ing.unit && PACKAGE_UNITS.includes(stockUnit) && stock?.unit_content && stock?.unit_content_unit) {
        // Assume ingredient quantity is in the stock's content unit (e.g., grams)
        const numUnits = ing.quantity_needed / stock.unit_content;
        return numUnits * unitCost;
      }
      if (!ing.unit && PACKAGE_UNITS.includes(stockUnit)) {
        return 0; // Can't compute safely
      }
      return ing.quantity_needed * unitCost;
    }

    // Weight/volume conversion (g↔kg, ml↔l)
    const converted = convertQuantity(ing.quantity_needed, ingUnit, stockUnit);
    if (converted !== ing.quantity_needed) return converted * unitCost;

    // Stock is "unit"/"pack"/"box"/"bag" with known content — convert via content
    if (PACKAGE_UNITS.includes(stockUnit) && stock?.unit_content && stock?.unit_content_unit) {
      const inContentUnit = convertQuantity(ing.quantity_needed, ingUnit, stock.unit_content_unit);
      const numUnits = inContentUnit / stock.unit_content;
      return numUnits * unitCost;
    }

    // Incompatible units (e.g. "g" vs "unit" without content info) — return 0 to avoid wrong values
    if (PACKAGE_UNITS.includes(stockUnit) && MEASURABLE_UNITS.includes(ingUnit)) {
      return 0; // Cannot compute — unit_content not set on stock item
    }
    if (MEASURABLE_UNITS.includes(stockUnit) && PACKAGE_UNITS.includes(ingUnit)) {
      return 0;
    }

    // Fallback — same family, direct multiply
    return ing.quantity_needed * unitCost;
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

  // Calculate display cost based on selected variant/portion
  let displayCost = totalRecipeCost;
  let displayPrice = selectedItem?.price ?? 0;
  let displayLabel = '';

  if (hasYield && selectedVariantId && selectedVariantId !== 'full') {
    const variant = allVariants.find(v => String(v.id) === selectedVariantId);
    if (variant && (variant.portion_size ?? 0) > 0) {
      const portionBase = toBaseUnit(variant.portion_size!, variant.portion_size_unit || 'g');
      displayCost = yieldBaseUnit > 0 ? totalRecipeCost * (portionBase / yieldBaseUnit) : totalRecipeCost;
      displayPrice = variant.price;
      displayLabel = `${variant.name} (${variant.portion_size}${variant.portion_size_unit || 'g'})`;
    }
  } else if (hasYield && !selectedVariantId && allVariants.length > 0) {
    // Auto-select first variant with portion_size
    const first = allVariants.find(v => (v.portion_size ?? 0) > 0);
    if (first) {
      const portionBase = toBaseUnit(first.portion_size!, first.portion_size_unit || 'g');
      displayCost = yieldBaseUnit > 0 ? totalRecipeCost * (portionBase / yieldBaseUnit) : totalRecipeCost;
      displayPrice = first.price;
      displayLabel = `${first.name} (${first.portion_size}${first.portion_size_unit || 'g'})`;
    }
  } else if (hasYield && (selectedItem?.portion_size ?? 0) > 0) {
    // Item has portion_size but no variants
    const portionBase = toBaseUnit(selectedItem!.portion_size!, selectedItem!.portion_size_unit || 'g');
    displayCost = yieldBaseUnit > 0 ? totalRecipeCost * (portionBase / yieldBaseUnit) : totalRecipeCost;
    displayPrice = selectedItem!.price;
  }

  const costPct = displayPrice > 0 ? displayCost / displayPrice : 0;
  // Keep totalCost for backward compat in the ingredients table total row
  const totalCost = totalRecipeCost;

  // Edit mode
  const startEditing = () => {
    setEditIngredients(ingredients.map((i) => ({
      stock_item_id: i.stock_item_id ?? undefined,
      prep_item_id: i.prep_item_id ?? undefined,
      quantity_needed: i.quantity_needed,
      unit: i.unit || i.stock_item?.unit || i.prep_item?.unit || '',
    })));
    setEditing(true);
  };

  const addEditIngredient = () => {
    setEditIngredients([...editIngredients, { quantity_needed: 0, unit: '' }]);
  };

  const removeEditIngredient = (idx: number) => {
    setEditIngredients(editIngredients.filter((_, i) => i !== idx));
  };

  const updateEditIngredient = (idx: number, patch: Partial<IngredientInput>) => {
    setEditIngredients(editIngredients.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const saved = await setMenuItemIngredients(rid, selectedItem.id, editIngredients);
      setIngredients(saved);
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRecipe = async () => {
    if (!selectedItem) return;
    if (!confirm(t('removeRecipeConfirm'))) return;
    try {
      await setMenuItemIngredients(rid, selectedItem.id, []);
      if ((selectedItem.recipe_yield ?? 0) > 0) {
        await setRecipeYield(rid, selectedItem.id, 0, '');
        setSelectedItem({ ...selectedItem, recipe_yield: 0, recipe_yield_unit: '' });
      }
      setIngredients([]);
    } catch (err: any) {
      alert(err.message);
    }
  };

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
        ) : editing ? (
          /* Edit mode */
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-fg-primary text-lg">{t('editIngredients').replace('{name}', selectedItem.name)}</h3>
            </div>

            <p className="text-sm text-fg-secondary">{t('linkIngredients')}</p>

            {editIngredients.map((ing, idx) => (
              <div key={idx} className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-subtle)' }}>
                {/* Row 1: Stock item selector + delete */}
                <div className="flex items-center gap-2">
                  <SearchableSelect
                    className="flex-1"
                    value={ing.stock_item_id ? `stock:${ing.stock_item_id}` : ing.prep_item_id ? `prep:${ing.prep_item_id}` : ''}
                    onChange={(val) => {
                      if (val.startsWith('stock:')) {
                        const si = stockItems.find(s => s.id === +val.split(':')[1]);
                        updateEditIngredient(idx, { stock_item_id: +val.split(':')[1], prep_item_id: undefined, unit: si?.unit || ing.unit });
                      } else if (val.startsWith('prep:')) {
                        const pi = prepItems.find(p => p.id === +val.split(':')[1]);
                        updateEditIngredient(idx, { prep_item_id: +val.split(':')[1], stock_item_id: undefined, unit: pi?.unit || ing.unit });
                      }
                    }}
                    options={[
                      ...stockItems.map((s) => ({ value: `stock:${s.id}`, label: s.name, sublabel: s.unit })),
                      ...prepItems.map((p) => ({ value: `prep:${p.id}`, label: p.name, sublabel: `${p.unit} (${t('prep')})` })),
                    ]}
                    placeholder={t('selectIngredient')}
                  />
                  <button onClick={() => removeEditIngredient(idx)} className="p-1.5 text-red-400 hover:text-red-300 flex-shrink-0">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                {/* Row 2: Quantity + unit */}
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="any" min="0"
                    className="input w-24 py-1.5 text-sm text-right"
                    value={ing.quantity_needed || ''}
                    onChange={(e) => updateEditIngredient(idx, { quantity_needed: +e.target.value })}
                    placeholder={t('qty')}
                  />
                  <select className="input w-20 py-1.5 text-sm" value={ing.unit || ''}
                    onChange={(e) => updateEditIngredient(idx, { unit: e.target.value })}>
                    <option value="">—</option>
                    <option value="g">g</option><option value="kg">kg</option>
                    <option value="ml">ml</option><option value="l">l</option>
                    <option value="unit">unit</option>
                  </select>
                </div>
              </div>
            ))}

            <button onClick={addEditIngredient} className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1">
              <PlusIcon className="w-4 h-4" /> {t('addIngredient')}
            </button>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">{t('cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? t('saving') : t('save')}</button>
            </div>
          </div>
        ) : (
          /* View mode */
          <div className="space-y-4">
            {/* Item header */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-fg-primary text-lg">{selectedItem.name}</h3>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setShowImportModal(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4" /> {t('importRecipe')}
                  </button>
                  <button onClick={startEditing} className="btn-secondary text-sm">{t('editIngredients').replace('{name}', '').replace(/[:\s]+$/, '')}</button>
                  {ingredients.length > 0 && (
                    <button onClick={handleRemoveRecipe} className="text-sm px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Variant/portion selector */}
              {hasYield && allVariants.filter(v => (v.portion_size ?? 0) > 0).length > 0 ? (
                <div className="mb-4">
                  <select className="input py-1.5 text-sm w-full max-w-xs" value={selectedVariantId || (allVariants.find(v => (v.portion_size ?? 0) > 0)?.id ? String(allVariants.find(v => (v.portion_size ?? 0) > 0)!.id) : 'full')}
                    onChange={(e) => setSelectedVariantId(e.target.value)}>
                    {allVariants.filter(v => (v.portion_size ?? 0) > 0).map((v) => (
                      <option key={v.id} value={String(v.id)}>
                        {v.name} ({v.portion_size}{v.portion_size_unit || 'g'}) — {v.price.toFixed(2)} ₪
                      </option>
                    ))}
                    <option value="full">{t('fullRecipe')} ({selectedItem.recipe_yield}{selectedItem.recipe_yield_unit})</option>
                  </select>
                </div>
              ) : (
                <p className="text-sm text-fg-secondary mb-4">{t('sellingPrice').replace('{price}', displayPrice.toFixed(2))}</p>
              )}

              {/* Cost summary */}
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
                  <p className={`text-xl font-bold ${(displayPrice - displayCost) >= 0 ? 'text-status-ready' : 'text-red-500'}`}>{(displayPrice - displayCost).toFixed(2)} &#8362;</p>
                </div>
              </div>

              {costPct > COST_THRESHOLD && (
                <div className="flex items-center gap-2 mt-3 text-sm text-red-500">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  {t('foodCostExceedsThreshold').replace('{threshold}', (COST_THRESHOLD * 100).toFixed(0))}
                </div>
              )}
            </div>

            {/* Ingredients table */}
            <div className="card overflow-hidden p-0">
              {ingredients.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-fg-secondary">{t('noIngredientsLinked')}</p>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={startEditing} className="text-sm text-brand-500 hover:text-brand-400">{t('addIngredients')}</button>
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
                      const unitCost = ing.stock_item?.cost_per_unit ?? ing.prep_item?.cost_per_unit ?? 0;
                      const lineCost = calcLineCost(ing);
                      const mismatch = hasUnitMismatch(ing);
                      const type = ing.stock_item_id ? t('raw') : t('prep');
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
                            {ing.quantity_needed} <span className="text-fg-secondary text-xs">{unit}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button onClick={() => ing.stock_item && setEditingStockItem(ing.stock_item)}
                              className="font-mono text-fg-secondary hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                              title={t('clickToEditCost')}>
                              {unitCost.toFixed(2)} &#8362;/{stockUnit || unit}
                            </button>
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-bold ${mismatch ? 'text-amber-500' : 'text-fg-primary'}`}>
                            {mismatch ? '—' : `${lineCost.toFixed(2)} ₪`}
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

            {/* Recipe Yield */}
            {ingredients.length > 0 && (
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-1">{t('recipeYield')}</p>
                    {(selectedItem.recipe_yield ?? 0) > 0 ? (
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
                        <option value="unit">unit</option>
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
                      <PencilIcon className="w-3.5 h-3.5" /> {(selectedItem.recipe_yield ?? 0) > 0 ? t('edit') : t('setRecipeYield')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Per-variant cost breakdown */}
            {ingredients.length > 0 && (selectedItem.recipe_yield ?? 0) > 0 && (() => {
              const variants = (selectedItem.variant_groups ?? []).flatMap(g => g.variants ?? []).filter(v => (v.portion_size ?? 0) > 0);
              if (variants.length === 0) return null;
              const yieldBase = toBaseUnit(selectedItem.recipe_yield!, selectedItem.recipe_yield_unit || 'kg');
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
                        const portionBase = toBaseUnit(v.portion_size!, v.portion_size_unit || 'g');
                        const vCost = yieldBase > 0 ? totalCost * (portionBase / yieldBase) : 0;
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
          locale={locale}
          menuItem={selectedItem}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={async () => {
            setShowImportModal(false);
            // Reload categories to pick up yield changes, then re-select item
            await reload();
            selectItem(selectedItem);
          }}
          t={t}
        />
      )}

      {/* Inline Stock Item Cost Editor */}
      {editingStockItem && (
        <StockCostEditor
          rid={rid}
          item={editingStockItem}
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
  rid, item, onClose, onSaved, t,
}: {
  rid: number;
  item: StockItem;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const [unit, setUnit] = useState<string>(item.unit);
  const [pricePerPackage, setPricePerPackage] = useState(item.cost_per_unit);
  const [unitContent, setUnitContent] = useState(item.unit_content ?? 0);
  const [unitContentUnit, setUnitContentUnit] = useState(item.unit_content_unit ?? 'g');
  const [saving, setSaving] = useState(false);

  const isPackage = ['unit', 'pack', 'box', 'bag', 'dose'].includes(unit);

  // For measurable units (g/kg/ml/l), cost_per_unit IS the price per that unit
  // For package units, cost_per_unit is the price per package
  // The calculated cost per content unit is shown as a summary
  const costPerContentUnit = isPackage && unitContent > 0 ? pricePerPackage / unitContent : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateStockItem(rid, item.id, {
        name: item.name,
        unit: unit as any,
        quantity: item.quantity,
        reorder_threshold: item.reorder_threshold,
        cost_per_unit: pricePerPackage,
        supplier: item.supplier,
        category: item.category,
        notes: item.notes,
        unit_content: isPackage ? unitContent : 0,
        unit_content_unit: isPackage ? (unitContentUnit || 'g') : '',
        is_active: item.is_active,
      });
      onSaved();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-modal shadow-xl p-5 w-full max-w-md mx-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg-primary">{item.name}</h3>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-4">
          {/* Stock unit */}
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('stockUnit')}</label>
            <select className="input w-full py-2 text-sm" value={unit} onChange={(e) => {
              const newUnit = e.target.value;
              setUnit(newUnit);
              // When switching to a measurable unit, suggest converting the price
              if (!['unit', 'pack', 'box', 'bag', 'dose'].includes(newUnit) && unitContent > 0) {
                setPricePerPackage(+(pricePerPackage / unitContent).toFixed(4));
              }
            }}>
              <option value="g">g ({t('grams')})</option>
              <option value="kg">kg ({t('kilograms')})</option>
              <option value="ml">ml ({t('milliliters')})</option>
              <option value="l">l ({t('liters')})</option>
              <option value="unit">unit ({t('perItem')})</option>
              <option value="pack">pack</option>
              <option value="box">box</option>
              <option value="bag">bag</option>
              <option value="dose">dose</option>
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="text-xs text-fg-secondary block mb-1">
              {isPackage ? t('pricePerPackage') : t('costPerUnit')}
            </label>
            <div className="flex items-center gap-2">
              <input type="number" step="any" min="0" className="input flex-1 py-2 text-sm"
                value={pricePerPackage} onChange={(e) => setPricePerPackage(+e.target.value)} />
              <span className="text-sm text-fg-secondary">&#8362; / {unit}</span>
            </div>
          </div>

          {/* Package content (only for package units) */}
          {isPackage && (
            <div>
              <label className="text-xs text-fg-secondary block mb-1">{t('contentPerUnit')}</label>
              <div className="flex items-center gap-2">
                <input type="number" step="any" min="0" className="input w-24 py-2 text-sm"
                  value={unitContent || ''} onChange={(e) => setUnitContent(+e.target.value)} placeholder="400" />
                <select className="input w-20 py-2 text-sm" value={unitContentUnit}
                  onChange={(e) => setUnitContentUnit(e.target.value)}>
                  <option value="g">g</option><option value="kg">kg</option>
                  <option value="ml">ml</option><option value="l">l</option>
                </select>
                <span className="text-sm text-fg-secondary">{t('perItem')}</span>
              </div>
            </div>
          )}

          {/* Summary */}
          {isPackage && unitContent > 0 && pricePerPackage > 0 && (
            <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-subtle)' }}>
              <span className="text-fg-secondary">{t('effectiveCost')}: </span>
              <span className="font-mono font-bold text-fg-primary">
                {costPerContentUnit.toFixed(4)} &#8362;/{unitContentUnit}
              </span>
              <span className="text-fg-secondary"> ({pricePerPackage} &#8362; &divide; {unitContent}{unitContentUnit})</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? t('saving') : t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Unit Conversion Helpers ────────────────────────────────────────

const unitFactors: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000 };

function toBaseUnit(value: number, unit: string): number {
  return value * (unitFactors[unit] ?? 1);
}

function convertQuantity(qty: number, from: string, to: string): number {
  if (from === to || !from || !to) return qty;
  const fromFactor = unitFactors[from];
  const toFactor = unitFactors[to];
  if (fromFactor != null && toFactor != null) return qty * fromFactor / toFactor;
  return qty; // no conversion possible (e.g., "unit" vs "g")
}

// ─── Recipe Import Modal ─────────────────────────────────────────────

function RecipeImportModal({
  rid, locale, menuItem, stockItems, onClose, onImported, t,
}: {
  rid: number;
  locale: string;
  menuItem: MenuItem;
  stockItems: StockItem[];
  onClose: () => void;
  onImported: () => void;
  t: (key: string) => string;
}) {
  const [tab, setTab] = useState<'upload' | 'text'>('text');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Review step
  const [extraction, setExtraction] = useState<RecipeExtraction | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<ExtractedRecipe | null>(null);
  const [editedYield, setEditedYield] = useState(0);
  const [editedYieldUnit, setEditedYieldUnit] = useState('kg');
  const [editedIngredients, setEditedIngredients] = useState<Array<{
    stock_item_id?: number | null;
    name: string;
    original_name: string;
    quantity_needed: number;
    unit: string;
    category: string;
    is_new: boolean;
  }>>([]);

  const handleExtract = async () => {
    setLoading(true);
    setError('');
    try {
      let result: RecipeExtraction;
      if (tab === 'upload') {
        if (!file) return;
        result = await importRecipesFromFile(rid, file, locale);
      } else {
        if (!text.trim()) return;
        result = await importRecipesFromText(rid, text, locale);
      }
      setExtraction(result);
      // Auto-select first recipe
      if (result.recipes.length > 0) {
        const recipe = result.recipes[0];
        setSelectedRecipe(recipe);
        setEditedYield(recipe.total_yield || 0);
        setEditedYieldUnit(recipe.total_yield_unit || 'kg');
        setEditedIngredients(recipe.ingredients.map((ing) => ({
          stock_item_id: ing.matched_item_id ?? null,
          name: ing.translated_name || ing.original_name,
          original_name: ing.original_name,
          quantity_needed: ing.quantity,
          unit: ing.unit,
          category: '',
          is_new: ing.is_new,
        })));
      }
    } catch (err: any) {
      setError(err.message || 'Extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const input: ConfirmRecipeItemInput = {
        menu_item_id: menuItem.id,
        recipe_yield: editedYield,
        recipe_yield_unit: editedYieldUnit,
        ingredients: editedIngredients.map((ing) => ({
          stock_item_id: ing.stock_item_id ?? null,
          name: ing.name,
          original_name: ing.original_name,
          quantity_needed: ing.quantity_needed,
          unit: ing.unit,
          category: ing.category,
        })),
      };
      await confirmRecipes(rid, { recipes: [input] });
      onImported();
    } catch (err: any) {
      setError(err.message || 'Confirm failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-modal shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg-primary flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-brand-500" />
            {t('importRecipe')} — {menuItem.name}
          </h3>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">{error}</div>
        )}

        {!extraction ? (
          /* Step 1: Input */
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
              <button onClick={() => setTab('text')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === 'text' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}>
                {t('pasteRecipeText')}
              </button>
              <button onClick={() => setTab('upload')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === 'upload' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}>
                {t('uploadRecipeFile')}
              </button>
            </div>

            {tab === 'text' ? (
              <textarea
                className="input w-full py-3 text-sm"
                rows={8}
                placeholder={t('pasteRecipePlaceholder')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            ) : (
              <div
                className="flex flex-col items-center justify-center py-12 rounded-card cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                style={{ border: '2px dashed var(--divider)' }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*,.pdf';
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) setFile(f);
                  };
                  input.click();
                }}
              >
                {file ? (
                  <p className="text-sm font-medium text-fg-primary">{file.name}</p>
                ) : (
                  <>
                    <SparklesIcon className="w-8 h-8 text-brand-500 mb-2" />
                    <p className="text-sm text-fg-secondary">{t('clickToUpload')}</p>
                    <p className="text-xs text-fg-secondary mt-1">{t('imageFormats')}</p>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleExtract}
                disabled={loading || (tab === 'text' ? !text.trim() : !file)}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {loading ? (
                  <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> {t('extracting')}</>
                ) : (
                  <><SparklesIcon className="w-4 h-4" /> {t('extractRecipe')}</>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Review */
          <div className="space-y-4">
            {/* Yield */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-fg-secondary font-medium">{t('recipeYield')}:</label>
              <input type="number" step="any" min="0" className="input w-24 py-1.5 text-sm text-right"
                value={editedYield || ''} onChange={(e) => setEditedYield(+e.target.value)} />
              <select className="input w-20 py-1.5 text-sm" value={editedYieldUnit} onChange={(e) => setEditedYieldUnit(e.target.value)}>
                <option value="kg">kg</option><option value="g">g</option>
                <option value="l">l</option><option value="ml">ml</option>
                <option value="unit">unit</option>
              </select>
            </div>

            {/* Ingredients table */}
            <div className="text-xs text-fg-secondary uppercase tracking-wider font-medium">{t('ingredients')} ({editedIngredients.length})</div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {editedIngredients.map((ing, idx) => {
                const matched = ing.stock_item_id ? stockItems.find((s) => s.id === ing.stock_item_id) : null;
                return (
                  <div key={idx} className="p-2.5 rounded-lg space-y-1.5" style={{ background: 'var(--surface-subtle)' }}>
                    {/* Row 1: Name + badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-fg-primary">{ing.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${matched ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {matched ? t('existing') : t('new')}
                        </span>
                        <button onClick={() => setEditedIngredients(editedIngredients.filter((_, i) => i !== idx))}
                          className="p-1 text-red-400 hover:text-red-300">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Row 2: Stock item match */}
                    <SearchableSelect
                      value={ing.stock_item_id ? String(ing.stock_item_id) : ''}
                      onChange={(val) => {
                        const updated = [...editedIngredients];
                        if (val) {
                          const si = stockItems.find((s) => s.id === +val);
                          updated[idx] = { ...ing, stock_item_id: +val, is_new: false, unit: si?.unit || ing.unit };
                        } else {
                          updated[idx] = { ...ing, stock_item_id: null, is_new: true };
                        }
                        setEditedIngredients(updated);
                      }}
                      options={stockItems.map((s) => ({ value: String(s.id), label: s.name, sublabel: s.unit }))}
                      placeholder={`${t('newItem')}: ${ing.name}`}
                    />
                    {/* Row 3: Quantity + unit */}
                    <div className="flex items-center gap-2">
                      <input type="number" step="any" min="0" className="input w-24 py-1 text-sm text-right"
                        value={ing.quantity_needed || ''} onChange={(e) => {
                          const updated = [...editedIngredients];
                          updated[idx] = { ...ing, quantity_needed: +e.target.value };
                          setEditedIngredients(updated);
                        }} />
                      <span className="text-xs text-fg-secondary">{ing.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setExtraction(null)} className="btn-secondary text-sm">{t('back')}</button>
              <button onClick={handleConfirm} disabled={loading || editedIngredients.length === 0} className="btn-primary text-sm">
                {loading ? t('saving') : t('confirmImport')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
