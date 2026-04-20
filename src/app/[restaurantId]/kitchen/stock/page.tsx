'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  listStockItems, createStockItem, updateStockItem, deleteStockItem,
  getStockCategories, createStockTransaction, listStockTransactions,
  batchUpdateStockCategory, batchUpdateStockVat, getRestaurantSettings, uploadStockItemImage,
  listSuppliers,
  StockItem, StockCategory, StockItemInput, StockItemAliasInput, StockTransactionType, StockTransaction,
  Supplier,
} from '@/lib/api';
import VatRateSelect from '@/components/stock/VatRateSelect';
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
  SparklesIcon, ClockIcon, ArrowPathIcon,
  ChevronDownIcon, ChevronUpIcon, PhotoIcon, ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
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
  const router = useRouter();
  const pathname = usePathname();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const deepLinkAppliedRef = useRef(false);

  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  type SortKey = 'name' | 'quantity' | 'price';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
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
  const [bulkVatModal, setBulkVatModal] = useState(false);
  // `null` = clear override (use restaurant default); value = explicit rate (0 = exempt).
  const [bulkVatValue, setBulkVatValue] = useState<number | null>(null);

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
  // HT/TTC display preference. Drives both the table price cells and the
  // create/edit form's price entry mode. Persists in localStorage per user.
  const [vatDisplayMode, setVatDisplayMode] = useState<'ex' | 'inc'>('inc');
  useEffect(() => {
    try {
      const v = localStorage.getItem('foody.stock.vatDisplay');
      if (v === 'ex' || v === 'inc') setVatDisplayMode(v);
    } catch { /* ignore */ }
  }, []);
  const toggleVatDisplay = () => {
    setVatDisplayMode((prev) => {
      const next = prev === 'ex' ? 'inc' : 'ex';
      try { localStorage.setItem('foody.stock.vatDisplay', next); } catch { /* ignore */ }
      return next;
    });
  };

  // Open import modal with draft if ?draft=ID is in URL
  useEffect(() => {
    const draftParam = searchParams.get('draft');
    if (draftParam) {
      setImportDraftId(Number(draftParam));
      setImportModal(true);
    }
  }, [searchParams]);

  // Deep-link: `?edit=<stockItemId>` opens the stock item editor directly.
  // Used by the Food Cost ingredient table — clicking an ingredient name
  // navigates here so the user can edit quantity/price on the real editor.
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (items.length === 0) return;
    const editId = searchParams.get('edit');
    if (!editId) return;
    const target = items.find((s) => String(s.id) === editId);
    if (!target) return;
    deepLinkAppliedRef.current = true;
    setItemModal({ open: true, editing: target });
    const q = new URLSearchParams(searchParams.toString());
    q.delete('edit');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [items, searchParams, router, pathname]);

  // Load VAT rate from restaurant settings
  useEffect(() => {
    getRestaurantSettings(rid).then((s) => setVatRate(s.vat_rate ?? 18)).catch(() => {});
  }, [rid]);

  const reload = useCallback(async () => {
    try {
      const [stockItems, stockCats, sups] = await Promise.all([
        listStockItems(rid),
        getStockCategories(rid),
        listSuppliers(rid).catch(() => [] as Supplier[]),
      ]);
      setItems(stockItems);
      setCategories(stockCats);
      setSuppliers(sups);
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

  // cost_per_unit is always stored ex-VAT (migration 059). Per-item VAT rate
  // may override the restaurant default — `0` makes an item exempt (Israeli
  // produce, etc.).
  const effectiveRate = (item: StockItem) =>
    item.vat_rate_override == null ? vatRate : item.vat_rate_override;

  // Cost used for the price cells. When the display mode is `inc`, apply the
  // per-item VAT multiplier; otherwise show the raw ex-VAT value. Sort always
  // uses inc-VAT so the ordering is stable regardless of display mode.
  const adjustedCost = (item: StockItem) =>
    vatDisplayMode === 'inc'
      ? item.cost_per_unit * (1 + effectiveRate(item) / 100)
      : item.cost_per_unit;
  const incVatCost = (item: StockItem) =>
    item.cost_per_unit * (1 + effectiveRate(item) / 100);

  // Sort by base values: quantity/cost are always stored in base units, so order
  // stays stable even when individual rows display at different packaging levels.
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
    if (sortKey === 'quantity') return (a.quantity - b.quantity) * dir;
    return (incVatCost(a) - incVatCost(b)) * dir;
  });

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

  const handleBulkVat = async () => {
    if (selected.size === 0) return;
    await batchUpdateStockVat(rid, { item_ids: Array.from(selected), vat_rate_override: bulkVatValue });
    setSelected(new Set());
    setBulkVatModal(false);
    setBulkVatValue(null);
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
    <div className={`space-y-6 max-w-5xl mx-auto ${selected.size > 0 ? 'pb-24' : ''}`}>
      {/* Filters + actions row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !pl-10 text-sm h-11 w-full rounded-full"
          />
        </div>

        {/* Category filter (opens multi-select drawer) */}
        <button
          type="button"
          onClick={() => openFiltersDrawer('category')}
          className="flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
        >
          {t('category')}{' '}
          <span className="font-semibold text-fg-primary">
            {selectedCategories.size === 0 ? t('all') : `${selectedCategories.size}`}
          </span>
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        {/* All Filters (navigable drawer) */}
        <button
          type="button"
          onClick={() => openFiltersDrawer('index')}
          className="flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
        >
          {t('allFilters')}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        {/* HT/TTC display toggle. Controls both the table price cells AND the
            form's entry mode on next open, so the two stay aligned. */}
        <button
          type="button"
          onClick={toggleVatDisplay}
          className="h-11 px-4 min-w-[4.5rem] rounded-full border border-[var(--divider)] bg-[var(--surface)] text-xs font-semibold tracking-wider uppercase text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
          title={`${t('exVat')} / ${t('incVat')}`}
        >
          {vatDisplayMode === 'inc' ? t('incVat') : t('exVat')}
        </button>

        {/* Actions dropdown */}
        <ActionsDropdown
          actions={[
            {
              label: t('importDelivery'),
              onClick: () => { setImportDraftId(undefined); setImportModal(true); },
              icon: <SparklesIcon className="w-4 h-4" />,
            },
            {
              label: t('refresh'),
              onClick: reload,
              icon: <ArrowPathIcon className="w-4 h-4" />,
            },
          ]}
        />

        {/* Create item */}
        <button
          onClick={() => setItemModal({ open: true })}
          className="btn-primary rounded-full px-5 py-2 flex items-center gap-1.5"
        >
          <PlusIcon className="w-4 h-4" />
          {t('addItem')}
        </button>
      </div>

      {/* Bulk action bar — fixed to viewport bottom so it stays reachable while
          scrolling through long stock lists. Bottom padding on the wrapping
          <div> reserves space so the last row is never covered. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none px-4 pb-4">
          <div className="max-w-5xl mx-auto pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 shadow-lg backdrop-blur-md">
            <span className="text-sm font-medium text-brand-500">
              {t('itemsSelected').replace('{count}', String(selected.size))}
            </span>
            <div className="flex-1" />
            <button onClick={() => setBulkCategoryModal(true)} className="btn-secondary text-xs py-1.5 px-3 rounded-full">
              {t('updateCategory')}
            </button>
            <button onClick={() => { setBulkVatValue(null); setBulkVatModal(true); }} className="btn-secondary text-xs py-1.5 px-3 rounded-full">
              {t('updateVat')}
            </button>
            <button onClick={handleBulkDelete} className="text-xs py-1.5 px-3 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors font-medium">
              {t('delete')} ({selected.size})
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-fg-secondary hover:text-fg-primary">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Items table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <p className="text-base text-fg-secondary text-center max-w-md">
            {items.length === 0 ? t('addFirstStockItem') : t('tryAdjustingFilters')}
          </p>
          {items.length === 0 && (
            <button onClick={() => setItemModal({ open: true })} className="btn-primary mt-2 rounded-full">
              {t('addItem')}
            </button>
          )}
        </div>
      ) : (
        <div>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider">
                <th className="py-3 px-2 font-medium w-10 sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-[var(--divider)]" />
                </th>
                <th
                  aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-fg-primary transition-colors"
                  >
                    {t('item')}
                    {sortKey === 'name' && (
                      sortDir === 'asc'
                        ? <ChevronUpIcon className="w-3.5 h-3.5" />
                        : <ChevronDownIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('category')}</th>
                <th
                  aria-sort={sortKey === 'quantity' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-2 font-medium text-right sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('quantity')}
                    className="inline-flex items-center gap-1 hover:text-fg-primary transition-colors ml-auto"
                  >
                    {t('quantity')}
                    {sortKey === 'quantity' && (
                      sortDir === 'asc'
                        ? <ChevronUpIcon className="w-3.5 h-3.5" />
                        : <ChevronDownIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th
                  aria-sort={sortKey === 'price' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-2 font-medium text-right sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('price')}
                    className="inline-flex items-center gap-1 hover:text-fg-primary transition-colors ml-auto"
                  >
                    {t('price')}
                    {sortKey === 'price' && (
                      sortDir === 'asc'
                        ? <ChevronUpIcon className="w-3.5 h-3.5" />
                        : <ChevronDownIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('supplier')}</th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('status')}</th>
                <th className="py-3 px-2 font-medium w-10 sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold;
                const catColor = categories.find((c) => c.name === item.category)?.color;
                const pkg = getPackaging(item);
                const level = getItemLevel(item);
                const popoverOpen = levelPopover === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-[var(--surface-subtle)] transition-colors [&>td]:border-b [&>td]:border-[var(--divider)] ${selected.has(item.id) ? 'bg-brand-500/5' : ''}`}
                  >
                    <td className="py-3.5 px-2 w-10">
                      <input type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-[var(--divider)]" />
                    </td>
                    <td className="py-3.5 px-2">
                      <button
                        type="button"
                        onClick={() => setItemModal({ open: true, editing: item })}
                        className="flex items-center gap-3 text-left hover:text-brand-500 transition-colors"
                      >
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                            <PhotoIcon className="w-5 h-5 text-fg-tertiary" />
                          </div>
                        )}
                        <span className="font-medium text-fg-primary">{item.name}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-2">
                      <div className="flex items-center gap-2">
                        {catColor && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catColor }} />}
                        <span className="text-fg-secondary">{item.category || '—'}</span>
                      </div>
                    </td>
                    <td
                      className="py-3.5 px-2 text-right font-mono text-fg-primary cursor-pointer hover:bg-[var(--surface-subtle)] relative"
                      onClick={() => setLevelPopover(item.id)}
                      title={t('displayAs') || 'Display as'}
                    >
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          {formatQuantityAtLevel(item, level, t)}
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
                                    <div className="font-medium text-sm truncate">{formatQuantityAtLevel(item, lvl, t)}</div>
                                    <div className="font-mono text-xs text-fg-secondary truncate">
                                      {formatUnitPriceAtLevel(item, lvl, adjustedCost(item), t)}
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
                      className="py-3.5 px-2 text-right font-mono text-fg-primary cursor-pointer hover:bg-[var(--surface-subtle)]"
                      onClick={() => setLevelPopover(item.id)}
                      title={t('displayAs') || 'Display as'}
                    >
                      {formatUnitPriceAtLevel(item, level, adjustedCost(item), t)}
                      {item.vat_rate_override != null && item.vat_rate_override !== vatRate && (
                        <span className="ml-1.5 text-[10px] tracking-wider text-fg-tertiary">
                          {item.vat_rate_override}% TVA
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-2 text-fg-secondary">{item.supplier || '—'}</td>
                    <td className="py-3.5 px-2">
                      {isLow ? (
                        <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                          <ExclamationTriangleIcon className="w-4 h-4" /> {t('lowStock')}
                        </span>
                      ) : (
                        <span className="text-xs text-status-ready font-medium">{t('ok')}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-2">
                      <RowActionsMenu
                        actions={[
                          { label: t('stockHistory'), onClick: () => setHistoryItem(item), icon: <ClockIcon className="w-4 h-4" /> },
                          { label: t('receiveStock'), onClick: () => setTxModal({ open: true, item, type: 'receive' }), icon: <ArrowDownTrayIcon className="w-4 h-4" /> },
                          { label: t('edit'), onClick: () => setItemModal({ open: true, editing: item }), icon: <PencilIcon className="w-4 h-4" /> },
                          { label: t('delete'), onClick: () => handleDelete(item.id), variant: 'danger', icon: <TrashIcon className="w-4 h-4" /> },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Item Modal */}
      {itemModal.open && (
        <StockItemModal
          rid={rid}
          editing={itemModal.editing}
          categories={categories.map((c) => c.name)}
          suppliers={suppliers}
          vatRate={vatRate}
          vatDisplayMode={vatDisplayMode}
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

      {/* Bulk Update VAT Modal — reuses VatRateSelect for the same default/exempt/custom
          semantics as the per-item editor. `null` clears the override; a value sets it. */}
      {bulkVatModal && (
        <Modal title={t('updateVat')} onClose={() => setBulkVatModal(false)}>
          <p className="text-sm text-fg-secondary mb-3">
            {t('bulkVatDesc').replace('{count}', String(selected.size))}
          </p>
          <div className="mb-4">
            <VatRateSelect
              value={bulkVatValue}
              onChange={setBulkVatValue}
              restaurantRate={vatRate}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkVatModal(false)} className="btn-secondary text-sm">{t('cancel')}</button>
            <button onClick={handleBulkVat} className="btn-primary text-sm">{t('apply')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Stock Item Create/Edit Modal ───────────────────────────────────────────

function StockItemModal({ rid, editing, categories, suppliers, vatRate, vatDisplayMode, onClose, onSaved }: {
  rid: number; editing?: StockItem; categories: string[]; suppliers: Supplier[]; vatRate: number; vatDisplayMode: 'ex' | 'inc'; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();

  // Shared quantity/packaging/price form state
  const [qty, setQty] = useState<StockInput>(() =>
    editing ? serverToStockInput(editing) : defaultStockInput(),
  );

  // Item-level fields (not part of the quantity form)
  const [name, setName] = useState(editing?.name ?? '');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [aliases, setAliases] = useState<StockItemAliasInput[]>(
    () => (editing?.aliases ?? []).map((a) => ({ alias: a.alias, language: a.language })),
  );
  const [supplier, setSupplier] = useState(editing?.supplier ?? '');
  const [supplierId, setSupplierId] = useState<number | null>(editing?.supplier_id ?? null);
  const [category, setCategory] = useState(editing?.category ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [reorder, setReorder] = useState(editing?.reorder_threshold ?? 0);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  // Per-item VAT rate. `null` = use restaurant default; `0` = exempt
  // (e.g. Israeli fruits & vegetables); any value = custom rate.
  const [vatRateOverride, setVatRateOverride] = useState<number | null>(
    editing?.vat_rate_override ?? null,
  );

  // Image upload state
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  const handleImagePick = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (editing) {
      // Upload immediately for existing items
      setUploading(true);
      try {
        const url = await uploadStockItemImage(rid, editing.id, file);
        setImageUrl(url);
        await updateStockItem(rid, editing.id, { image_url: url });
      } catch (err: any) {
        alert(err.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    } else {
      // Queue for upload after create
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingFile(file);
      setPendingPreview(URL.createObjectURL(file));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImagePick(file);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload: StockItemInput = {
        name,
        ...stockInputToServer(qty),
        reorder_threshold: reorder,
        supplier,
        supplier_id: supplierId ?? null,
        category, notes,
        sku: sku.trim(),
        aliases: aliases
          .map((a) => ({ alias: a.alias.trim(), language: a.language.trim() }))
          .filter((a) => a.alias !== ''),
        is_active: isActive,
        vat_rate_override: vatRateOverride,
      };
      if (editing) {
        await updateStockItem(rid, editing.id, payload);
      } else {
        const created = await createStockItem(rid, payload);
        if (pendingFile && created?.id) {
          try {
            const url = await uploadStockItemImage(rid, created.id, pendingFile);
            await updateStockItem(rid, created.id, { image_url: url });
          } catch (err: any) {
            alert(err.message || 'Image upload failed');
          }
        }
      }
      onSaved(); onClose();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const displayImage = imageUrl || pendingPreview;

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

      <FormSection title={t('sku')}>
        <input
          type="text"
          className="input text-sm w-full"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder={t('sku')}
        />
        <p className="text-xs text-fg-tertiary mt-1">{t('skuHelp')}</p>
      </FormSection>

      <FormSection title={t('billNames')}>
        <p className="text-xs text-fg-tertiary mb-2">{t('billNamesHelp')}</p>
        <div className="space-y-2">
          {aliases.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                dir="auto"
                className="input text-sm flex-1 min-w-0"
                value={a.alias}
                onChange={(e) => setAliases((prev) => prev.map((x, idx) => idx === i ? { ...x, alias: e.target.value } : x))}
                placeholder={t('originalName')}
              />
              <select
                className="input text-sm w-20 shrink-0"
                value={a.language}
                onChange={(e) => setAliases((prev) => prev.map((x, idx) => idx === i ? { ...x, language: e.target.value } : x))}
                title={t('language')}
              >
                <option value="">{t('languageAuto')}</option>
                <option value="he">he</option>
                <option value="ar">ar</option>
                <option value="en">en</option>
                <option value="fr">fr</option>
                <option value="es">es</option>
                <option value="ru">ru</option>
              </select>
              <button
                type="button"
                onClick={() => setAliases((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-fg-tertiary hover:text-red-500 shrink-0 p-1"
                aria-label={t('remove')}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAliases((prev) => [...prev, { alias: '', language: '' }])}
            className="btn-secondary text-xs w-full"
          >
            + {t('addBillName')}
          </button>
        </div>
      </FormSection>

      <FormSection title={t('supplier')}>
        <SearchableListField
          mode="single"
          allowCustom
          placeholder={t('supplier')}
          options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
          value={supplierId != null ? String(supplierId) : supplier}
          onChange={(next) => {
            const picked = suppliers.find((s) => String(s.id) === next);
            if (picked) {
              setSupplierId(picked.id);
              setSupplier(picked.name);
            } else {
              setSupplierId(null);
              setSupplier(next);
            }
          }}
        />
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

          {/* Image upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImagePick(file);
              e.target.value = '';
            }}
          />
          {displayImage ? (
            <div
              className="relative rounded-xl overflow-hidden cursor-pointer group border-2 border-[var(--divider)] bg-[var(--surface-muted,rgba(0,0,0,0.2))]"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayImage} alt={name} className="w-full h-52 object-contain" />
              {uploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-base font-medium">
                  {t('dropImagesHere')}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-[var(--divider)] rounded-xl p-10 flex flex-col items-center gap-3 text-fg-tertiary cursor-pointer hover:border-brand-500 hover:text-brand-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {uploading ? (
                <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
              ) : (
                <>
                  <ArrowUpTrayIcon className="w-10 h-10" />
                  <p className="text-base text-center">
                    {t('dropImagesHere')}, <span className="text-brand-500 font-medium underline hover:text-brand-600">{t('browse')}</span>
                  </p>
                </>
              )}
            </div>
          )}

          <StockQuantityForm
            value={qty}
            onChange={setQty}
            vatRate={vatRate}
            vatRateOverride={vatRateOverride}
            onVatRateChange={setVatRateOverride}
            vatDisplayMode={vatDisplayMode}
          />

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
