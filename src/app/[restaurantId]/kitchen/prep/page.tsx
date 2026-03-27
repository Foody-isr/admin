'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listPrepItems, listStockItems, createPrepItem, updatePrepItem, deletePrepItem,
  getPrepIngredients, setPrepIngredients, previewPrepBatch, producePrepBatch,
  getDailyPrepPlan, createPrepTransaction,
  PrepItem, PrepItemInput, PrepItemIngredient, PrepIngredientInput,
  StockItem, StockUnit, ProduceBatchResult, DailyPlanItem, PrepTransactionType,
} from '@/lib/api';
import Modal from '@/components/Modal';
import {
  MagnifyingGlassIcon, PlusIcon, TrashIcon, PencilIcon,
  BeakerIcon, CalendarDaysIcon, ArrowsRightLeftIcon,
  ExclamationTriangleIcon, PlayIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function PrepPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [items, setItems] = useState<PrepItem[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modals
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: PrepItem }>({ open: false });
  const [recipeModal, setRecipeModal] = useState<{ open: boolean; item?: PrepItem }>({ open: false });
  const [batchModal, setBatchModal] = useState<{ open: boolean; item?: PrepItem }>({ open: false });
  const [txModal, setTxModal] = useState<{ open: boolean; item?: PrepItem }>({ open: false });
  const [planModal, setPlanModal] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [prepItems, rawItems] = await Promise.all([
        listPrepItems(rid),
        listStockItems(rid),
      ]);
      setItems(prepItems);
      setStockItems(rawItems);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && item.category !== categoryFilter) return false;
    return true;
  });

  const categoryNames = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
  const lowCount = items.filter((i) => i.reorder_threshold > 0 && i.quantity <= i.reorder_threshold).length;

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this prep item?')) return;
    await deletePrepItem(rid, id);
    reload();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">{t('prepItems')}</p>
          <p className="text-2xl font-bold text-fg-primary mt-1">{items.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">{t('lowStock')}</p>
          <p className={`text-2xl font-bold mt-1 ${lowCount > 0 ? 'text-red-500' : 'text-fg-primary'}`}>{lowCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">{t('category')}</p>
          <p className="text-2xl font-bold text-fg-primary mt-1">{categoryNames.length}</p>
        </div>
      </div>

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input type="text" placeholder={t('searchPrepItems')} value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9 pr-3 py-2 text-sm w-full" />
        </div>

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input py-2 text-sm">
          <option value="">{t('allCategories')}</option>
          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex-1" />

        <button onClick={() => setPlanModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <CalendarDaysIcon className="w-4 h-4" /> {t('dailyPlan')}
        </button>
        <button onClick={() => setItemModal({ open: true })} className="btn-primary flex items-center gap-2 text-sm">
          <PlusIcon className="w-4 h-4" /> {t('addPrepItem')}
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16 space-y-3">
          <p className="text-lg font-semibold text-fg-primary">{t('noPrepItemsFound')}</p>
          <p className="text-sm text-fg-secondary">
            {items.length === 0 ? t('addFirstPrepRecipe') : t('tryAdjustingFilters')}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-3 px-4 font-medium">{t('name')}</th>
                <th className="py-3 px-4 font-medium">{t('category')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('stock')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('yieldPerBatch')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('costPerUnit')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('shelfLife')}</th>
                <th className="py-3 px-4 font-medium">{t('status')}</th>
                <th className="py-3 px-4 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold;
                return (
                  <tr key={item.id} className="hover:bg-[var(--surface-subtle)] transition-colors" style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td className="py-3 px-4 font-medium text-fg-primary">{item.name}</td>
                    <td className="py-3 px-4 text-fg-secondary">{item.category || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono text-fg-primary">
                      {item.quantity} <span className="text-fg-secondary text-xs">{item.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-fg-primary">
                      {item.yield_per_batch > 0 ? `${item.yield_per_batch} ${item.unit}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-fg-primary">
                      {item.cost_per_unit > 0 ? `${item.cost_per_unit.toFixed(2)} ₪` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-fg-secondary">
                      {item.shelf_life_hours > 0 ? `${item.shelf_life_hours}h` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {isLow ? (
                        <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                          <ExclamationTriangleIcon className="w-4 h-4" /> {t('low')}
                        </span>
                      ) : (
                        <span className="text-xs text-status-ready font-medium">{t('ok')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setBatchModal({ open: true, item })} className="p-1 rounded hover:bg-[var(--surface-subtle)]" title={t('produceBatch')}>
                          <PlayIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button onClick={() => setRecipeModal({ open: true, item })} className="p-1 rounded hover:bg-[var(--surface-subtle)]" title={t('editRecipe')}>
                          <BeakerIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button onClick={() => setTxModal({ open: true, item })} className="p-1 rounded hover:bg-[var(--surface-subtle)]" title={t('wasteAdjust')}>
                          <ArrowsRightLeftIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button onClick={() => setItemModal({ open: true, editing: item })} className="p-1 rounded hover:bg-[var(--surface-subtle)]" title={t('edit')}>
                          <PencilIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 rounded hover:bg-[var(--surface-subtle)]" title={t('delete')}>
                          <TrashIcon className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {itemModal.open && (
        <PrepItemModal rid={rid} editing={itemModal.editing} categories={categoryNames} onClose={() => setItemModal({ open: false })} onSaved={reload} />
      )}
      {recipeModal.open && recipeModal.item && (
        <RecipeEditorModal rid={rid} item={recipeModal.item} stockItems={stockItems} onClose={() => setRecipeModal({ open: false })} onSaved={reload} />
      )}
      {batchModal.open && batchModal.item && (
        <BatchProduceModal rid={rid} item={batchModal.item} onClose={() => setBatchModal({ open: false })} onProduced={reload} />
      )}
      {txModal.open && txModal.item && (
        <PrepTxModal rid={rid} item={txModal.item} onClose={() => setTxModal({ open: false })} onSaved={reload} />
      )}
      {planModal && (
        <DailyPlanModal rid={rid} onClose={() => setPlanModal(false)} />
      )}
    </div>
  );
}

// ─── Prep Item Create/Edit Modal ────────────────────────────────────────────

function PrepItemModal({
  rid, editing, categories, onClose, onSaved,
}: {
  rid: number; editing?: PrepItem; categories: string[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<PrepItemInput>({
    name: editing?.name ?? '',
    unit: editing?.unit ?? 'unit',
    quantity: editing?.quantity ?? 0,
    yield_per_batch: editing?.yield_per_batch ?? 0,
    reorder_threshold: editing?.reorder_threshold ?? 0,
    shelf_life_hours: editing?.shelf_life_hours ?? 0,
    category: editing?.category ?? '',
    notes: editing?.notes ?? '',
    is_active: editing?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updatePrepItem(rid, editing.id, form);
      } else {
        await createPrepItem(rid, form);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('editPrepItem') : t('addPrepItem')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-fg-secondary block mb-1">{t('nameLabel')}</label>
          <input className="input w-full py-2 text-sm" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('unitLabel')}</label>
            <select className="input w-full py-2 text-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as StockUnit })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('currentStock')}</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('yieldPerBatchLabel')}</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.yield_per_batch} onChange={(e) => setForm({ ...form, yield_per_batch: +e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('shelfLifeHours')}</label>
            <input type="number" className="input w-full py-2 text-sm" value={form.shelf_life_hours} onChange={(e) => setForm({ ...form, shelf_life_hours: +e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('reorderThreshold')}</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.reorder_threshold} onChange={(e) => setForm({ ...form, reorder_threshold: +e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('category')}</label>
            <input className="input w-full py-2 text-sm" list="prep-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <datalist id="prep-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        <div>
          <label className="text-xs text-fg-secondary block mb-1">{t('notes')}</label>
          <textarea className="input w-full py-2 text-sm" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-sm text-fg-secondary cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
            {t('active')}
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? t('saving') : editing ? t('update') : t('create')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Recipe Editor Modal ────────────────────────────────────────────────────

function RecipeEditorModal({
  rid, item, stockItems, onClose, onSaved,
}: {
  rid: number; item: PrepItem; stockItems: StockItem[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [ingredients, setIngredients] = useState<PrepIngredientInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPrepIngredients(rid, item.id)
      .then((ings) => setIngredients(ings.map((i) => ({ stock_item_id: i.stock_item_id, quantity_needed: i.quantity_needed }))))
      .finally(() => setLoading(false));
  }, [rid, item.id]);

  const addIngredient = () => {
    const unused = stockItems.find((s) => !ingredients.some((i) => i.stock_item_id === s.id));
    if (unused) {
      setIngredients([...ingredients, { stock_item_id: unused.id, quantity_needed: 0 }]);
    }
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, patch: Partial<PrepIngredientInput>) => {
    setIngredients(ingredients.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setPrepIngredients(rid, item.id, ingredients);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-modal shadow-xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg-primary">{t('recipe').replace('{name}', item.name)}</h3>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-fg-secondary">
              {t('rawIngredientsDesc')
                .replace('{yield}', String(item.yield_per_batch))
                .replace('{unit}', item.unit)}
            </p>

            {ingredients.map((ing, idx) => {
              const si = stockItems.find((s) => s.id === ing.stock_item_id);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    className="input flex-1 py-2 text-sm"
                    value={ing.stock_item_id}
                    onChange={(e) => updateIngredient(idx, { stock_item_id: +e.target.value })}
                  >
                    {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}
                  </select>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="input w-24 py-2 text-sm text-right"
                    value={ing.quantity_needed || ''}
                    onChange={(e) => updateIngredient(idx, { quantity_needed: +e.target.value })}
                    placeholder={t('qty')}
                  />
                  <span className="text-xs text-fg-secondary w-8">{si?.unit}</span>
                  <button onClick={() => removeIngredient(idx)} className="p-1 text-red-400 hover:text-red-300">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            <button onClick={addIngredient} className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1">
              <PlusIcon className="w-4 h-4" /> {t('addIngredient')}
            </button>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? t('saving') : t('saveRecipe')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Batch Produce Modal ────────────────────────────────────────────────────

function BatchProduceModal({
  rid, item, onClose, onProduced,
}: {
  rid: number; item: PrepItem; onClose: () => void; onProduced: () => void;
}) {
  const { t } = useI18n();
  const [batches, setBatches] = useState(1);
  const [preview, setPreview] = useState<ProduceBatchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const result = await previewPrepBatch(rid, item.id, { batches });
      setPreview(result);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProduce = async () => {
    setLoading(true);
    try {
      await producePrepBatch(rid, item.id, { batches });
      onProduced();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={t('produce').replace('{name}', item.name)} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-fg-secondary block mb-1">{t('numberOfBatches')}</label>
          <input type="number" min="1" className="input w-full py-2 text-sm" value={batches} onChange={(e) => { setBatches(+e.target.value); setPreview(null); }} />
          <p className="text-xs text-fg-secondary mt-1">
            {t('willProduce')
              .replace('{amount}', (batches * item.yield_per_batch).toFixed(1))
              .replace('{unit}', item.unit)}
          </p>
        </div>

        {!preview ? (
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
            <button onClick={handlePreview} disabled={loading} className="btn-primary text-sm">{loading ? t('checking') : t('preview')}</button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium text-fg-primary">{t('ingredientsToConsume')}</p>
              {preview.ingredients.map((ing) => (
                <div key={ing.stock_item_id} className="flex justify-between text-sm">
                  <span className="text-fg-secondary">{ing.stock_item_name}</span>
                  <span className="font-mono text-fg-primary">-{ing.quantity_used.toFixed(2)} (rem: {ing.remaining.toFixed(2)})</span>
                </div>
              ))}
            </div>

            {preview.insufficient.length > 0 && (
              <div className="bg-red-500/10 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium text-red-500 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-4 h-4" /> {t('insufficientStock')}
                </p>
                {preview.insufficient.map((s) => (
                  <p key={s.stock_item_id} className="text-sm text-red-400">
                    {t('insufficientDetail')
                      .replace('{name}', s.stock_item_name)
                      .replace('{required}', s.required.toFixed(2))
                      .replace('{available}', s.available.toFixed(2))}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
              <button onClick={handleProduce} disabled={loading || preview.insufficient.length > 0} className="btn-primary text-sm">
                {loading ? t('producing') : t('confirmProduce')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Prep Transaction (Waste/Adjust) Modal ──────────────────────────────────

function PrepTxModal({
  rid, item, onClose, onSaved,
}: {
  rid: number; item: PrepItem; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<PrepTransactionType>('waste');
  const [qty, setQty] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) return alert('Quantity must be positive');
    setSaving(true);
    try {
      await createPrepTransaction(rid, {
        prep_item_id: item.id,
        type,
        quantity_delta: -qty,
        notes,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('adjustItem').replace('{name}', item.name)} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {(['waste', 'adjust'] as PrepTransactionType[]).map((txType) => (
            <button
              key={txType}
              type="button"
              onClick={() => setType(txType)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === txType ? 'border border-brand-500 text-brand-500 bg-brand-500/5' : 'border border-divider text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {t(txType)}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-fg-secondary block mb-1">{t('quantityUnit').replace('{unit}', item.unit)}</label>
          <input type="number" step="any" min="0" required className="input w-full py-2 text-sm" value={qty || ''} onChange={(e) => setQty(+e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-fg-secondary block mb-1">{t('notes')}</label>
          <input className="input w-full py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? t('saving') : t('confirm')}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Daily Prep Plan Modal ──────────────────────────────────────────────────

function DailyPlanModal({ rid, onClose }: { rid: number; onClose: () => void }) {
  const { t } = useI18n();
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay());
  const [plan, setPlan] = useState<DailyPlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getDailyPrepPlan(rid, { day_of_week: dayOfWeek });
      setPlan(items);
    } catch {
      setPlan([]);
    } finally {
      setLoading(false);
    }
  }, [rid, dayOfWeek]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-modal shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg-primary">{t('dailyPrepPlan')}</h3>
          <button onClick={onClose} className="text-fg-secondary hover:text-fg-primary text-xl leading-none">&times;</button>
        </div>

        <div className="mb-4">
          <select className="input py-2 text-sm" value={dayOfWeek} onChange={(e) => setDayOfWeek(+e.target.value)}>
            {DAY_KEYS.map((d, i) => <option key={i} value={i}>{t(d)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : plan.length === 0 ? (
          <p className="text-sm text-fg-secondary text-center py-8">{t('noPrepRecommendations')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-2 px-3 font-medium">{t('prepItem')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('current')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('demand')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('batches')}</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((p) => (
                <tr key={p.prep_item.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                  <td className="py-2 px-3 font-medium text-fg-primary">{p.prep_item.name}</td>
                  <td className="py-2 px-3 text-right font-mono text-fg-secondary">{p.current_stock.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-mono text-fg-primary">{p.predicted_demand.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-brand-500">{p.recommended_batches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="btn-secondary text-sm">{t('close')}</button>
        </div>
      </div>
    </div>
  );
}
