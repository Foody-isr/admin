'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  listStockItems, createStockItem, updateStockItem, deleteStockItem,
  getStockCategories, createStockTransaction, listStockTransactions,
  batchUpdateStockCategory, getRestaurantSettings,
  StockItem, StockCategory, StockItemInput, StockTransactionType, StockTransaction,
} from '@/lib/api';
import DeliveryImportModal from './DeliveryImportModal';
import StockQuantityForm, {
  StockInput,
  defaultStockInput,
  serverToStockInput,
  stockInputToServer,
} from '@/components/stock/StockQuantityForm';
import StockFiltersDrawer, { FilterView } from '@/components/stock/StockFiltersDrawer';
import Modal from '@/components/Modal';
import FormModal from '@/components/FormModal';
import FormSection from '@/components/FormSection';
import FormField from '@/components/FormField';
import StatusPill from '@/components/StatusPill';
import SearchableListField from '@/components/SearchableListField';
import {
  MagnifyingGlassIcon, PlusIcon, ArrowDownTrayIcon,
  ExclamationTriangleIcon, TrashIcon, PencilIcon,
  ArrowUpIcon, ArrowDownIcon, ArrowsRightLeftIcon,
  SparklesIcon, ClockIcon, InformationCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import {
  getPackaging,
  formatQuantityAtLevel,
  formatUnitPriceAtLevel,
  loadLevel,
  saveLevel,
  Level,
} from '@/lib/stock/levels';

// ─── Main ──────────────────────────────────────────────────────────────────

export default function StockPage() {
  const { restaurantId } = useParams();
  const searchParams = useSearchParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [filtersDrawer, setFiltersDrawer] = useState<{ open: boolean; view: FilterView }>({
    open: false,
    view: 'index',
  });

  const openFiltersDrawer = (view: FilterView) => setFiltersDrawer({ open: true, view });
  const closeFiltersDrawer = () => setFiltersDrawer((prev) => ({ ...prev, open: false }));

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategoryModal, setBulkCategoryModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');

  // Per-item display level for Quantity/Price cells
  const [itemLevels, setItemLevels] = useState<Record<number, Level>>({});
  const [levelPopover, setLevelPopover] = useState<number | null>(null);

  const getItemLevel = useCallback((item: StockItem): Level => {
    const stored = itemLevels[item.id];
    if (stored) return stored;
    return loadLevel(rid, item.id) ?? getPackaging(item).defaultLevel;
  }, [itemLevels, rid]);

  const selectItemLevel = useCallback((itemId: number, level: Level) => {
    setItemLevels((prev) => ({ ...prev, [itemId]: level }));
    saveLevel(rid, itemId, level);
    setLevelPopover(null);
  }, [rid]);

  // Modals
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: StockItem }>({ open: false });
  const [txModal, setTxModal] = useState<{ open: boolean; item?: StockItem; type?: StockTransactionType }>({ open: false });
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [importModal, setImportModal] = useState(false);
  const [importDraftId, setImportDraftId] = useState<number | undefined>(undefined);
  const [vatRate, setVatRate] = useState(18);

  // Open import modal with draft if ?draft=ID is in URL
  useEffect(() => {
    const draftParam = searchParams.get('draft');
    if (draftParam) {
      setImportDraftId(Number(draftParam));
      setImportModal(true);
    }
  }, [searchParams]);

  // Load VAT rate from restaurant settings
  useEffect(() => {
    getRestaurantSettings(rid).then((s) => setVatRate(s.vat_rate ?? 18)).catch(() => {});
  }, [rid]);

  const reload = useCallback(async () => {
    try {
      const [stockItems, stockCats] = await Promise.all([
        listStockItems(rid),
        getStockCategories(rid),
      ]);
      setItems(stockItems);
      setCategories(stockCats);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // Derived
  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !selectedCategories.has(item.category)) return false;
    return true;
  });

  const vatMultiplier = 1 + vatRate / 100;

  // Normalize cost to VAT-inclusive so price cells compare on the same basis
  const adjustedCost = (item: StockItem) => {
    const raw = item.cost_per_unit;
    if (!item.price_includes_vat) return raw * vatMultiplier;
    return raw;
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('deleteStockItem'))) return;
    await deleteStockItem(rid, id);
    reload();
  };

  // Bulk selection
  const toggleSelectAll = () => {
    const filteredIds = filtered.map((i) => i.id);
    const allSelected = filteredIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredIds));
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(t('bulkDeleteConfirm').replace('{count}', String(selected.size)))) return;
    for (const id of Array.from(selected)) {
      await deleteStockItem(rid, id);
    }
    setSelected(new Set());
    reload();
  };

  const handleBulkCategory = async () => {
    if (selected.size === 0 || !bulkCategory) return;
    await batchUpdateStockCategory(rid, { item_ids: Array.from(selected), category: bulkCategory });
    setSelected(new Set());
    setBulkCategoryModal(false);
    setBulkCategory('');
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
    <div className="space-y-5 w-full overflow-hidden">
      {/* Page header: help link + primary actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <a
          href="https://foody-pos.co.il/en/help/kitchen/stock-management"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-400 transition-colors"
        >
          <InformationCircleIcon className="w-4 h-4" />
          {t('learnMoreAbout') || 'Learn more about'} {t('stockManagement') || 'Stock Management'}
        </a>
        <div className="flex items-center gap-2">
          <button onClick={() => { setImportDraftId(undefined); setImportModal(true); }} className="btn-secondary flex items-center gap-2 text-sm">
            <SparklesIcon className="w-4 h-4" /> {t('importDelivery')}
          </button>
          <button onClick={() => setItemModal({ open: true })} className="btn-primary flex items-center gap-2 text-sm">
            <PlusIcon className="w-4 h-4" /> {t('addItem')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input
            type="text"
            placeholder={t('searchItems')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-3 py-2 text-sm w-full"
          />
        </div>

        <button
          type="button"
          onClick={() => openFiltersDrawer('category')}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition-colors border ${
            selectedCategories.size > 0
              ? 'bg-brand-500/10 text-brand-500 border-brand-500/40 hover:bg-brand-500/20'
              : 'text-fg-primary border-[var(--divider)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          {t('category')}
          {selectedCategories.size > 0 && (
            <span className="text-xs font-medium">({selectedCategories.size})</span>
          )}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => openFiltersDrawer('index')}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm text-fg-primary border border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors"
        >
          {t('allFilters')}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16 space-y-3">
          <p className="text-lg font-semibold text-fg-primary">{t('noStockItemsFound')}</p>
          <p className="text-sm text-fg-secondary">
            {items.length === 0 ? t('addFirstStockItem') : t('tryAdjustingFilters')}
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-500/10" style={{ borderBottom: '1px solid var(--divider)' }}>
              <span className="text-sm font-medium text-brand-500">
                {t('itemsSelected').replace('{count}', String(selected.size))}
              </span>
              <div className="flex-1" />
              <button onClick={() => setBulkCategoryModal(true)} className="btn-secondary text-xs py-1.5 px-3">
                {t('updateCategory')}
              </button>
              <button onClick={handleBulkDelete} className="text-xs py-1.5 px-3 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors font-medium">
                {t('delete')} ({selected.size})
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-fg-secondary hover:text-fg-primary">
                {t('cancel')}
              </button>
            </div>
          )}

          <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider">
                <th className="py-3 px-3 w-10 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-fg-secondary" />
                </th>
                <th className="py-3 px-4 font-medium sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]">{t('item')}</th>
                <th className="py-3 px-4 font-medium sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]">{t('category')}</th>
                <th className="py-3 px-4 font-medium text-right sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]">{t('quantity')}</th>
                <th className="py-3 px-4 font-medium text-right sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]">{t('price')}</th>
                <th className="py-3 px-4 font-medium sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]">{t('supplier')}</th>
                <th className="py-3 px-4 font-medium sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]">{t('status')}</th>
                <th className="py-3 px-4 font-medium w-10 sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold;
                const catColor = categories.find((c) => c.name === item.category)?.color;
                const pkg = getPackaging(item);
                const level = getItemLevel(item);
                const popoverOpen = levelPopover === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-[var(--surface-subtle)] transition-colors ${selected.has(item.id) ? 'bg-brand-500/5' : ''}`}
                    style={{ borderBottom: '1px solid var(--divider)' }}
                  >
                    <td className="py-3 px-3 w-10">
                      <input type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-fg-secondary" />
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-fg-primary">{item.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {catColor && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catColor }} />}
                        <span className="text-fg-secondary">{item.category || '—'}</span>
                      </div>
                    </td>
                    <td
                      className="py-3 px-4 text-right font-mono text-fg-primary cursor-pointer hover:bg-[var(--surface-subtle)] relative"
                      onClick={() => setLevelPopover(item.id)}
                      title={t('displayAs') || 'Display as'}
                    >
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          {formatQuantityAtLevel(item, level)}
                          <ChevronDownIcon className="w-3.5 h-3.5 text-fg-tertiary" />
                        </span>
                        {popoverOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setLevelPopover(null); }} />
                            <div
                              className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg shadow-lg border border-[var(--divider)] p-1 text-left"
                              style={{ background: 'var(--surface)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="px-3 py-2 text-xs text-fg-secondary uppercase tracking-wider">
                                {t('displayAs') || 'Display as'}
                              </div>
                              {pkg.levels.map((lvl) => (
                                <button
                                  key={lvl}
                                  onClick={(e) => { e.stopPropagation(); selectItemLevel(item.id, lvl); }}
                                  className={`w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 ${lvl === level ? 'bg-brand-500/10 text-brand-500' : 'text-fg-primary hover:bg-[var(--surface-subtle)]'}`}
                                >
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm truncate">{formatQuantityAtLevel(item, lvl)}</div>
                                    <div className="font-mono text-xs text-fg-secondary truncate">
                                      {formatUnitPriceAtLevel(item, lvl, adjustedCost(item))}
                                    </div>
                                  </div>
                                  {lvl === pkg.defaultLevel && pkg.levels.length > 1 && (
                                    <span className="text-[10px] uppercase tracking-wider text-fg-tertiary flex-shrink-0">
                                      {t('default') || 'default'}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </td>
                    <td
                      className="py-3 px-4 text-right font-mono text-fg-primary cursor-pointer hover:bg-[var(--surface-subtle)]"
                      onClick={() => setLevelPopover(item.id)}
                      title={t('displayAs') || 'Display as'}
                    >
                      {formatUnitPriceAtLevel(item, level, adjustedCost(item))}
                    </td>
                    <td className="py-3 px-4 text-fg-secondary">{item.supplier || '—'}</td>
                    <td className="py-3 px-4">
                      {isLow ? (
                        <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                          <ExclamationTriangleIcon className="w-4 h-4" /> {t('lowStock')}
                        </span>
                      ) : (
                        <span className="text-xs text-status-ready font-medium">{t('ok')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setHistoryItem(item)}
                          className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                          title={t('stockHistory')}
                        >
                          <ClockIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button
                          onClick={() => setTxModal({ open: true, item, type: 'receive' })}
                          className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                          title={t('receiveStock')}
                        >
                          <ArrowDownTrayIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button
                          onClick={() => setItemModal({ open: true, editing: item })}
                          className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                          title={t('edit')}
                        >
                          <PencilIcon className="w-4 h-4 text-fg-secondary" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 rounded hover:bg-[var(--surface-subtle)]"
                          title={t('delete')}
                        >
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
        </div>
      )}

      {/* Stock Item Modal */}
      {itemModal.open && (
        <StockItemModal
          rid={rid}
          editing={itemModal.editing}
          categories={categories.map((c) => c.name)}
          vatRate={vatRate}
          onClose={() => setItemModal({ open: false })}
          onSaved={reload}
        />
      )}

      {/* Transaction Modal */}
      {txModal.open && txModal.item && (
        <TransactionModal
          rid={rid}
          item={txModal.item}
          defaultType={txModal.type}
          onClose={() => setTxModal({ open: false })}
          onSaved={reload}
        />
      )}

      {/* Transaction History Modal */}
      {historyItem && (
        <StockHistoryModal
          rid={rid}
          item={historyItem}
          onClose={() => setHistoryItem(null)}
          t={t}
        />
      )}

      {/* Stock Filters Drawer (nested: index → category) */}
      <StockFiltersDrawer
        open={filtersDrawer.open}
        initialView={filtersDrawer.view}
        onClose={closeFiltersDrawer}
        categories={categories}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
      />

      {/* AI Delivery Import Modal */}
      {importModal && (
        <DeliveryImportModal
          rid={rid}
          stockItems={items}
          draftId={importDraftId}
          onClose={() => { setImportModal(false); setImportDraftId(undefined); }}
          onImported={reload}
        />
      )}

      {/* Bulk Update Category Modal */}
      {bulkCategoryModal && (
        <Modal title={t('updateCategory')} onClose={() => setBulkCategoryModal(false)}>
          <p className="text-sm text-fg-secondary mb-3">
            {t('bulkCategoryDesc').replace('{count}', String(selected.size))}
          </p>
          <select className="input w-full py-2 text-sm mb-4" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">{t('selectCategory')}</option>
            {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <input className="input w-full py-2 text-sm mb-4" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}
            placeholder={t('orTypeNewCategory')} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkCategoryModal(false)} className="btn-secondary text-sm">{t('cancel')}</button>
            <button onClick={handleBulkCategory} disabled={!bulkCategory} className="btn-primary text-sm">{t('apply')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Stock Item Create/Edit Modal ───────────────────────────────────────────

function StockItemModal({ rid, editing, categories, vatRate, onClose, onSaved }: {
  rid: number; editing?: StockItem; categories: string[]; vatRate: number; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();

  // Shared quantity/packaging/price form state
  const [qty, setQty] = useState<StockInput>(() =>
    editing ? serverToStockInput(editing) : defaultStockInput(),
  );

  // Item-level fields (not part of the quantity form)
  const [name, setName] = useState(editing?.name ?? '');
  const [supplier, setSupplier] = useState(editing?.supplier ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [reorder, setReorder] = useState(editing?.reorder_threshold ?? 0);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload: StockItemInput = {
        name,
        ...stockInputToServer(qty),
        reorder_threshold: reorder,
        supplier, category, notes,
        is_active: isActive,
      };
      if (editing) await updateStockItem(rid, editing.id, payload);
      else await createStockItem(rid, payload);
      onSaved(); onClose();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const sidebar = (
    <>
      <FormSection>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-fg-primary">{t('status')}</h3>
          <StatusPill
            active={isActive}
            onToggle={() => setIsActive(!isActive)}
            activeLabel={t('active')}
            inactiveLabel={t('inactive')}
          />
        </div>
      </FormSection>

      <FormSection title={t('category')}>
        <SearchableListField
          mode="single"
          allowCustom
          placeholder={t('category')}
          options={categories.map((c) => ({ value: c, label: c }))}
          value={category}
          onChange={setCategory}
        />
      </FormSection>

      <FormSection title={t('supplier')}>
        <input className="input text-sm w-full" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </FormSection>

      <FormSection title={t('reorderThreshold')}>
        <input type="number" step="any" className="input text-sm w-full" value={reorder || ''}
          onChange={(e) => setReorder(+e.target.value)} />
      </FormSection>

      <FormSection title={t('notes')}>
        <textarea className="input text-sm w-full" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormSection>
    </>
  );

  return (
    <FormModal
      title={editing ? t('editStockItem') : t('addStockItem')}
      onClose={onClose}
      onSave={handleSubmit}
      saveLabel={editing ? t('update') : t('create')}
      saving={saving}
      saveDisabled={!name.trim()}
      sidebar={sidebar}
    >
          {/* Name */}
          <input className="input w-full text-base" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('nameLabel') + ' *'} autoFocus />

          <StockQuantityForm value={qty} onChange={setQty} vatRate={vatRate} />

    </FormModal>
  );
}

// ─── Transaction Modal ──────────────────────────────────────────────────────

function TransactionModal({
  rid, item, defaultType, onClose, onSaved,
}: {
  rid: number;
  item: StockItem;
  defaultType?: StockTransactionType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<StockTransactionType>(defaultType ?? 'receive');
  const [qty, setQty] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) return alert('Quantity must be positive');
    setSaving(true);
    try {
      const delta = type === 'receive' ? qty : -qty;
      await createStockTransaction(rid, {
        stock_item_id: item.id,
        type,
        quantity_delta: delta,
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

  const typeOptions: { value: StockTransactionType; label: string; icon: typeof ArrowDownIcon }[] = [
    { value: 'receive', label: t('receive'), icon: ArrowDownIcon },
    { value: 'waste', label: t('waste'), icon: TrashIcon },
    { value: 'adjust', label: t('adjust'), icon: ArrowsRightLeftIcon },
  ];

  const afterQty = type === 'receive' ? item.quantity + qty : item.quantity - qty;

  return (
    <Modal title={t('stockTransaction').replace('{name}', item.name)} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === opt.value ? 'border border-brand-500 text-brand-500 bg-brand-500/5' : 'border border-divider text-fg-secondary hover:text-fg-primary'
              }`}
            >
              <opt.icon className="w-4 h-4" />
              {opt.label}
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

        <div className="text-xs text-fg-secondary">
          {t('currentAfter')
            .replace('{current}', String(item.quantity))
            .replace('{after}', String(afterQty))
            .replace(/\{unit\}/g, item.unit)}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? t('saving') : t('confirm')}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Stock History Modal ────────────────────────────────────────────

const TX_TYPE_COLORS: Record<string, string> = {
  receive: 'text-emerald-600 bg-emerald-50',
  deduct: 'text-red-600 bg-red-50',
  waste: 'text-orange-600 bg-orange-50',
  adjust: 'text-blue-600 bg-blue-50',
  produce: 'text-purple-600 bg-purple-50',
};

function StockHistoryModal({ rid, item, onClose, t }: {
  rid: number;
  item: StockItem;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listStockTransactions(rid, { stock_item_id: item.id, limit: 50 })
      .then(setTransactions)
      .finally(() => setLoading(false));
  }, [rid, item.id]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Modal title={`${t('stockHistoryTitle')} — ${item.name}`} onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10 text-fg-secondary text-sm">{t('noTransactions')}</div>
      ) : (
        <div className="divide-y divide-[var(--divider)] max-h-[60vh] overflow-y-auto">
          {transactions.map(tx => {
            const isPositive = tx.quantity_delta > 0;
            const typeColor = TX_TYPE_COLORS[tx.type] || 'text-fg-secondary bg-[var(--surface-subtle)]';
            return (
              <div key={tx.id} className="px-4 py-3 flex gap-3">
                <div className="flex-shrink-0 pt-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap ${typeColor}`}>
                    {t(tx.type) || tx.type}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg-primary break-words">{tx.notes || '—'}</p>
                  <p className="text-xs text-fg-tertiary mt-0.5">{formatDate(tx.created_at)} {formatTime(tx.created_at)}</p>
                </div>
                <div className={`text-sm font-mono font-semibold whitespace-nowrap flex-shrink-0 ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{tx.quantity_delta} {item.unit}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
