'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  listStockItems, createStockItem, updateStockItem, deleteStockItem,
  getStockCategories, createStockTransaction, listStockTransactions,
  batchUpdateStockCategory, getRestaurantSettings,
  StockItem, StockCategory, StockItemInput, StockUnit, StockTransactionType, StockTransaction,
} from '@/lib/api';
import DeliveryImportModal from './DeliveryImportModal';
import Modal from '@/components/Modal';
import {
  MagnifyingGlassIcon, PlusIcon, ArrowDownTrayIcon,
  ExclamationTriangleIcon, TrashIcon, PencilIcon,
  ArrowUpIcon, ArrowDownIcon, ArrowsRightLeftIcon,
  SparklesIcon, ClockIcon, InformationCircleIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];

// Column keys for configurable table
type ColumnKey = 'category' | 'quantity' | 'costPerUnit' | 'pricePerUnit' | 'pricePerUnitTTC' | 'packSize' | 'unitContent' | 'supplier' | 'status' | 'notes' | 'reorderThreshold';

const ALL_COLUMNS: { key: ColumnKey; labelKey: string; defaultVisible: boolean; align?: string }[] = [
  { key: 'category', labelKey: 'category', defaultVisible: true },
  { key: 'quantity', labelKey: 'quantity', defaultVisible: true },
  { key: 'costPerUnit', labelKey: 'costPerUnit', defaultVisible: true, align: 'right' },
  { key: 'pricePerUnit', labelKey: 'pricePerUnit', defaultVisible: false, align: 'right' },
  { key: 'pricePerUnitTTC', labelKey: 'pricePerUnitTTC', defaultVisible: false, align: 'right' },
  { key: 'packSize', labelKey: 'unitsPerPack', defaultVisible: false, align: 'right' },
  { key: 'unitContent', labelKey: 'unitSize', defaultVisible: false, align: 'right' },
  { key: 'supplier', labelKey: 'supplier', defaultVisible: true },
  { key: 'status', labelKey: 'status', defaultVisible: true },
  { key: 'notes', labelKey: 'notes', defaultVisible: false },
  { key: 'reorderThreshold', labelKey: 'reorderLevel', defaultVisible: false, align: 'right' },
];

const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));

function loadColumnPrefs(rid: number): Set<ColumnKey> {
  try {
    const raw = localStorage.getItem(`stock-table-columns-${rid}`);
    if (raw) return new Set(JSON.parse(raw) as ColumnKey[]);
  } catch {}
  return new Set(DEFAULT_VISIBLE);
}

function saveColumnPrefs(rid: number, cols: Set<ColumnKey>) {
  try { localStorage.setItem(`stock-table-columns-${rid}`, JSON.stringify(Array.from(cols))); } catch {}
}

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
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategoryModal, setBulkCategoryModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');

  // Column configuration
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => loadColumnPrefs(rid));
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveColumnPrefs(rid, next);
      return next;
    });
  };

  const isColVisible = (key: ColumnKey) => visibleColumns.has(key);

  // Modals
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: StockItem }>({ open: false });
  const [txModal, setTxModal] = useState<{ open: boolean; item?: StockItem; type?: StockTransactionType }>({ open: false });
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [importModal, setImportModal] = useState(false);
  const [importDraftId, setImportDraftId] = useState<number | undefined>(undefined);
  const [vatRate, setVatRate] = useState(18);
  const [showExVat, setShowExVat] = useState(false);

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
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (lowStockOnly && item.quantity > item.reorder_threshold) return false;
    return true;
  });

  const lowStockCount = items.filter((i) => i.quantity <= i.reorder_threshold && i.reorder_threshold > 0).length;
  const vatMultiplier = 1 + vatRate / 100;

  // Adjust cost based on VAT toggle: normalize all items to the same basis
  const adjustedCost = (item: StockItem) => {
    const raw = item.cost_per_unit;
    if (showExVat && item.price_includes_vat) return raw / vatMultiplier;
    if (!showExVat && !item.price_includes_vat) return raw * vatMultiplier;
    return raw;
  };

  const totalValue = items.reduce((sum, i) => sum + i.quantity * adjustedCost(i), 0);
  const categoryNames = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));

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
    <div className="space-y-5 overflow-x-hidden">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">{t('totalItems')}</p>
          <p className="text-2xl font-bold text-fg-primary mt-1">{items.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">{t('lowStock')}</p>
          <p className={`text-2xl font-bold mt-1 ${lowStockCount > 0 ? 'text-red-500' : 'text-fg-primary'}`}>
            {lowStockCount}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-fg-secondary uppercase tracking-wider">{t('inventoryValue')}</p>
          <p className="text-2xl font-bold text-fg-primary mt-1">{totalValue.toFixed(2)} &#8362;</p>
          <button
            onClick={() => setShowExVat((v) => !v)}
            className="text-xs mt-1 text-brand-500 hover:text-brand-400 transition-colors"
          >
            {showExVat ? t('showIncVat') : t('showExVat')}
          </button>
        </div>
      </div>

      {/* Help link */}
      <a
        href="https://foody-pos.co.il/en/help/kitchen/stock-management"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-400 transition-colors"
      >
        <InformationCircleIcon className="w-4 h-4" />
        {t('learnMoreAbout') || 'Learn more about'} {t('stockManagement') || 'Stock Management'}
      </a>

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
          <input
            type="text"
            placeholder={t('searchItems')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-3 py-2 text-sm w-full"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input py-2 text-sm"
        >
          <option value="">{t('allCategories')}</option>
          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm text-fg-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="rounded"
          />
          {t('lowStockOnly')}
        </label>

        {/* Column toggle dropdown */}
        <div className="relative">
          <button onClick={() => setShowColumnMenu(v => !v)} className="btn-secondary flex items-center gap-1.5 text-sm" title={t('configureColumns')}>
            <AdjustmentsHorizontalIcon className="w-4 h-4" />
          </button>
          {showColumnMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowColumnMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg shadow-lg border border-[var(--divider)] p-2 space-y-1" style={{ background: 'var(--surface)' }}>
                {ALL_COLUMNS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer px-2 py-1.5 rounded hover:bg-[var(--surface-subtle)]">
                    <input type="checkbox" checked={isColVisible(col.key)} onChange={() => toggleColumn(col.key)} className="rounded border-fg-secondary" />
                    {t(col.labelKey)}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        <button onClick={() => { setImportDraftId(undefined); setImportModal(true); }} className="btn-secondary flex items-center gap-2 text-sm">
          <SparklesIcon className="w-4 h-4" /> {t('importDelivery')}
        </button>
        <button onClick={() => setItemModal({ open: true })} className="btn-primary flex items-center gap-2 text-sm">
          <PlusIcon className="w-4 h-4" /> {t('addItem')}
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

          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-3 px-3 w-10">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-fg-secondary" />
                </th>
                <th className="py-3 px-4 font-medium">{t('item')}</th>
                {isColVisible('category') && <th className="py-3 px-4 font-medium">{t('category')}</th>}
                {isColVisible('quantity') && <th className="py-3 px-4 font-medium text-right">{t('quantity')}</th>}
                {isColVisible('costPerUnit') && <th className="py-3 px-4 font-medium text-right">{t('costPerUnit')}</th>}
                {isColVisible('pricePerUnit') && <th className="py-3 px-4 font-medium text-right">{t('pricePerUnit')} {t('exVat')}</th>}
                {isColVisible('pricePerUnitTTC') && <th className="py-3 px-4 font-medium text-right">{t('pricePerUnit')} {t('incVat')}</th>}
                {isColVisible('packSize') && <th className="py-3 px-4 font-medium text-right">{t('unitsPerPack')}</th>}
                {isColVisible('unitContent') && <th className="py-3 px-4 font-medium text-right">{t('unitSize')}</th>}
                {isColVisible('supplier') && <th className="py-3 px-4 font-medium">{t('supplier')}</th>}
                {isColVisible('status') && <th className="py-3 px-4 font-medium">{t('status')}</th>}
                {isColVisible('notes') && <th className="py-3 px-4 font-medium">{t('notes')}</th>}
                {isColVisible('reorderThreshold') && <th className="py-3 px-4 font-medium text-right">{t('reorderLevel')}</th>}
                <th className="py-3 px-4 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold;
                const catColor = categories.find((c) => c.name === item.category)?.color;
                // Price per individual unit (per can/bottle) = cost_per_unit * unit_content
                const pricePerUnit = (item.unit_content ?? 0) > 0 && item.cost_per_unit > 0
                  ? adjustedCost(item) * item.unit_content!
                  : null;
                const pricePerUnitTTC = pricePerUnit !== null ? pricePerUnit * vatMultiplier : null;
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
                    {isColVisible('category') && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {catColor && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catColor }} />}
                          <span className="text-fg-secondary">{item.category || '—'}</span>
                        </div>
                      </td>
                    )}
                    {isColVisible('quantity') && (
                      <td className="py-3 px-4 text-right font-mono text-fg-primary">
                        {item.quantity} <span className="text-fg-secondary text-xs">{item.unit}</span>
                      </td>
                    )}
                    {isColVisible('costPerUnit') && (
                      <td className="py-3 px-4 text-right font-mono text-fg-primary">
                        {item.cost_per_unit > 0 ? (
                          <span>
                            {adjustedCost(item).toFixed(4)} ₪
                            <span className="text-xs text-fg-tertiary ml-1">/{item.unit}</span>
                          </span>
                        ) : '—'}
                      </td>
                    )}
                    {isColVisible('pricePerUnit') && (
                      <td className="py-3 px-4 text-right font-mono text-fg-primary">
                        {pricePerUnit !== null ? `${pricePerUnit.toFixed(2)} ₪` : '—'}
                      </td>
                    )}
                    {isColVisible('pricePerUnitTTC') && (
                      <td className="py-3 px-4 text-right font-mono text-fg-primary">
                        {pricePerUnitTTC !== null ? `${pricePerUnitTTC.toFixed(2)} ₪` : '—'}
                      </td>
                    )}
                    {isColVisible('packSize') && (
                      <td className="py-3 px-4 text-right font-mono text-fg-secondary">
                        {item.pack_size > 0 ? item.pack_size : '—'}
                      </td>
                    )}
                    {isColVisible('unitContent') && (
                      <td className="py-3 px-4 text-right font-mono text-fg-secondary">
                        {(item.unit_content ?? 0) > 0 ? `${item.unit_content} ${item.unit_content_unit || ''}` : '—'}
                      </td>
                    )}
                    {isColVisible('supplier') && (
                      <td className="py-3 px-4 text-fg-secondary">{item.supplier || '—'}</td>
                    )}
                    {isColVisible('status') && (
                      <td className="py-3 px-4">
                        {isLow ? (
                          <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                            <ExclamationTriangleIcon className="w-4 h-4" /> {t('lowStock')}
                          </span>
                        ) : (
                          <span className="text-xs text-status-ready font-medium">{t('ok')}</span>
                        )}
                      </td>
                    )}
                    {isColVisible('notes') && (
                      <td className="py-3 px-4 text-fg-secondary text-xs max-w-[200px] truncate">{item.notes || '—'}</td>
                    )}
                    {isColVisible('reorderThreshold') && (
                      <td className="py-3 px-4 text-right font-mono text-fg-secondary">
                        {item.reorder_threshold > 0 ? `${item.reorder_threshold} ${item.unit}` : '—'}
                      </td>
                    )}
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
          categories={categoryNames}
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
            {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
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

function StockItemModal({
  rid, editing, categories, vatRate, onClose, onSaved,
}: {
  rid: number;
  editing?: StockItem;
  categories: string[];
  vatRate: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const vatMultiplier = 1 + vatRate / 100;
  const [form, setForm] = useState<StockItemInput>({
    name: editing?.name ?? '',
    unit: editing?.unit ?? 'unit',
    quantity: editing?.quantity ?? 0,
    reorder_threshold: editing?.reorder_threshold ?? 0,
    cost_per_unit: editing?.cost_per_unit ?? 0,
    supplier: editing?.supplier ?? '',
    category: editing?.category ?? '',
    notes: editing?.notes ?? '',
    unit_content: editing?.unit_content ?? 0,
    unit_content_unit: editing?.unit_content_unit || 'g',
    pack_size: editing?.pack_size ?? 0,
    is_active: editing?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Ensure unit_content_unit is never empty when unit_content is set
      const payload = { ...form };
      if (payload.unit_content && !payload.unit_content_unit) {
        payload.unit_content_unit = 'g';
      }
      if (editing) {
        await updateStockItem(rid, editing.id, payload);
      } else {
        await createStockItem(rid, payload);
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
    <Modal title={editing ? t('editStockItem') : t('addStockItem')} onClose={onClose}>
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
            <label className="text-xs text-fg-secondary block mb-1">{t('quantity')}</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} />
          </div>
        </div>

        {/* Packaging */}
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('unitsPerPack')}</label>
            <input type="number" step="1" min="0" className="input w-full py-2 text-sm"
              value={form.pack_size || ''} onChange={(e) => setForm({ ...form, pack_size: +e.target.value })}
              placeholder="12" />
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('unitSize')}</label>
            <input type="number" step="any" min="0" className="input w-full py-2 text-sm"
              value={form.unit_content || ''} onChange={(e) => setForm({ ...form, unit_content: +e.target.value, unit_content_unit: form.unit_content_unit || 'g' })}
              placeholder="400" />
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('contentUnit')}</label>
            <select className="input w-full py-2 text-sm" value={form.unit_content_unit || 'g'}
              onChange={(e) => setForm({ ...form, unit_content_unit: e.target.value })}>
              <option value="g">g</option><option value="kg">kg</option>
              <option value="ml">ml</option><option value="l">l</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('reorderThreshold')}</label>
            <input type="number" step="any" className="input w-full py-2 text-sm" value={form.reorder_threshold || ''} onChange={(e) => setForm({ ...form, reorder_threshold: +e.target.value })} />
          </div>
        </div>

        {/* Cost per stock unit */}
        <div>
          <label className="text-xs text-fg-secondary block mb-1">{t('costPerUnit')} (&#8362;/{form.unit_content_unit || form.unit})</label>
          <input type="number" step="any" className="input w-full py-2 text-sm" value={form.cost_per_unit || ''} onChange={(e) => setForm({ ...form, cost_per_unit: +e.target.value })} />
        </div>

        {/* Live price summary */}
        {(form.cost_per_unit ?? 0) > 0 && (() => {
          const cpu = form.cost_per_unit ?? 0;
          const uc = form.unit_content ?? 0;
          const ps = form.pack_size ?? 0;
          const hasUnitContent = uc > 0;
          const pricePerUnit = hasUnitContent ? cpu * uc : 0;
          const pricePerUnitTTC = pricePerUnit * vatMultiplier;
          const pricePerPackage = ps > 0 && hasUnitContent ? pricePerUnit * ps : 0;
          const pricePerPackageTTC = pricePerPackage * vatMultiplier;
          return (
            <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-subtle)' }}>
              {/* Cost per stock unit */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-secondary">{t('costPerUnit')} (/{form.unit_content_unit || form.unit})</span>
                <span className="text-xs text-fg-secondary">
                  {cpu.toFixed(4)} &#8362; {t('exVat')} | {(cpu * vatMultiplier).toFixed(4)} &#8362; {t('incVat')}
                </span>
              </div>
              {/* Price per unit (can/bottle) */}
              {hasUnitContent && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-fg-secondary">{t('pricePerUnit')} ({uc}{form.unit_content_unit || 'g'})</span>
                  <span className="text-sm font-semibold text-fg-primary">
                    {pricePerUnit.toFixed(2)} &#8362; <span className="text-fg-tertiary font-normal">{t('exVat')}</span>
                    {' | '}
                    {pricePerUnitTTC.toFixed(2)} &#8362; <span className="text-fg-tertiary font-normal">{t('incVat')}</span>
                  </span>
                </div>
              )}
              {/* Price per package (box/carton) */}
              {pricePerPackage > 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-[var(--divider)]">
                  <span className="text-xs text-fg-secondary">{t('pricePerPackage')} (×{ps})</span>
                  <span className="text-xs text-fg-secondary">
                    {pricePerPackage.toFixed(2)} &#8362; {t('exVat')} | {pricePerPackageTTC.toFixed(2)} &#8362; {t('incVat')}
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('supplier')}</label>
            <input className="input w-full py-2 text-sm" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-fg-secondary block mb-1">{t('category')}</label>
            <input
              className="input w-full py-2 text-sm"
              list="stock-cats"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <datalist id="stock-cats">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
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
