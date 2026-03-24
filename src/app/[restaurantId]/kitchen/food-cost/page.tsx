'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getMenu, listStockItems, listPrepItems,
  getMenuItemIngredients, setMenuItemIngredients,
  MenuCategory, MenuItem, MenuItemIngredient, IngredientInput,
  StockItem, PrepItem,
} from '@/lib/api';
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon,
  ExclamationTriangleIcon, CurrencyDollarIcon,
} from '@heroicons/react/24/outline';

const COST_THRESHOLD = 0.35; // 35% food cost warning

export default function FoodCostPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

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

  const reload = useCallback(async () => {
    try {
      const [cats, stock, prep] = await Promise.all([
        getMenu(rid),
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

  // Summary stats
  const itemsWithCost = allItems.filter((item) => {
    // We only know costs for the selected item in real-time, so show aggregate stats
    return true;
  });

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
            placeholder="Search menu items..."
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
            <p className="text-lg font-semibold text-fg-primary">Select a menu item</p>
            <p className="text-sm text-fg-secondary">Choose an item from the list to view and manage its food cost breakdown.</p>
          </div>
        ) : loadingIngredients ? (
          <div className="card flex justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : editing ? (
          /* Edit mode */
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-fg-primary text-lg">Edit Ingredients: {selectedItem.name}</h3>
            </div>

            <p className="text-sm text-fg-secondary">Link raw stock items and prep items with quantity per serving.</p>

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
                  <option value="">Select ingredient...</option>
                  <optgroup label="Raw Stock">
                    {stockItems.map((s) => <option key={`s${s.id}`} value={`stock:${s.id}`}>{s.name} ({s.unit})</option>)}
                  </optgroup>
                  <optgroup label="Prep Items">
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
                  placeholder="Qty"
                />
                <button onClick={() => removeEditIngredient(idx)} className="p-1 text-red-400 hover:text-red-300">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button onClick={addEditIngredient} className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1">
              <PlusIcon className="w-4 h-4" /> Add Ingredient
            </button>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save'}</button>
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
                  <p className="text-sm text-fg-secondary">Selling price: <span className="font-mono font-bold">{selectedItem.price.toFixed(2)} &#8362;</span></p>
                </div>
                <button onClick={startEditing} className="btn-secondary text-sm">Edit Ingredients</button>
              </div>

              {/* Cost summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
                  <p className="text-xs text-fg-secondary">Food Cost</p>
                  <p className="text-xl font-bold text-fg-primary">{totalCost.toFixed(2)} &#8362;</p>
                </div>
                <div className={`rounded-lg p-3 ${costPct > COST_THRESHOLD ? 'bg-red-500/10' : ''}`} style={costPct <= COST_THRESHOLD ? { background: 'var(--surface-subtle)' } : {}}>
                  <p className="text-xs text-fg-secondary">Cost %</p>
                  <p className={`text-xl font-bold ${costPct > COST_THRESHOLD ? 'text-red-500' : 'text-fg-primary'}`}>
                    {(costPct * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
                  <p className="text-xs text-fg-secondary">Gross Profit</p>
                  <p className="text-xl font-bold text-status-ready">{(selectedItem.price - totalCost).toFixed(2)} &#8362;</p>
                </div>
              </div>

              {costPct > COST_THRESHOLD && (
                <div className="flex items-center gap-2 mt-3 text-sm text-red-500">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  Food cost exceeds {(COST_THRESHOLD * 100).toFixed(0)}% threshold
                </div>
              )}
            </div>

            {/* Ingredients table */}
            <div className="card overflow-hidden p-0">
              {ingredients.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-fg-secondary">No ingredients linked yet.</p>
                  <button onClick={startEditing} className="text-sm text-brand-500 hover:text-brand-400">Add ingredients</button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                      <th className="py-3 px-4 font-medium">Ingredient</th>
                      <th className="py-3 px-4 font-medium">Type</th>
                      <th className="py-3 px-4 font-medium text-right">Qty / Serving</th>
                      <th className="py-3 px-4 font-medium text-right">Unit Cost</th>
                      <th className="py-3 px-4 font-medium text-right">Line Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing) => {
                      const name = ing.stock_item?.name ?? ing.prep_item?.name ?? '?';
                      const unit = ing.stock_item?.unit ?? ing.prep_item?.unit ?? '';
                      const unitCost = ing.stock_item?.cost_per_unit ?? ing.prep_item?.cost_per_unit ?? 0;
                      const lineCost = calcLineCost(ing);
                      const type = ing.stock_item_id ? 'Raw' : 'Prep';
                      return (
                        <tr key={ing.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                          <td className="py-3 px-4 font-medium text-fg-primary">{name}</td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${type === 'Raw' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
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
                      <td colSpan={4} className="py-3 px-4 text-right font-semibold text-fg-primary">Total Food Cost</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-fg-primary">{totalCost.toFixed(2)} &#8362;</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
