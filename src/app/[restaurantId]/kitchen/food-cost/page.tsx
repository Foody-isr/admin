'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, listStockItems, listPrepItems,
  getMenuItemIngredients, getItemOptionPrices,
  updateStockItem,
  getRestaurantSettings,
  MenuCategory, MenuItem, MenuItemIngredient,
  StockItem, PrepItem, StockItemInput, ItemOptionOverride,
} from '@/lib/api';
import RecipeImportModal from '../RecipeImportModal';
import {
  MagnifyingGlassIcon, CurrencyDollarIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import StockQuantityForm, {
  StockInput, serverToStockInput, stockInputToServer,
} from '@/components/stock/StockQuantityForm';
import MenuItemCostPanel from '@/components/menu-item/MenuItemCostPanel';

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
  const [editingStockItem, setEditingStockItem] = useState<StockItem | null>(null);
  const [vatRate, setVatRate] = useState(18);
  const [itemOptionOverrides, setItemOptionOverrides] = useState<ItemOptionOverride[]>([]);

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

  // Load ingredients when item selected
  const selectItem = async (item: MenuItem) => {
    setSelectedItem(item);
    setLoadingIngredients(true);
    try {
      const [ings, overrides] = await Promise.all([
        getMenuItemIngredients(rid, item.id),
        getItemOptionPrices(rid, item.id).catch(() => [] as ItemOptionOverride[]),
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

  // All menu items flattened
  const allItems = categories.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, category_name: c.name })));
  const filteredItems = search
    ? allItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : allItems;


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
          {categories.length === 0 ? (
            <button
              onClick={() => router.push(`/${rid}/menu/items`)}
              className="w-full text-left px-4 py-8 space-y-1 hover:bg-[var(--surface-subtle)] transition-colors"
            >
              <p className="text-sm font-medium text-fg-primary">{t('noItemsWithRecipes')}</p>
              <p className="text-xs text-fg-secondary">{t('noItemsWithRecipesHint')}</p>
            </button>
          ) : (
            categories.map((cat) => {
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
            })
          )}
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
          <div className="space-y-4">
            {/* Item header — quick actions; details live in the tabbed Menu Item page */}
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-fg-primary text-lg">{selectedItem.name}</h3>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.id}?tab=recipe`)}
                    className="btn-secondary text-sm"
                  >
                    {t('viewRecipe')}
                  </button>
                  <button onClick={() => setShowImportModal(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4" /> {t('importRecipe')}
                  </button>
                  <button
                    onClick={() => router.push(`/${rid}/menu/items/${selectedItem.id}?tab=recipe`)}
                    className="btn-primary text-sm flex items-center gap-1.5"
                  >
                    {t('editIngredients').replace('{name}', '').replace(/[:\s]+$/, '')} &rarr;
                  </button>
                </div>
              </div>
            </div>

            <MenuItemCostPanel
              rid={rid}
              item={selectedItem}
              ingredients={ingredients}
              prepItems={prepItems}
              stockItems={stockItems}
              vatRate={vatRate}
              itemOptionOverrides={itemOptionOverrides}
              onEditStockItem={(s) => setEditingStockItem(s)}
            />
          </div>
        )}
      </div>

      {/* Recipe Import Modal */}
      {showImportModal && selectedItem && (
        <RecipeImportModal
          rid={rid}
          mode={{ kind: 'menu-item', menuItem: selectedItem }}
          stockItems={stockItems}
          onClose={() => setShowImportModal(false)}
          onImported={async () => {
            setShowImportModal(false);
            const [cats] = await Promise.all([getAllCategories(rid, { withRecipeOnly: true }), reload()]);
            // Find the fresh item from reloaded data (with updated recipe_yield)
            const freshItem = cats.flatMap(c => c.items || []).find(i => i.id === selectedItem.id);
            if (freshItem) selectItem(freshItem); else selectItem(selectedItem);
          }}
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

