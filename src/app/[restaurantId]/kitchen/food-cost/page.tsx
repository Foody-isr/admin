'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getAllCategories, listStockItems, listPrepItems,
  getMenuItemIngredients, setMenuItemIngredients,
  importRecipesFromFile, importRecipesFromText, confirmRecipes,
  setRecipeYield,
  MenuCategory, MenuItem, MenuItemIngredient, IngredientInput,
  StockItem, PrepItem,
  RecipeExtraction, ExtractedRecipe, ConfirmRecipeItemInput,
} from '@/lib/api';
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon,
  ExclamationTriangleIcon, CurrencyDollarIcon,
  SparklesIcon, PencilIcon,
} from '@heroicons/react/24/outline';
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
    setLoadingIngredients(true);
    try {
      const ings = await getMenuItemIngredients(rid, item.id);
      setIngredients(ings);
    } catch {
      setIngredients([]);
    } finally {
      setLoadingIngredients(false);
    }
  };

  // All menu items flattened
  const allItems = categories.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, category_name: c.name })));
  const filteredItems = search
    ? allItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  // Cost calculations
  const calcLineCost = (ing: MenuItemIngredient) => {
    const unitCost = ing.stock_item?.cost_per_unit ?? ing.prep_item?.cost_per_unit ?? 0;
    return ing.quantity_needed * unitCost;
  };

  const totalCost = ingredients.reduce((sum, ing) => sum + calcLineCost(ing), 0);
  const costPct = selectedItem && selectedItem.price > 0 ? totalCost / selectedItem.price : 0;

  // Edit mode
  const startEditing = () => {
    setEditIngredients(ingredients.map((i) => ({
      stock_item_id: i.stock_item_id ?? undefined,
      prep_item_id: i.prep_item_id ?? undefined,
      quantity_needed: i.quantity_needed,
    })));
    setEditing(true);
  };

  const addEditIngredient = () => {
    setEditIngredients([...editIngredients, { quantity_needed: 0 }]);
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
              <div key={idx} className="flex items-center gap-2">
                <select
                  className="input flex-1 py-2 text-sm"
                  value={ing.stock_item_id ? `stock:${ing.stock_item_id}` : ing.prep_item_id ? `prep:${ing.prep_item_id}` : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('stock:')) {
                      updateEditIngredient(idx, { stock_item_id: +val.split(':')[1], prep_item_id: undefined });
                    } else if (val.startsWith('prep:')) {
                      updateEditIngredient(idx, { prep_item_id: +val.split(':')[1], stock_item_id: undefined });
                    }
                  }}
                >
                  <option value="">{t('selectIngredient')}</option>
                  <optgroup label={t('rawStock')}>
                    {stockItems.map((s) => <option key={`s${s.id}`} value={`stock:${s.id}`}>{s.name} ({s.unit})</option>)}
                  </optgroup>
                  <optgroup label={t('prepItems')}>
                    {prepItems.map((p) => <option key={`p${p.id}`} value={`prep:${p.id}`}>{p.name} ({p.unit})</option>)}
                  </optgroup>
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="input w-24 py-2 text-sm text-right"
                  value={ing.quantity_needed || ''}
                  onChange={(e) => updateEditIngredient(idx, { quantity_needed: +e.target.value })}
                  placeholder={t('qty')}
                />
                <button onClick={() => removeEditIngredient(idx)} className="p-1 text-red-400 hover:text-red-300">
                  <TrashIcon className="w-4 h-4" />
                </button>
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
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-fg-primary text-lg">{selectedItem.name}</h3>
                  <p className="text-sm text-fg-secondary">{t('sellingPrice').replace('{price}', selectedItem.price.toFixed(2))}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowImportModal(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4" /> {t('importRecipe')}
                  </button>
                  <button onClick={startEditing} className="btn-secondary text-sm">{t('editIngredients').replace('{name}', '').replace(/[:\s]+$/, '')}</button>
                </div>
              </div>

              {/* Cost summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
                  <p className="text-xs text-fg-secondary">{t('foodCostLabel')}</p>
                  <p className="text-xl font-bold text-fg-primary">{totalCost.toFixed(2)} &#8362;</p>
                </div>
                <div className={`rounded-lg p-3 ${costPct > COST_THRESHOLD ? 'bg-red-500/10' : ''}`} style={costPct <= COST_THRESHOLD ? { background: 'var(--surface-subtle)' } : {}}>
                  <p className="text-xs text-fg-secondary">{t('costPercent')}</p>
                  <p className={`text-xl font-bold ${costPct > COST_THRESHOLD ? 'text-red-500' : 'text-fg-primary'}`}>
                    {(costPct * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
                  <p className="text-xs text-fg-secondary">{t('grossProfit')}</p>
                  <p className="text-xl font-bold text-status-ready">{(selectedItem.price - totalCost).toFixed(2)} &#8362;</p>
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
                      const unit = ing.stock_item?.unit ?? ing.prep_item?.unit ?? '';
                      const unitCost = ing.stock_item?.cost_per_unit ?? ing.prep_item?.cost_per_unit ?? 0;
                      const lineCost = calcLineCost(ing);
                      const type = ing.stock_item_id ? t('raw') : t('prep');
                      return (
                        <tr key={ing.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                          <td className="py-3 px-4 font-medium text-fg-primary">{name}</td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${ing.stock_item_id ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                              {type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-fg-primary">
                            {ing.quantity_needed} <span className="text-fg-secondary text-xs">{unit}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-fg-secondary">{unitCost.toFixed(2)} &#8362;</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-fg-primary">{lineCost.toFixed(2)} &#8362;</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: 'var(--surface-subtle)' }}>
                      <td colSpan={4} className="py-3 px-4 text-right font-semibold text-fg-primary">{t('totalFoodCost')}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-fg-primary">{totalCost.toFixed(2)} &#8362;</td>
                    </tr>
                  </tbody>
                </table>
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
    </div>
  );
}

// ─── Unit Conversion Helper ─────────────────────────────────────────

function toBaseUnit(value: number, unit: string): number {
  switch (unit) {
    case 'kg': return value * 1000; // → grams
    case 'g': return value;
    case 'l': return value * 1000;  // → ml
    case 'ml': return value;
    default: return value;
  }
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
                    {/* Row 2: Stock match dropdown + qty + unit */}
                    <div className="flex items-center gap-2">
                      <select
                        className="input flex-1 py-1 text-xs"
                        value={ing.stock_item_id ? String(ing.stock_item_id) : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = [...editedIngredients];
                          if (val) {
                            const si = stockItems.find((s) => s.id === +val);
                            updated[idx] = { ...ing, stock_item_id: +val, is_new: false, unit: si?.unit || ing.unit };
                          } else {
                            updated[idx] = { ...ing, stock_item_id: null, is_new: true };
                          }
                          setEditedIngredients(updated);
                        }}
                      >
                        <option value="">-- {t('newItem')}: {ing.name} --</option>
                        {stockItems.map((s) => <option key={s.id} value={String(s.id)}>{s.name} ({s.unit})</option>)}
                      </select>
                      <input type="number" step="any" min="0" className="input w-20 py-1 text-sm text-right"
                        value={ing.quantity_needed || ''} onChange={(e) => {
                          const updated = [...editedIngredients];
                          updated[idx] = { ...ing, quantity_needed: +e.target.value };
                          setEditedIngredients(updated);
                        }} />
                      <span className="text-xs text-fg-secondary w-8">{ing.unit}</span>
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
