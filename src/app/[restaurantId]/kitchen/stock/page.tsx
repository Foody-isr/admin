'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  listStockItems, createStockItem, updateStockItem, deleteStockItem,
  getStockCategories, createStockTransaction, listStockTransactions,
  batchUpdateStockCategory, batchUpdateStockVat, getRestaurantSettings, uploadStockItemImage,
  listSuppliers,
  createStockCategory, updateStockCategory,
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
import { NumberInput } from '@/components/ui/NumberInput';
import StockFiltersDrawer, { FilterView } from '@/components/stock/StockFiltersDrawer';
import Modal from '@/components/Modal';
import CategoryDrawer from '@/components/menu/CategoryDrawer';
import FormModal from '@/components/FormModal';
import FormSection from '@/components/FormSection';
import FormField from '@/components/FormField';
import StatusPill from '@/components/StatusPill';
import SearchableListField from '@/components/SearchableListField';
import { FullScreenEditor, EditorSectionHead, Badge, Field, Input, NumberField, Textarea } from '@/components/ds';
import { Image as LucideImageIcon, Camera } from 'lucide-react';
import {
  SearchIcon, PlusIcon, DownloadIcon,
  AlertTriangleIcon, TrashIcon, PencilIcon,
  ArrowUpIcon, ArrowDownIcon, ArrowRightLeftIcon,
  SparklesIcon, ClockIcon, RefreshCwIcon,
  ChevronDownIcon, ChevronUpIcon, ImageIcon, UploadIcon,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  SortableHeadCell,
  DataTableHeadSpacerCell,
  DataTableSelectAllCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  DataTableSelectCell,
} from '@/components/data-table';
import { Button, Kpi, PageHead } from '@/components/ds';
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
  type SortKey = 'name' | 'quantity' | 'price' | 'total';
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
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [filtersDrawer, setFiltersDrawer] = useState<{ open: boolean; view: FilterView }>({
    open: false,
    view: 'index',
  });

  // Mirrors the server's low-stock count (stock/service.go:GetLowStockCount):
  // item is low when out of stock OR at/below its reorder threshold. Keep this
  // in sync — the sidebar badge uses the server count and they must agree.
  const stockStatusOf = useCallback(
    (item: StockItem): 'low' | 'ok' =>
      item.is_active &&
      (item.quantity <= 0 ||
        (item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold))
        ? 'low'
        : 'ok',
    [],
  );

  const openFiltersDrawer = (view: FilterView) => setFiltersDrawer({ open: true, view });
  const closeFiltersDrawer = () => setFiltersDrawer((prev) => ({ ...prev, open: false }));

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Unified category drawer — same component Articles uses. Serves both
  // "filter by category" (from the "Catégorie · …" pill) and "bulk assign
  // category" (from the selection toolbar) via its `mode` prop.
  const [categoryDrawer, setCategoryDrawer] = useState<{
    open: boolean;
    mode: 'filter' | 'bulk-assign';
  }>({ open: false, mode: 'filter' });
  const [bulkProcessing, setBulkProcessing] = useState(false);
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

  const activeFilterCount = selectedCategories.size + selectedStatuses.size;

  // Derived
  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !selectedCategories.has(item.category)) return false;
    if (selectedStatuses.size > 0 && !selectedStatuses.has(stockStatusOf(item))) return false;
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
    if (sortKey === 'total') return (a.quantity * incVatCost(a) - b.quantity * incVatCost(b)) * dir;
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

  const handleBulkCategory = async (name: string) => {
    if (selected.size === 0 || !name) return;
    setBulkProcessing(true);
    try {
      await batchUpdateStockCategory(rid, { item_ids: Array.from(selected), category: name });
      setSelected(new Set());
      setCategoryDrawer({ open: false, mode: 'filter' });
      reload();
    } finally {
      setBulkProcessing(false);
    }
  };

  // Single callback the drawer calls in both filter and bulk-assign modes.
  const handleCategorySelect = (name: string | null) => {
    if (categoryDrawer.mode === 'bulk-assign') {
      if (name) handleBulkCategory(name);
      return;
    }
    if (name === null) setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
    setCategoryDrawer({ open: false, mode: 'filter' });
  };

  const handleBulkVat = async () => {
    if (selected.size === 0) return;
    await batchUpdateStockVat(rid, { item_ids: Array.from(selected), vat_rate_override: bulkVatValue });
    setSelected(new Set());
    setBulkVatModal(false);
    setBulkVatValue(null);
    reload();
  };

  const [showKpis, setShowKpis] = useState(true);

  const filterByStatus = (status: 'low' | 'ok' | null) => {
    setSelectedCategories(new Set());
    setSelectedStatuses(status ? new Set([status]) : new Set());
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Figma KPIs — computed from real stock data
  const stockLow = items.filter((i) => stockStatusOf(i) === 'low').length;
  const stockOk = items.length - stockLow;
  const totalValue = items.reduce(
    (sum, i) => sum + (i.quantity ?? 0) * (i.cost_per_unit ?? 0),
    0,
  );

  // Figma pill categories: Tous + real categories
  const pillCategories = ['Tous', ...categories.map((c) => c.name)];
  const activePill =
    selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : 'Tous';
  const selectPill = (name: string) => {
    if (name === 'Tous') setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
  };

  return (
    <div className="flex flex-col">
      <PageHead
        title={t('stock') || 'Stock'}
        desc={t('stockSubtitle') || "Gérez votre inventaire d'ingrédients"}
        actions={
          <>
            <Button
              variant="ghost"
              size="md"
              icon
              onClick={() => setShowKpis((v) => !v)}
              aria-label="Toggle KPIs"
              title={showKpis ? (t('hideKpis') || 'Masquer les KPIs') : (t('showKpis') || 'Afficher les KPIs')}
              className="hidden md:inline-flex"
            >
              {showKpis ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setImportModal(true)}
            >
              <DownloadIcon />
              {t('importDelivery') || 'Importer'}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => setItemModal({ open: true })}
            >
              <PlusIcon />
              {t('addItem')}
            </Button>
          </>
        }
      />
      <header className="mb-[var(--s-4)]">
        <div className="hidden" />

        {/* KPIs — desktop only (mobile keeps the table primary) */}
        {showKpis && (
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-6">
            <Kpi
              label={t('itemsInStock') || 'Articles en stock'}
              value={items.length}
              sub={`${categories.length} ${t('categoriesCount') || 'catégories'}`}
              onClick={() => filterByStatus(null)}
            />
            <Kpi
              label={t('statusOk') || 'Statut OK'}
              value={stockOk}
              sub={
                items.length > 0
                  ? `${((stockOk / items.length) * 100).toFixed(0)}% ${t('ofTotal') || 'du total'}`
                  : '—'
              }
              onClick={() => filterByStatus('ok')}
            />
            <Kpi
              label={t('totalValue') || 'Valeur totale'}
              value={
                <>
                  ₪{Math.round(totalValue).toLocaleString()}
                  <span className="text-fs-lg text-[var(--fg-muted)] font-medium">
                    .{String(Math.round((totalValue % 1) * 100)).padStart(2, '0')}
                  </span>
                </>
              }
              sub={vatDisplayMode === 'inc' ? (t('incVat') || 'TTC') : (t('exVat') || 'HT')}
            />
            <Kpi
              tone={stockLow > 0 ? 'danger' : 'default'}
              label={t('stockAlerts') || 'Alertes stock'}
              value={stockLow}
              sub={stockLow > 0 ? (t('toOrder') || 'À commander') : 'OK'}
              onClick={() => filterByStatus('low')}
            />
          </div>
        )}

        {/* Bulk toolbar — Figma-style orange banner when rows are selected. */}
        {selected.size > 0 && (
          <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-orange-900 dark:text-orange-300">
                {t('itemsSelected').replace('{count}', String(selected.size))}
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-orange-700 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-200 text-sm font-medium"
              >
                {t('deselectAll') || 'Tout désélectionner'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCategoryDrawer({ open: true, mode: 'bulk-assign' })}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                {t('updateCategory')}
              </button>
              <button
                onClick={() => { setBulkVatValue(null); setBulkVatModal(true); }}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                {t('updateVat')}
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400"
              >
                <TrashIcon className="w-4 h-4" />
                {t('delete')} ({selected.size})
              </button>
            </div>
          </div>
        )}

        {/* Search + filter pill-buttons row — matches Articles */}
        <div className="flex flex-wrap items-center gap-[var(--s-3)]">
          <div className="relative flex-1 min-w-[240px]">
            <SearchIcon className="w-4 h-4 absolute start-4 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-11 pe-3 h-11 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setCategoryDrawer({ open: true, mode: 'filter' })}
            className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors whitespace-nowrap"
          >
            <span className="text-[var(--fg-muted)]">{t('category')} ·</span>
            <span className="text-[var(--brand-500)] font-semibold">
              {selectedCategories.size === 0
                ? t('all')
                : selectedCategories.size === 1
                  ? Array.from(selectedCategories)[0]
                  : selectedCategories.size}
            </span>
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => openFiltersDrawer('index')}
            className={`inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 rounded-r-lg text-fs-sm font-medium transition-colors whitespace-nowrap ${
              activeFilterCount > 0
                ? 'bg-[var(--brand-500)]/10 border border-[var(--brand-500)] text-[var(--brand-500)] hover:bg-[var(--brand-500)]/15'
                : 'bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--fg)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {t('allFilters')}
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[var(--brand-500)] text-white text-fs-xs font-semibold tabular-nums">
                {activeFilterCount}
              </span>
            )}
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          <ActionsDropdown
            actions={[
              {
                label: vatDisplayMode === 'inc'
                  ? `${t('displayPrice')}: ${t('incVat')}`
                  : `${t('displayPrice')}: ${t('exVat')}`,
                onClick: toggleVatDisplay,
                icon: <ArrowRightLeftIcon className="w-4 h-4" />,
              },
              {
                label: t('importDelivery'),
                onClick: () => { setImportDraftId(undefined); setImportModal(true); },
                icon: <SparklesIcon className="w-4 h-4" />,
              },
              {
                label: t('refresh'),
                onClick: reload,
                icon: <RefreshCwIcon className="w-4 h-4" />,
              },
            ]}
          />
        </div>
      </header>

      {/* Category pills — rounded-r-lg rectangles with CAPS labels (matches Articles) */}
      {pillCategories.length > 1 && (
        <div className="mb-[var(--s-4)] flex flex-wrap gap-[var(--s-2)]">
          {pillCategories.map((name) => {
            const active = activePill === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => selectPill(name)}
                aria-pressed={active}
                className={`inline-flex items-center h-10 px-[var(--s-4)] rounded-r-lg text-fs-sm font-semibold uppercase tracking-[.02em] transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--brand-500)] text-white shadow-1'
                    : 'bg-[var(--surface-2)] text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* Table wrapper — horizontal scroll when columns overflow */}
      <div className="overflow-x-auto">

      {/* Table — Figma App.tsx:600 (stock variant) */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <ImageIcon className="w-12 h-12 text-neutral-400 dark:text-neutral-500" />
          <p className="text-base text-neutral-600 dark:text-neutral-400 text-center max-w-md">
            {items.length === 0 ? t('addFirstStockItem') : t('tryAdjustingFilters')}
          </p>
          {items.length === 0 && (
            <button
              onClick={() => setItemModal({ open: true })}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 flex items-center gap-2 font-medium"
            >
              {t('addItem')}
            </button>
          )}
        </div>
      ) : (
        <DataTable>
            <DataTableHead>
                <DataTableSelectAllCell
                  checked={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                  onCheckedChange={toggleSelectAll}
                />
                <SortableHeadCell
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'name')}
                >
                  {t('item') || 'Article'}
                </SortableHeadCell>
                <DataTableHeadCell>{t('category') || 'Catégorie'}</DataTableHeadCell>
                <SortableHeadCell
                  sortKey="quantity"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'quantity')}
                >
                  {t('quantity') || 'Quantité'}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="price"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'price')}
                >
                  {t('unitPrice') || 'Prix unitaire'}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="total"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'total')}
                >
                  {t('totalValue') || 'Valeur totale'}
                </SortableHeadCell>
                <DataTableHeadCell>{t('supplier') || 'Fournisseur'}</DataTableHeadCell>
                <DataTableHeadCell>{t('status') || 'Statut'}</DataTableHeadCell>
                <DataTableHeadSpacerCell />
            </DataTableHead>
            <DataTableBody>
              {sorted.map((item, index) => {
                const isLow = stockStatusOf(item) === 'low';
                const catColor = categories.find((c) => c.name === item.category)?.color;
                const pkg = getPackaging(item);
                const level = getItemLevel(item);
                const popoverOpen = levelPopover === item.id;
                const lineValue = item.quantity * adjustedCost(item);
                return (
                  <DataTableRow key={item.id} index={index}>
                    <DataTableSelectCell
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                    <DataTableCell mobilePrimary>
                      <button
                        type="button"
                        onClick={() => setItemModal({ open: true, editing: item })}
                        className="flex items-center gap-3 text-left hover:text-orange-500 transition-colors"
                      >
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt=""
                            className="size-12 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="size-12 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-5 h-5 text-orange-600 dark:text-orange-200" />
                          </div>
                        )}
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {item.name}
                        </span>
                      </button>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('category') || 'Catégorie'}>
                      <span className="inline-flex items-center gap-[var(--s-2)] h-[22px] px-[var(--s-2)] bg-[var(--surface-2)] text-[var(--fg-muted)] rounded-r-sm text-fs-xs font-semibold uppercase tracking-[.02em] whitespace-nowrap">
                        {catColor && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: catColor }}
                          />
                        )}
                        {item.category || '—'}
                      </span>
                    </DataTableCell>
                    <DataTableCell
                      className="relative cursor-pointer hover:text-orange-500"
                      onClick={() => setLevelPopover(item.id)}
                      title={t('displayAs') || 'Display as'}
                      mobileLabel={t('quantity') || 'Quantité'}
                    >
                      <span className="inline-flex items-center gap-1.5 font-medium text-neutral-900 dark:text-white">
                        {formatQuantityAtLevel(item, level, t)}
                        <ChevronDownIcon className="w-3.5 h-3.5 text-neutral-400" />
                      </span>
                      {popoverOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLevelPopover(null);
                            }}
                          />
                          <div
                            className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 p-1 text-left bg-white dark:bg-[#1a1a1a]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                              {t('displayAs') || 'Display as'}
                            </div>
                            {pkg.levels.map((lvl) => (
                              <button
                                key={lvl}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectItemLevel(item.id, lvl);
                                }}
                                className={`w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 ${
                                  lvl === level
                                    ? 'bg-orange-500/10 text-orange-500'
                                    : 'text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-[#222222]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">
                                    {formatQuantityAtLevel(item, lvl, t)}
                                  </div>
                                  <div className="font-mono text-xs text-neutral-500 dark:text-neutral-400 truncate">
                                    {formatUnitPriceAtLevel(item, lvl, adjustedCost(item), t)}
                                  </div>
                                </div>
                                {lvl === pkg.defaultLevel && pkg.levels.length > 1 && (
                                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 flex-shrink-0">
                                    {t('default') || 'default'}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('unitPrice') || 'Prix unitaire'}>
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatUnitPriceAtLevel(item, level, adjustedCost(item), t)}
                        {item.vat_rate_override != null && item.vat_rate_override !== vatRate && (
                          <span className="ml-1.5 text-[10px] tracking-wider text-neutral-400">
                            {item.vat_rate_override}% TVA
                          </span>
                        )}
                      </span>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('totalValue') || 'Valeur totale'}>
                      <span className="font-semibold text-neutral-900 dark:text-white">
                        {lineValue.toFixed(2)} ₪
                      </span>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('supplier') || 'Fournisseur'}>
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {item.supplier || '—'}
                      </span>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('status') || 'Statut'}>
                      {isLow ? (
                        <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-fs-xs font-semibold whitespace-nowrap bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                          {t('lowStock') || 'Bas'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center h-7 px-2.5 rounded-md text-fs-xs font-semibold whitespace-nowrap bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          OK
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <RowActionsMenu
                        actions={[
                          { label: t('stockHistory'), onClick: () => setHistoryItem(item), icon: <ClockIcon className="w-4 h-4" /> },
                          { label: t('receiveStock'), onClick: () => setTxModal({ open: true, item, type: 'receive' }), icon: <DownloadIcon className="w-4 h-4" /> },
                          { label: t('edit'), onClick: () => setItemModal({ open: true, editing: item }), icon: <PencilIcon className="w-4 h-4" /> },
                          { label: t('delete'), onClick: () => handleDelete(item.id), variant: 'danger', icon: <TrashIcon className="w-4 h-4" /> },
                        ]}
                      />
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
        </DataTable>
      )}

      {/* Pagination — Figma App.tsx:800 */}
      {sorted.length > 0 && (
        <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-neutral-600 dark:text-neutral-400">
            {sorted.length} article{sorted.length > 1 ? 's' : ''} {t('atTotal') || 'au total'}
          </p>
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

      {/* Stock Filters Drawer (nested: index → category | status) */}
      <StockFiltersDrawer
        open={filtersDrawer.open}
        initialView={filtersDrawer.view}
        onClose={closeFiltersDrawer}
        categories={categories}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
        statuses={[
          { value: 'low', label: t('lowStock') || 'Stock bas', color: '#ef4444' },
          { value: 'ok', label: t('statusOk') || 'OK', color: '#10b981' },
        ]}
        selectedStatuses={selectedStatuses}
        onStatusChange={setSelectedStatuses}
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

      {/* Category drawer — dual-mode (filter | bulk-assign), same as Articles.
          Create & edit use the stock_categories metadata table. */}
      <CategoryDrawer
        open={categoryDrawer.open}
        mode={categoryDrawer.mode}
        onClose={() => setCategoryDrawer({ open: false, mode: 'filter' })}
        categories={categories.map((c) => ({
          name: c.name,
          count: items.filter((i) => i.category === c.name).length,
        }))}
        currentCategory={
          selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ''
        }
        onSelect={handleCategorySelect}
        selectionCount={selected.size}
        onCreateCategory={async ({ name }) => {
          await createStockCategory(rid, { name });
          const fresh = await getStockCategories(rid);
          setCategories(fresh);
        }}
        onEditCategory={async (oldName, patch) => {
          const cat = categories.find((c) => c.name === oldName);
          if (!cat) return;
          // If the category only exists as a string on items (no metadata
          // row yet), upsert it first so we have an id to rename.
          // `createStockCategory` is idempotent by name.
          const ensured = cat.id > 0 ? cat : await createStockCategory(rid, { name: oldName });
          if (patch.name && patch.name !== oldName) {
            await updateStockCategory(rid, ensured.id, { name: patch.name });
          }
          const [fresh, items2] = await Promise.all([
            getStockCategories(rid),
            listStockItems(rid),
          ]);
          setCategories(fresh);
          setItems(items2);
        }}
        processing={bulkProcessing}
      />

      {/* Bulk Update VAT Modal — reuses VatRateSelect for the same default/exempt/custom
          semantics as the per-item editor. `null` clears the override; a value sets it. */}
      {bulkVatModal && (
        <Modal title={t('updateVat')} onClose={() => setBulkVatModal(false)}>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
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
      </div>{/* /px-8 py-6 wrapper */}
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

  // Stock level indicator for the rail
  const unitValue = (editing?.quantity ?? 0) * (editing?.cost_per_unit ?? 0);
  const levelStatus: 'ok' | 'warning' | 'danger' =
    reorder > 0 && (editing?.quantity ?? 0) === 0
      ? 'danger'
      : reorder > 0 && (editing?.quantity ?? 0) < reorder
      ? 'warning'
      : 'ok';

  const rail = (
    <>
      {/* Product image tile */}
      <div className="relative">
        <div
          className="w-full aspect-square rounded-r-lg overflow-hidden cursor-pointer group grid place-items-center bg-[var(--surface-2)] border border-[var(--line)]"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {displayImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayImage} alt={name} className="w-full h-full object-cover" />
          ) : (
            <LucideImageIcon className="w-12 h-12 text-[var(--fg-subtle)]" />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/60 grid place-items-center">
              <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
            </div>
          )}
        </div>
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
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute bottom-2 end-2 w-8 h-8 rounded-r-sm grid place-items-center text-white"
          style={{ background: 'rgba(0,0,0,.6)' }}
          aria-label={t('editImage') || 'Modifier'}
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
        <div className="absolute top-2 start-2">
          <Badge tone={isActive ? 'success' : 'neutral'} dot>
            {isActive ? t('active') : t('inactive')}
          </Badge>
        </div>
      </div>

      {/* Name summary */}
      <div className="mt-[var(--s-4)]">
        <div className="text-fs-xl font-semibold -tracking-[0.01em] text-[var(--fg)]">
          {name || (t('nameLabel') || 'Nom de l\'article')}
        </div>
        <div className="flex items-center gap-[var(--s-2)] mt-1.5">
          <span className="font-mono tabular-nums text-[var(--brand-500)] font-semibold">
            ₪{(editing?.cost_per_unit ?? 0).toFixed(2)}
          </span>
          <span className="text-fs-xs text-[var(--fg-subtle)]">/ {editing?.unit ?? (qty.type === 'simple' ? qty.unit : 'unit')}</span>
          {category && (
            <Badge tone="neutral" className="ms-auto">
              {category.toUpperCase()}
            </Badge>
          )}
        </div>
      </div>

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Stock state */}
      <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-3)]">
        {t('stockState') || 'État du stock'}
      </div>
      <div className="flex flex-col gap-[var(--s-2)]">
        <div className="flex items-center justify-between">
          <span className="text-fs-sm text-[var(--fg-muted)]">{t('quantity') || 'Quantité'}</span>
          <span className="font-mono tabular-nums text-fs-sm">
            {(editing?.quantity ?? 0).toFixed(2)} {editing?.unit ?? (qty.type === 'simple' ? qty.unit : 'unit')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-fs-sm text-[var(--fg-muted)]">{t('value') || 'Valeur'}</span>
          <span className="font-mono tabular-nums text-fs-sm">₪{unitValue.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-fs-sm text-[var(--fg-muted)]">{t('level') || 'Niveau'}</span>
          <Badge
            tone={levelStatus === 'ok' ? 'success' : levelStatus === 'warning' ? 'warning' : 'danger'}
            dot
          >
            {levelStatus === 'ok' ? 'OK' : levelStatus === 'warning' ? (t('low') || 'Bas') : (t('empty') || 'Rupture')}
          </Badge>
        </div>
      </div>

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Status toggle */}
      <div className="flex items-center justify-between">
        <span className="text-fs-sm text-[var(--fg-muted)]">{t('status') || 'Statut'}</span>
        <StatusPill
          active={isActive}
          onToggle={() => setIsActive(!isActive)}
          activeLabel={t('active')}
          inactiveLabel={t('inactive')}
        />
      </div>

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Notes */}
      <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-2)]">
        {t('notes') || 'Notes'}
      </div>
      <Textarea
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('notes')}
        className="text-fs-sm"
      />
    </>
  );

  return (
    <FullScreenEditor
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={editing ? t('editStockItem') : t('addStockItem')}
      subtitle={editing ? `${t('editingItem') || 'Modification'} · ${editing.name}` : undefined}
      onSave={handleSubmit}
      saveLabel={editing ? t('update') : t('create')}
      saveDisabled={!name.trim() || saving}
      cancelLabel={t('cancel')}
      rail={rail}
    >
      <div className="max-w-3xl">
        <EditorSectionHead title={t('identityAndPurchase') || "Identité & achat"} />

        {/* Name */}
        <div className="mb-[var(--s-5)]">
          <Field label={t('nameLabel') || "Nom de l'article"}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('nameLabel') + ' *'}
              autoFocus
            />
          </Field>
        </div>

        {/* Classification */}
        <div className="mb-[var(--s-5)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)] mb-[var(--s-3)]">
            {t('classification') || 'Classification'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-3)]">
            <Field label={t('category') || 'Catégorie'}>
              <SearchableListField
                mode="single"
                allowCustom
                placeholder={t('category')}
                options={categories.map((c) => ({ value: c, label: c }))}
                value={category}
                onChange={setCategory}
              />
            </Field>
            <Field label={t('sku') || 'Référence / code-barres'} hint={t('skuHelp')}>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder={t('sku')}
                className="font-mono"
              />
            </Field>
            <Field label={t('defaultSupplier') || 'Fournisseur par défaut'}>
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
            </Field>
          </div>
        </div>

        {/* Purchase & price */}
        <div className="mb-[var(--s-5)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)] mb-1">
            {t('purchaseAndPrice') || 'Achat & prix'}
          </h3>
          <p className="text-fs-xs text-[var(--fg-muted)] mb-[var(--s-3)]">
            {t('purchaseAndPriceDesc') ||
              'Quantité achetée et prix unitaire de la dernière facture.'}
          </p>
          <StockQuantityForm
            value={qty}
            onChange={setQty}
            vatRate={vatRate}
            vatRateOverride={vatRateOverride}
            onVatRateChange={setVatRateOverride}
            vatDisplayMode={vatDisplayMode}
          />
        </div>

        {/* Reorder threshold */}
        <div className="mb-[var(--s-5)]">
          <Field
            label={t('reorderThreshold') || 'Seuil de réapprovisionnement'}
            hint={t('reorderThresholdHelp') || 'Alerte déclenchée quand le stock descend sous ce niveau.'}
          >
            <NumberField
              min={0}
              value={reorder}
              onChange={setReorder}
              className="max-w-[220px]"
            />
          </Field>
        </div>

        {/* Bill names (aliases) */}
        <div className="mb-[var(--s-5)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)] mb-1">
            {t('billNames') || 'Noms sur la facture'}
          </h3>
          <p className="text-fs-xs text-[var(--fg-muted)] mb-[var(--s-3)]">
            {t('billNamesHelp') ||
              'Noms sous lesquels cet article apparaît sur les factures de vos fournisseurs.'}
          </p>
          <div className="flex flex-col gap-[var(--s-2)]">
            {aliases.map((a, i) => (
              <div key={i} className="flex items-center gap-[var(--s-2)]">
                <Input
                  dir="auto"
                  value={a.alias}
                  onChange={(e) =>
                    setAliases((prev) => prev.map((x, idx) => (idx === i ? { ...x, alias: e.target.value } : x)))
                  }
                  placeholder={t('originalName')}
                  className="flex-1"
                />
                <select
                  className="h-9 px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm w-40"
                  value={a.language}
                  onChange={(e) =>
                    setAliases((prev) => prev.map((x, idx) => (idx === i ? { ...x, language: e.target.value } : x)))
                  }
                  title={t('language')}
                >
                  <option value="">{t('allSuppliers') || 'Tous fournisseurs'}</option>
                  <option value="he">he</option>
                  <option value="ar">ar</option>
                  <option value="en">en</option>
                  <option value="fr">fr</option>
                  <option value="es">es</option>
                  <option value="ru">ru</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setAliases((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="p-2 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                  aria-label={t('remove')}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAliases((prev) => [...prev, { alias: '', language: '' }])}
              className="self-start inline-flex items-center gap-[var(--s-2)] h-7 px-[var(--s-3)] rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] text-fs-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] transition-colors"
            >
              <PlusIcon className="w-3 h-3" />
              {t('addBillName') || 'Ajouter un nom'}
            </button>
          </div>
        </div>
      </div>
    </FullScreenEditor>
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
    { value: 'adjust', label: t('adjust'), icon: ArrowRightLeftIcon },
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
                type === opt.value ? 'border border-orange-500 text-orange-500 bg-orange-500/5' : 'border border-divider text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:text-white'
              }`}
            >
              <opt.icon className="w-4 h-4" />
              {opt.label}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">{t('quantityUnit').replace('{unit}', item.unit)}</label>
          <NumberInput min={0} required className="input w-full py-2 text-sm" value={qty} onChange={setQty} />
        </div>

        <div>
          <label className="text-xs text-neutral-600 dark:text-neutral-400 block mb-1">{t('notes')}</label>
          <input className="input w-full py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="text-xs text-neutral-600 dark:text-neutral-400">
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
        <div className="text-center py-10 text-neutral-600 dark:text-neutral-400 text-sm">{t('noTransactions')}</div>
      ) : (
        <div className="divide-y divide-[var(--divider)] max-h-[60vh] overflow-y-auto">
          {transactions.map(tx => {
            const isPositive = tx.quantity_delta > 0;
            const typeColor = TX_TYPE_COLORS[tx.type] || 'text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-[#1a1a1a]';
            return (
              <div key={tx.id} className="px-4 py-3 flex gap-3">
                <div className="flex-shrink-0 pt-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap ${typeColor}`}>
                    {t(tx.type) || tx.type}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900 dark:text-white break-words">{tx.notes || '—'}</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{formatDate(tx.created_at)} {formatTime(tx.created_at)}</p>
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
