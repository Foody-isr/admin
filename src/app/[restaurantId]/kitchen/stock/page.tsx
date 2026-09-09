'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  listStockItems, createStockItem, updateStockItem, deleteStockItem,
  getStockCategories, createStockTransaction, listStockTransactions,
  batchUpdateStockCategory, batchUpdateStockVat, getRestaurantSettings, uploadStockItemImage,
  listSuppliers,
  createStockCategory, updateStockCategory, deleteStockCategory,
  listCustomUnits, createCustomUnit,
  StockItem, StockCategory, StockItemInput, StockItemAliasInput, StockTransactionType, StockTransaction,
  Supplier, CustomUnit, UnitConversionInput,
} from '@/lib/api';
import VatRateSelect from '@/components/stock/VatRateSelect';
import DeliveryImportModal from './DeliveryImportModal';
import CsvImportModal from '@/components/import/CsvImportModal';
import StockQuantityForm, {
  StockInput,
  defaultStockInput,
  deriveTotals,
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
import { Image as LucideImageIcon, Camera, Sparkles } from 'lucide-react';
import IngredientIconPicker from '@/components/stock/IngredientIconPicker';
import StockKpiRow from '@/components/stock/StockKpiRow';
import {
  SearchIcon, PlusIcon, DownloadIcon,
  AlertTriangleIcon, TrashIcon, PencilIcon,
  ArrowUpIcon, ArrowDownIcon, ArrowRightLeftIcon,
  SparklesIcon, ClockIcon, RefreshCwIcon,
  ChevronDownIcon, ImageIcon, UploadIcon,
  RulerIcon, ListFilterIcon, XIcon, TagIcon, PercentIcon,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import { HorizontalScrollRail } from '@/components/common/HorizontalScrollRail';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  SortableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button, PageHead } from '@/components/ds';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
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
  const { money } = useCurrency();
  const { restaurantId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
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
  const [csvImportOpen, setCsvImportOpen] = useState(false);
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

  // Operational overview — computed from the complete inventory, independently
  // from the current filters so it remains a stable navigation aid.
  const stockLow = items.filter((i) => stockStatusOf(i) === 'low').length;
  const stockOk = items.length - stockLow;
  const totalValue = items.reduce(
    (sum, i) => sum + (i.quantity ?? 0) * adjustedCost(i),
    0,
  );

  // Pill categories: an "all" sentinel + real category names.
  const ALL_PILL = '__all__';
  const allLabel = t('all');
  const pillCategories = [ALL_PILL, ...categories.map((c) => c.name)];
  const activePill = selectedCategories.size === 0
    ? ALL_PILL
    : selectedCategories.size === 1
      ? Array.from(selectedCategories)[0]
      : null;
  const selectPill = (name: string) => {
    if (name === ALL_PILL) setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
  };
  const visibleStart = sorted.length > 0 ? 1 : 0;
  const visibleEnd = sorted.length;
  const resetFilters = () => {
    setSearch('');
    setSelectedCategories(new Set());
    setSelectedStatuses(new Set());
  };

  return (
    <div className="min-h-[calc(100dvh-var(--topbar-total-h)-64px)]">
      <div className="min-w-0 space-y-[var(--s-4)]">
        <PageHead
          title={t('stock') || 'Stock'}
          desc={`${items.length} ${t('articlesUnit')} · ${categories.length} ${t('categoriesCount')}`}
          className="mb-0 items-center"
          actions={
            canManage ? (
              <Button
                variant="primary"
                size="lg"
                icon
                onClick={() => setItemModal({ open: true })}
                aria-label={t('addItem')}
                title={t('addItem')}
                className="rounded-full text-white shadow-sm"
              >
                <PlusIcon className="!size-5" />
              </Button>
            ) : null
          }
        />

        <header>
          <StockKpiRow
            total={items.length}
            categoriesCount={categories.length}
            okCount={stockOk}
            lowCount={stockLow}
            totalValue={totalValue}
            vatDisplayMode={vatDisplayMode}
            onStatusChange={filterByStatus}
          />

          {canManage && selected.size > 0 && (
            <div className="mt-[var(--s-4)] flex flex-wrap items-center justify-between gap-4 rounded-r-md border border-[var(--brand-100)] bg-[var(--brand-50)] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-fs-sm font-semibold text-[var(--brand-700)]">
                  {t('itemsSelected').replace('{count}', String(selected.size))}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-fs-xs font-medium text-[var(--brand-600)] hover:text-[var(--brand-700)] focus-visible:outline-none focus-visible:shadow-ring"
                >
                  {t('deselectAll') || 'Tout désélectionner'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setCategoryDrawer({ open: true, mode: 'bulk-assign' })}
                  disabled={bulkProcessing}
                >
                  <TagIcon />
                  {t('updateCategory')}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => { setBulkVatValue(null); setBulkVatModal(true); }}
                  disabled={bulkProcessing}
                >
                  <PercentIcon />
                  {t('updateVat')}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleBulkDelete}
                  disabled={bulkProcessing}
                  className="text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
                >
                  <TrashIcon />
                  {t('delete')} ({selected.size})
                </Button>
              </div>
            </div>
          )}
        </header>

        {pillCategories.length > 0 && (
          <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[var(--line)]">
            <HorizontalScrollRail activeKey={activePill} edgeFlush>
              <div className="inline-flex items-center gap-5 pe-4">
                <span className="py-2.5 text-fs-xs font-medium text-[var(--fg-subtle)]">
                  {t('category')}
                </span>
                {pillCategories.map((name) => {
                  const active = activePill === name;
                  const label = name === ALL_PILL ? allLabel : name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => selectPill(name)}
                      aria-pressed={active}
                      data-rail-active={active ? '' : undefined}
                      className={`relative whitespace-nowrap py-2.5 text-fs-sm font-medium outline-none transition-colors focus-visible:shadow-ring ${
                        active
                          ? 'text-[var(--fg)] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[var(--brand-500)]'
                          : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </HorizontalScrollRail>
            <span className="hidden shrink-0 text-fs-xs text-[var(--fg-muted)] md:block">
              {t('showing')
                .replace('{start}', String(visibleStart))
                .replace('{end}', String(visibleEnd))
                .replace('{total}', String(sorted.length))}
            </span>
          </div>
        )}

        <div className="sticky top-[var(--topbar-total-h)] z-10 -mx-1 flex flex-wrap items-center gap-2 bg-[var(--bg)] px-1 py-2">
          <div className="relative w-full md:w-[300px]">
            <SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" />
            <input
              type="search"
              placeholder={t('search')}
              aria-label={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearch('');
              }}
              className="input h-11 w-full ps-10 pe-10 text-fs-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute end-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-ring"
                aria-label={t('clearAll')}
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => setCategoryDrawer({ open: true, mode: 'filter' })}
          >
            <span className="text-[var(--fg-muted)]">{t('category')}</span>
            <span className="max-w-40 truncate font-semibold text-[var(--brand-500)]">
              {selectedCategories.size === 0
                ? t('all')
                : selectedCategories.size === 1
                  ? Array.from(selectedCategories)[0]
                  : selectedCategories.size}
            </span>
            <ChevronDownIcon />
          </Button>

          <Button type="button" variant="secondary" size="lg" onClick={() => openFiltersDrawer('index')}>
            <ListFilterIcon />
            {t('allFilters')}
            <ChevronDownIcon />
          </Button>

          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" size="lg" onClick={resetFilters}>
              <ListFilterIcon />
              {t('ordersResetFiltersWithCount').replace('{n}', String(activeFilterCount))}
            </Button>
          )}

          <div className="ms-auto [&>button]:h-11 [&>button]:rounded-r-md [&>button]:border [&>button]:border-[var(--line-strong)] [&>button]:!bg-[var(--surface)] [&>button]:px-[var(--s-4)] [&>button]:text-fs-sm hover:[&>button]:!bg-[var(--surface-2)]">
            <ActionsDropdown
              actions={[
                {
                  label: vatDisplayMode === 'inc'
                    ? `${t('displayPrice')}: ${t('exVat')}`
                    : `${t('displayPrice')}: ${t('incVat')}`,
                  onClick: toggleVatDisplay,
                  icon: <ArrowRightLeftIcon className="w-4 h-4" />,
                },
                ...(canManage ? [
                  {
                    label: t('importDelivery'),
                    onClick: () => { setImportDraftId(undefined); setImportModal(true); },
                    icon: <SparklesIcon className="w-4 h-4" />,
                  },
                  {
                    label: t('importCsv'),
                    onClick: () => setCsvImportOpen(true),
                    icon: <UploadIcon className="w-4 h-4" />,
                  },
                ] : []),
                {
                  label: t('refresh'),
                  onClick: reload,
                  icon: <RefreshCwIcon className="w-4 h-4" />,
                },
              ]}
            />
          </div>
        </div>

        <div>

      {/* Table — Figma App.tsx:600 (stock variant) */}
      {sorted.length === 0 ? (
        <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] px-6 py-16 text-center shadow-1">
          <ImageIcon className="mx-auto size-10 text-[var(--fg-subtle)]" />
          <p className="mx-auto mt-3 max-w-md text-fs-sm text-[var(--fg-muted)]">
            {items.length === 0 ? t('addFirstStockItem') : t('tryAdjustingFilters')}
          </p>
          {items.length === 0 && canManage && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setItemModal({ open: true })}
              className="mt-5"
            >
              <PlusIcon />
              {t('addItem')}
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          className="md:max-h-[calc(100dvh-var(--topbar-total-h)-350px)] md:overflow-auto"
          data-density="compact"
        >
            <DataTableHead className="sticky top-0 z-[2]">
                <DataTableHeadSpacerCell className="bg-neutral-50 px-3 py-2 dark:bg-[#0a0a0a]">
                  <Checkbox
                  checked={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                  onCheckedChange={toggleSelectAll}
                  />
                </DataTableHeadSpacerCell>
                <SortableHeadCell
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'name')}
                  className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a] [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('item') || 'Article'}
                </SortableHeadCell>
                <DataTableHeadCell className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a]">
                  {t('category') || 'Catégorie'}
                </DataTableHeadCell>
                <SortableHeadCell
                  sortKey="quantity"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'quantity')}
                  align="right"
                  className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a] [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('quantity') || 'Quantité'}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="price"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'price')}
                  align="right"
                  className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a] [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('unitPrice') || 'Prix unitaire'}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="total"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'total')}
                  align="right"
                  className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a] [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('totalValue') || 'Valeur totale'}
                </SortableHeadCell>
                <DataTableHeadCell className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a]">
                  {t('supplier') || 'Fournisseur'}
                </DataTableHeadCell>
                <DataTableHeadCell className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a]">
                  {t('status') || 'Statut'}
                </DataTableHeadCell>
                <DataTableHeadSpacerCell className="bg-neutral-50 px-3 py-2 dark:bg-[#0a0a0a]" />
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
                  <DataTableRow
                    key={item.id}
                    index={index}
                    striped={false}
                    tabIndex={0}
                    className="group cursor-pointer outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand-500)]"
                    onClick={() => setItemModal({ open: true, editing: item })}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setItemModal({ open: true, editing: item });
                      }
                    }}
                  >
                    <DataTableCell className="px-3 py-2" onClick={(event) => event.stopPropagation()} mobileHidden>
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" mobilePrimary>
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.image_url}
                              alt=""
                              className="size-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex size-12 shrink-0 items-center justify-center rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]">
                            <ImageIcon className="size-5 text-[var(--fg-subtle)]" />
                          </div>
                        )}
                        <span className="text-fs-sm font-semibold text-[var(--fg)]">
                          {item.name}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" mobileLabel={t('category') || 'Catégorie'}>
                      <span className="inline-flex items-center gap-[var(--s-2)] rounded-r-sm bg-[var(--surface-2)] px-2 py-1 text-fs-xs font-medium text-[var(--fg-muted)] whitespace-nowrap">
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
                      className="relative cursor-pointer px-3 py-2 hover:text-[var(--brand-500)]"
                      align="right"
                      onClick={(event) => {
                        event.stopPropagation();
                        setLevelPopover(item.id);
                      }}
                      title={t('displayAs') || 'Display as'}
                      mobileLabel={t('quantity') || 'Quantité'}
                    >
                      <span className="num inline-flex items-center gap-1.5 text-fs-sm font-semibold text-[var(--fg)]">
                        {formatQuantityAtLevel(item, level, t)}
                        <ChevronDownIcon className="size-3.5 text-[var(--fg-subtle)]" />
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
                            className="absolute start-0 top-full z-50 mt-1 w-64 rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-1 text-start shadow-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-3 py-2 text-fs-xs font-medium text-[var(--fg-subtle)]">
                              {t('displayAs') || 'Display as'}
                            </div>
                            {pkg.levels.map((lvl) => (
                              <button
                                key={lvl}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectItemLevel(item.id, lvl);
                                }}
                                className={`flex w-full items-center justify-between gap-2 rounded-r-sm px-3 py-2 text-start ${
                                  lvl === level
                                    ? 'bg-[var(--brand-50)] text-[var(--brand-600)]'
                                    : 'text-[var(--fg)] hover:bg-[var(--surface-2)]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-fs-sm font-medium">
                                    {formatQuantityAtLevel(item, lvl, t)}
                                  </div>
                                  <div className="num truncate text-fs-xs text-[var(--fg-muted)]">
                                    {formatUnitPriceAtLevel(item, lvl, adjustedCost(item), money, t)}
                                  </div>
                                </div>
                                {lvl === pkg.defaultLevel && pkg.levels.length > 1 && (
                                  <span className="shrink-0 text-[10px] text-[var(--fg-subtle)]">
                                    {t('default') || 'default'}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" align="right" mobileLabel={t('unitPrice') || 'Prix unitaire'}>
                      <span className="num whitespace-nowrap text-fs-sm text-[var(--fg-muted)]">
                        {formatUnitPriceAtLevel(item, level, adjustedCost(item), money, t)}
                        {item.vat_rate_override != null && item.vat_rate_override !== vatRate && (
                          <span className="ms-1.5 text-[10px] text-[var(--fg-subtle)]">
                            {item.vat_rate_override}% TVA
                          </span>
                        )}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" align="right" mobileLabel={t('totalValue') || 'Valeur totale'}>
                      <span className="num whitespace-nowrap text-fs-sm font-semibold text-[var(--fg)]">
                        {money(lineValue)}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" mobileLabel={t('supplier') || 'Fournisseur'}>
                      <span className="text-fs-sm text-[var(--fg-muted)]">
                        {item.supplier || '—'}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" mobileLabel={t('status') || 'Statut'}>
                      {isLow ? (
                        <Badge tone="danger">
                          <AlertTriangleIcon className="size-3.5" />
                          {t('lowStock') || 'Bas'}
                        </Badge>
                      ) : (
                        <Badge tone="success" dot>OK</Badge>
                      )}
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <RowActionsMenu
                        actions={[
                          { label: t('stockHistory'), onClick: () => setHistoryItem(item), icon: <ClockIcon className="w-4 h-4" /> },
                          ...(canManage ? [
                            { label: t('receiveStock'), onClick: () => setTxModal({ open: true, item, type: 'receive' as StockTransactionType }), icon: <DownloadIcon className="w-4 h-4" /> },
                            { label: t('edit'), onClick: () => setItemModal({ open: true, editing: item }), icon: <PencilIcon className="w-4 h-4" /> },
                            { label: t('delete'), onClick: () => handleDelete(item.id), variant: 'danger' as const, icon: <TrashIcon className="w-4 h-4" /> },
                          ] : []),
                        ]}
                      />
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
        </DataTable>
      )}

      {sorted.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-fs-xs text-[var(--fg-muted)]">
            {t('showing')
              .replace('{start}', String(visibleStart))
              .replace('{end}', String(visibleEnd))
              .replace('{total}', String(sorted.length))}
          </p>
        </div>
      )}
        </div>

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

      {/* CSV Import Modal */}
      {csvImportOpen && (
        <CsvImportModal
          mode="stock"
          restaurantId={rid}
          onClose={() => setCsvImportOpen(false)}
          onImported={reload}
          existingCategories={categories.map((c) => c.name)}
          existingItemKeys={new Set(items.map((it) => `${(it.category ?? '').toLowerCase()}::${it.name.toLowerCase()}`))}
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
        onDeleteCategory={async (name) => {
          const cat = categories.find((c) => c.name === name);
          if (!cat || cat.id <= 0) return;
          await deleteStockCategory(rid, cat.id);
          const [fresh, items2] = await Promise.all([
            getStockCategories(rid),
            listStockItems(rid),
          ]);
          setCategories(fresh);
          setItems(items2);
          setSelectedCategories((prev) => {
            if (!prev.has(name)) return prev;
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
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
  const { money } = useCurrency();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');

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

  // Custom-unit conversions: how much of this item's base unit equals one
  // custom unit (e.g. 1 "piece" = 0.15 kg). Keyed by custom_unit_id so the UI
  // can render configured rows and the Add modal can match typed names against
  // the existing library.
  const [customUnits, setCustomUnits] = useState<CustomUnit[]>([]);
  const [conversions, setConversions] = useState<Record<number, number>>(() => {
    const out: Record<number, number> = {};
    for (const c of editing?.unit_conversions ?? []) out[c.custom_unit_id] = c.base_quantity;
    return out;
  });
  const [recipeUnitModal, setRecipeUnitModal] = useState<
    | { mode: 'add' }
    | { mode: 'edit'; unitId: number; name: string; qty: number }
    | null
  >(null);
  useEffect(() => {
    listCustomUnits(rid).then(setCustomUnits).catch(() => setCustomUnits([]));
  }, [rid]);

  // Image upload state
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIconPick = async (iconUrl: string) => {
    setIconPickerOpen(false);
    // Picked from library = no file to upload, just point at the existing URL.
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview('');
    setImageUrl(iconUrl);
    if (editing) {
      try {
        await updateStockItem(rid, editing.id, { image_url: iconUrl });
      } catch (err: any) {
        alert(err.message || 'Save failed');
      }
    }
  };

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
        unit_conversions: customUnits
          .map<UnitConversionInput>((u) => ({ custom_unit_id: u.id, base_quantity: conversions[u.id] ?? 0 }))
          .filter((c) => c.base_quantity > 0),
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
          className="w-full aspect-square rounded-r-lg overflow-hidden group grid place-items-center bg-[var(--surface-2)] border border-[var(--line)]"
          onClick={canManage ? () => fileInputRef.current?.click() : undefined}
          onDragOver={canManage ? (e) => e.preventDefault() : undefined}
          onDrop={canManage ? handleDrop : undefined}
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
        {canManage && (
          <div className="absolute bottom-2 end-2 flex gap-1">
            <button
              type="button"
              onClick={() => setIconPickerOpen(true)}
              className="w-8 h-8 rounded-r-sm grid place-items-center text-white"
              style={{ background: 'rgba(0,0,0,.6)' }}
              aria-label={t('pickFromLibrary') || 'Pick from icon library'}
              title={t('pickFromLibrary') || 'Pick from icon library'}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-r-sm grid place-items-center text-white"
              style={{ background: 'rgba(0,0,0,.6)' }}
              aria-label={t('editImage') || 'Upload photo'}
              title={t('editImage') || 'Upload photo'}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
            {money(editing?.cost_per_unit ?? 0)}
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
          <span className="font-mono tabular-nums text-fs-sm">{money(unitValue)}</span>
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
      onSave={canManage ? handleSubmit : undefined}
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

        {/* Recipe units — name a portion of this item (e.g. 1 cuisse de poulet
            = 0.15 kg) so recipes can be written in pieces while stock stays in
            its base unit. Source of truth is `conversions`: rows here are
            ids present with a positive amount; the Add modal can either reuse
            a library unit by name or create a new one inline. */}
        <div className="mb-[var(--s-5)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)] mb-1">{t('recipeUnits')}</h3>
          <p className="text-fs-xs text-[var(--fg-muted)] mb-[var(--s-3)]">{t('recipeUnitsHint')}</p>
          {(() => {
            const rows = Object.entries(conversions)
              .filter(([, v]) => Number(v) > 0)
              .map(([idStr, v]) => {
                const id = Number(idStr);
                const unit = customUnits.find((u) => u.id === id);
                return unit ? { unit, qty: Number(v) } : null;
              })
              .filter((x): x is { unit: CustomUnit; qty: number } => x !== null);
            const baseUnit = deriveTotals(qty).baseUnit;
            return (
              <div className="flex flex-col gap-[var(--s-2)]">
                {rows.length === 0 && (
                  <p className="text-fs-xs text-[var(--fg-subtle)] italic">{t('recipeUnitsEmpty')}</p>
                )}
                {rows.map(({ unit, qty: convQty }) => (
                  <div
                    key={unit.id}
                    className="flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md border border-[var(--line)] bg-[var(--surface)]"
                  >
                    <RulerIcon className="w-4 h-4 text-[var(--fg-subtle)] shrink-0" />
                    <span className="text-fs-sm font-medium text-[var(--fg)]">1 {unit.name}</span>
                    {unit.abbreviation && (
                      <span className="text-fs-xs text-[var(--fg-subtle)] px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
                        {unit.abbreviation}
                      </span>
                    )}
                    <span className="text-fs-sm text-[var(--fg-muted)]">=</span>
                    <span className="font-mono tabular-nums text-fs-sm text-[var(--fg)]">{convQty}</span>
                    <span className="text-fs-sm text-[var(--fg-muted)]">{baseUnit}</span>
                    <div className="ms-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRecipeUnitModal({ mode: 'edit', unitId: unit.id, name: unit.name, qty: convQty })}
                        className="p-2 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors"
                        aria-label={t('edit')}
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(t('recipeUnitRemoveConfirm'))) return;
                          setConversions((prev) => {
                            const next = { ...prev };
                            delete next[unit.id];
                            return next;
                          });
                        }}
                        className="p-2 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                        aria-label={t('remove')}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRecipeUnitModal({ mode: 'add' })}
                  className="self-start inline-flex items-center gap-[var(--s-2)] h-7 px-[var(--s-3)] rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] text-fs-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] transition-colors"
                >
                  <PlusIcon className="w-3 h-3" />
                  {t('addRecipeUnit')}
                </button>
              </div>
            );
          })()}
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
      {iconPickerOpen && (
        <IngredientIconPicker
          restaurantId={rid}
          initialQuery={name}
          onPick={(icon) => handleIconPick(icon.image_url)}
          onClose={() => setIconPickerOpen(false)}
        />
      )}
      {recipeUnitModal && (
        <RecipeUnitFormModal
          mode={recipeUnitModal.mode}
          initialName={recipeUnitModal.mode === 'edit' ? recipeUnitModal.name : ''}
          initialQty={recipeUnitModal.mode === 'edit' ? recipeUnitModal.qty : 0}
          baseUnit={deriveTotals(qty).baseUnit}
          libraryUnits={customUnits}
          onClose={() => setRecipeUnitModal(null)}
          onSave={async ({ name: unitName, abbreviation, qty: convQty }) => {
            if (recipeUnitModal.mode === 'edit') {
              // Editing an existing per-item conversion: only the amount can
              // change here. Renames happen on the Units screen where the
              // library-wide effect is visible.
              setConversions((prev) => ({ ...prev, [recipeUnitModal.unitId]: convQty }));
              setRecipeUnitModal(null);
              return;
            }
            const match = customUnits.find((u) => u.name.toLowerCase() === unitName.toLowerCase());
            if (match) {
              setConversions((prev) => ({ ...prev, [match.id]: convQty }));
              setRecipeUnitModal(null);
              return;
            }
            const created = await createCustomUnit(rid, { name: unitName, abbreviation });
            setCustomUnits((prev) => [...prev, created]);
            setConversions((prev) => ({ ...prev, [created.id]: convQty }));
            setRecipeUnitModal(null);
          }}
        />
      )}
    </FullScreenEditor>
  );
}

// ─── Recipe Unit Add/Edit Modal ─────────────────────────────────────────────

function RecipeUnitFormModal({
  mode, initialName, initialQty, baseUnit, libraryUnits, onClose, onSave,
}: {
  mode: 'add' | 'edit';
  initialName: string;
  initialQty: number;
  baseUnit: string;
  libraryUnits: CustomUnit[];
  onClose: () => void;
  onSave: (input: { name: string; abbreviation: string; qty: number }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [abbreviation, setAbbreviation] = useState('');
  const [qty, setQty] = useState(initialQty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const matchedExisting = libraryUnits.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
  const isEdit = mode === 'edit';
  const canSave = trimmed.length > 0 && qty > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmed, abbreviation: abbreviation.trim(), qty });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? t('editRecipeUnit') : t('recipeUnitModalTitle')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('unitNameLabel')} *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('unitNamePlaceholder')}
            list="recipe-unit-suggestions"
            autoFocus={!isEdit}
            disabled={isEdit}
            className="w-full px-3 py-2 rounded-lg border text-sm disabled:opacity-60"
            style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
          />
          {!isEdit && (
            <>
              <datalist id="recipe-unit-suggestions">
                {libraryUnits.map((u) => <option key={u.id} value={u.name} />)}
              </datalist>
              <p className="text-xs text-fg-tertiary mt-1">{t('recipeUnitNameHint')}</p>
            </>
          )}
        </div>
        {!isEdit && !matchedExisting && (
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">{t('unitAbbrLabel')}</label>
            <input
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              placeholder={t('unitAbbrPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">
            1 {trimmed || (t('unitNameLabel') || '').toLowerCase()} {t('recipeUnitConversionEquals')}
          </label>
          <div className="flex items-center gap-2">
            <NumberInput
              min={0}
              value={qty}
              onChange={setQty}
              className="input w-32 py-2 text-sm"
              autoFocus={isEdit}
            />
            <span className="text-sm text-fg-secondary">{baseUnit}</span>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium text-fg-secondary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {t('save')}
          </button>
        </div>
      </div>
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
