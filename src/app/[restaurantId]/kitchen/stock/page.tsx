'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  listStockItems, deleteStockItem,
  getStockCategories,
  batchUpdateStockCategory, batchUpdateStockVat, getRestaurantSettings,
  getRestaurant, listSuppliers,
  createStockCategory, updateStockCategory, deleteStockCategory,
  StockItem, StockCategory, StockTransactionType,
  Supplier,
} from '@/lib/api';
import StockItemEditor from '@/components/stock/StockItemEditor';
import { StockTransactionDialog, StockHistoryDialog } from '@/components/stock/StockTransactionDialogs';
import VatRateSelect from '@/components/stock/VatRateSelect';
import DeliveryImportModal from './DeliveryImportModal';
import CsvImportModal from '@/components/import/CsvImportModal';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';
import Modal from '@/components/Modal';
import CategoryDrawer from '@/components/menu/CategoryDrawer';
import {
  PlusIcon, DownloadIcon,
  AlertTriangleIcon, TrashIcon, PencilIcon,
  ArrowRightLeftIcon,
  ClockIcon,
  ChevronDownIcon, ImageIcon,
  RulerIcon, ListFilterIcon,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import {
  ListToolbar,
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
import { Badge, Button, PageHead, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { supportedOrderLocale } from '@/components/i18n/LocalizedOrderNameField';
import type { Locale } from '@/components/i18n/LocaleTabs';
import {
  getPackaging,
  formatQuantityAtLevel,
  formatUnitPriceAtLevel,
  loadLevel,
  saveLevel,
  Level,
} from '@/lib/stock/levels';

// ─── Main ──────────────────────────────────────────────────────────────────

/** Restaurant stock list, movements and item editor. */
export default function StockPage() {
  const { restaurantId } = useParams();
  return <StockWorkspace key={String(restaurantId)} rid={Number(restaurantId)}/>;
}

function StockWorkspace({rid}: {rid:number}) {
  const { money } = useCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const deepLinkAppliedRef = useRef(false);

  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [loading, setLoading] = useState(true);
  const [loaded,setLoaded] = useState(false);
  const [loadError,setLoadError] = useState('');
  const [refreshing,setRefreshing] = useState(false);
  const [timeZone,setTimeZone] = useState<string>();
  const guard=useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);
  const [deleteTargets,setDeleteTargets]=useState<StockItem[]|null>(null);
  const [deletedCount,setDeletedCount]=useState(0);
  const deletedIds=useRef(new Set<number>());
  const mutationLock=useRef(false);
  const [mutationError,setMutationError]=useState('');
  const [notice,setNotice]=useState('');

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
  const [filtersDrawer, setFiltersDrawer] = useState<{ open: boolean; view: string }>({
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

  const openFiltersDrawer = (view: string) => setFiltersDrawer({ open: true, view });
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

  const getItemLevel = useCallback((item: StockItem): Level => {
    const stored = itemLevels[item.id];
    if (stored) return stored;
    return loadLevel(rid, item.id) ?? getPackaging(item).defaultLevel;
  }, [itemLevels, rid]);

  const selectItemLevel = useCallback((itemId: number, level: Level) => {
    setItemLevels((prev) => ({ ...prev, [itemId]: level }));
    saveLevel(rid, itemId, level);
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

  useEffect(() => {
    if (!canManage || searchParams.get('newDelivery') !== '1') return;
    setImportDraftId(undefined); setImportModal(true);
    const query = new URLSearchParams(searchParams.toString()); query.delete('newDelivery');
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [canManage, searchParams, router, pathname]);

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

  const reload = useCallback(async () => {
    const request=guard.current.begin(rid);
    setRefreshing(true);setLoadError('');
    try {
      const [stockItems,stockCats,sups,settings,restaurant] = await Promise.all([
        listStockItems(rid),getStockCategories(rid),listSuppliers(rid),getRestaurantSettings(rid),getRestaurant(rid),
      ]);
      if(!guard.current.isCurrent(request))return;
      setItems(stockItems);setCategories(stockCats);setSuppliers(sups);
      setVatRate(settings.vat_rate??18);setSourceLocale(supportedOrderLocale(restaurant.default_locale));setTimeZone(restaurant.timezone);setLoaded(true);
      setSelected(previous=>new Set(Array.from(previous).filter(id=>stockItems.some(item=>item.id===id))));
    } catch(cause) {
      if(guard.current.isCurrent(request))setLoadError(cause instanceof Error?cause.message:t('workspaceLoadError'));
      throw cause;
    } finally {if(guard.current.isCurrent(request)){setLoading(false);setRefreshing(false);}}
  },[rid,t]);
  useEffect(()=>{const current=guard.current;void reload().catch(()=>{/* Rendered by loadError. */});return()=>current.invalidate();},[reload]);


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

  const requestDelete=(targets:StockItem[])=>{
    if(!canManage||targets.length===0||mutationLock.current)return;
    deletedIds.current=new Set();setDeletedCount(0);setMutationError('');setDeleteTargets(targets);
  };
  const handleDelete=(id:number)=>requestDelete(items.filter(item=>item.id===id));
  const removeSelected=async()=>{
    if(!canManage||!deleteTargets||mutationLock.current)return;
    mutationLock.current=true;setBulkProcessing(true);setMutationError('');
    try{
      for(const item of deleteTargets){
        if(deletedIds.current.has(item.id))continue;
        await deleteStockItem(rid,item.id);deletedIds.current.add(item.id);setDeletedCount(deletedIds.current.size);
        setItems(previous=>previous.filter(value=>value.id!==item.id));setSelected(previous=>new Set(Array.from(previous).filter(id=>id!==item.id)));
      }
      setDeleteTargets(null);setNotice(t('stockItemsDeleted'));
    }catch(cause){setMutationError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{mutationLock.current=false;setBulkProcessing(false);}
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

  const handleBulkDelete=()=>requestDelete(items.filter(item=>selected.has(item.id)));

  const handleBulkCategory=async(name:string)=>{
    if(!canManage||selected.size===0||!name||mutationLock.current)return;
    const ids=new Set(selected);mutationLock.current=true;setBulkProcessing(true);setMutationError('');
    try{
      await batchUpdateStockCategory(rid,{item_ids:Array.from(ids),category:name});
      setItems(previous=>previous.map(item=>ids.has(item.id)?{...item,category:name}:item));
      setSelected(new Set());setCategoryDrawer({open:false,mode:'filter'});setNotice(t('saved'));
    }catch(cause){setMutationError(cause instanceof Error?cause.message:t('saveFailed'));throw cause;}
    finally{mutationLock.current=false;setBulkProcessing(false);}
  };
  const handleCategorySelect=async(name:string|null)=>{
    if(categoryDrawer.mode==='bulk-assign'){if(name)await handleBulkCategory(name);return;}
    setSelectedCategories(name===null?new Set():new Set([name]));setCategoryDrawer({open:false,mode:'filter'});
  };
  const handleBulkVat=async()=>{
    if(!canManage||selected.size===0||mutationLock.current)return;
    const ids=new Set(selected);mutationLock.current=true;setBulkProcessing(true);setMutationError('');
    try{
      await batchUpdateStockVat(rid,{item_ids:Array.from(ids),vat_rate_override:bulkVatValue});
      setItems(previous=>previous.map(item=>ids.has(item.id)?{...item,vat_rate_override:bulkVatValue}:item));
      setSelected(new Set());setBulkVatModal(false);setBulkVatValue(null);setNotice(t('saved'));
    }catch(cause){setMutationError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{mutationLock.current=false;setBulkProcessing(false);}
  };

  if(loading)return <div className="space-y-5"><PageHead title={t('stock')}/><p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p></div>;
  if(!loaded&&loadError)return <div className="space-y-5"><PageHead title={t('stock')}/><div role="alert" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4"><p className="text-[var(--danger-500)]">{loadError}</p><Button size="lg" variant="secondary" disabled={refreshing} onClick={()=>void reload().catch(()=>{/* Rendered above. */})}>{t('retry')}</Button></div></div>;

  const statusOptions = [{ value: 'low', label: t('lowStock') }, { value: 'ok', label: t('statusOk') }];
  const listFilters = [
    { id: 'category', label: t('category'), options: categories.map(category => ({ value: category.name, label: category.name })), selected: selectedCategories },
    { id: 'status', label: t('listState'), options: statusOptions, selected: selectedStatuses },
  ];
  const visibleStart = sorted.length > 0 ? 1 : 0;
  const visibleEnd = sorted.length;
  return (
    <div className="min-h-[calc(100dvh-var(--topbar-total-h)-64px)]">
      <div className="min-w-0 space-y-[var(--s-3)] md:space-y-[var(--s-4)]">
        <h1 className="sr-only">{t('stock')}</h1>
        {notice&&<p role="status" className="text-sm text-[var(--success-500)]">{notice}</p>}
        {loadError&&<div role="alert" className="space-y-3 rounded-r-md border border-[var(--line)] p-4"><p className="text-sm text-[var(--danger-500)]">{t('stockRefreshFailed')} {loadError}</p><Button variant="secondary" size="lg" disabled={refreshing} onClick={()=>void reload().catch(()=>{/* Rendered here. */})}>{t('retry')}</Button></div>}
        <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
          filters={<>
            <ListFilterButton label={t('category')} value={selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : selectedCategories.size > 1 ? selectedCategories.size : undefined} onClick={() => openFiltersDrawer('category')} />
            <ListStateFilter label={t('listState')} options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} />
            <ListFilterButton label={t('allFilters')} icon={<ListFilterIcon />} onClick={() => openFiltersDrawer('index')} />
          </>}
          primaryAction={canManage && <Button onClick={() => setItemModal({ open: true })}>{t('createItem')}</Button>}
          actions={<ActionsDropdown actions={[
            { label: `${t('displayPrice')}: ${t(vatDisplayMode === 'inc' ? 'exVat' : 'incVat')}`, onClick: toggleVatDisplay },
            ...(canManage ? [
              { label: t('orderStock'), onClick: () => router.push(`/${rid}/kitchen/suppliers?tab=needs`) },
              { label: t('importDelivery'), onClick: () => { setImportDraftId(undefined); setImportModal(true); } },
              { label: t('importCsv'), onClick: () => setCsvImportOpen(true) },
              { label: t('categories'), onClick: () => setCategoryDrawer({ open: true, mode: 'filter' }) },
            ] : []),
            { label: t('refresh'), onClick: () => void reload().catch(() => { /* Rendered by loadError. */ }), disabled: refreshing },
            ...(canManage && selected.size ? [
              { label: t('updateCategory'), onClick: () => setCategoryDrawer({ open: true, mode: 'bulk-assign' }), disabled: bulkProcessing },
              { label: t('updateVat'), onClick: () => { setMutationError(''); setBulkVatValue(null); setBulkVatModal(true); }, disabled: bulkProcessing },
              { label: `${t('delete')} (${selected.size})`, onClick: handleBulkDelete, variant: 'danger' as const, disabled: bulkProcessing },
              { label: t('deselectAll'), onClick: () => setSelected(new Set()) },
            ] : []),
          ]} />}
        />
        <span role="status" className="sr-only">{t('itemsSelected').replace('{count}', String(selected.size))}</span>
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
              size="lg"
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
          className="list-table operational-table"
          data-density="compact"
        >
            <DataTableHead className="sticky top-0 z-[2]">
                <DataTableHeadSpacerCell className="bg-[var(--surface)] px-3 py-2">
                  <Checkbox aria-label={t('selectAll')} disabled={!canManage||bulkProcessing}
                  checked={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                  onCheckedChange={toggleSelectAll}
                  />
                </DataTableHeadSpacerCell>
                <SortableHeadCell
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'name')}
                  className="bg-[var(--surface)] px-3 py-2 normal-case tracking-normal [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('item') || 'Article'}
                </SortableHeadCell>
                <DataTableHeadCell className="bg-[var(--surface)] px-3 py-2 normal-case tracking-normal">
                  {t('category') || 'Catégorie'}
                </DataTableHeadCell>
                <SortableHeadCell
                  sortKey="quantity"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'quantity')}
                  align="right"
                  className="bg-[var(--surface)] px-3 py-2 normal-case tracking-normal [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('quantity') || 'Quantité'}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="price"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'price')}
                  align="right"
                  className="bg-[var(--surface)] px-3 py-2 normal-case tracking-normal [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('unitPrice') || 'Prix unitaire'}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="total"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'total')}
                  align="right"
                  className="bg-[var(--surface)] px-3 py-2 normal-case tracking-normal [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('totalValue') || 'Valeur totale'}
                </SortableHeadCell>
                <DataTableHeadCell className="bg-[var(--surface)] px-3 py-2 normal-case tracking-normal">
                  {t('supplier') || 'Fournisseur'}
                </DataTableHeadCell>
                <DataTableHeadCell className="bg-[var(--surface)] px-3 py-2 normal-case tracking-normal">
                  {t('status') || 'Statut'}
                </DataTableHeadCell>
                <DataTableHeadSpacerCell className="bg-[var(--surface)] px-3 py-2" />
            </DataTableHead>
            <DataTableBody>
              {sorted.map((item, index) => {
                const isLow = stockStatusOf(item) === 'low';
                const catColor = categories.find((c) => c.name === item.category)?.color;
                const pkg = getPackaging(item);
                const level = getItemLevel(item);

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
                      <Checkbox aria-label={`${t('select')} — ${item.name}`} disabled={!canManage||bulkProcessing}
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
                    <DataTableCell className="px-3 py-2" mobileLabel={t('category') || 'Catégorie'} data-mobile-role="detail">
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
                    <DataTableCell className="px-3 py-2" align="right" onClick={event=>event.stopPropagation()} mobileLabel={t('quantity')} data-mobile-role="detail">
                      <Menu><MenuTrigger asChild><Button type="button" size="lg" variant="ghost" aria-label={`${t('displayAs')} — ${item.name}`} className="h-auto min-h-11 whitespace-normal text-end"><bdi>{formatQuantityAtLevel(item,level,t)}</bdi><ChevronDownIcon/></Button></MenuTrigger>
                        <MenuContent align="end" collisionPadding={12} className="max-w-[calc(100vw-24px)]" onClick={event=>event.stopPropagation()}>{pkg.levels.map(value=><MenuItem key={value} className="h-auto min-h-11 py-3" onSelect={()=>selectItemLevel(item.id,value)}><span className="min-w-0"><bdi className="block whitespace-normal">{formatQuantityAtLevel(item,value,t)}</bdi><bdi className="mt-1 block text-xs text-fg-secondary">{formatUnitPriceAtLevel(item,value,adjustedCost(item),money,t)}</bdi></span>{value===level&&<span aria-hidden className="ms-auto text-[var(--brand-ink)]">✓</span>}</MenuItem>)}</MenuContent>
                      </Menu>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" align="right" mobileLabel={t('unitPrice') || 'Prix unitaire'} data-mobile-role="detail">
                      <span className="num whitespace-nowrap text-fs-sm text-[var(--fg-muted)]">
                        {formatUnitPriceAtLevel(item, level, adjustedCost(item), money, t)}
                        {item.vat_rate_override != null && item.vat_rate_override !== vatRate && (
                          <span className="ms-1.5 text-[10px] text-[var(--fg-subtle)]">
                            {item.vat_rate_override}% {t('vat')}
                          </span>
                        )}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" align="right" mobileLabel={t('totalValue') || 'Valeur totale'} data-mobile-role="detail">
                      <span className="num whitespace-nowrap text-fs-sm font-semibold text-[var(--fg)]">
                        {money(lineValue)}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" mobileLabel={t('supplier') || 'Fournisseur'} data-mobile-role="detail">
                      <span className="text-fs-sm text-[var(--fg-muted)]">
                        {item.supplier || '—'}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" mobileLabel={t('status') || 'Statut'} data-mobile-role="detail">
                      {isLow ? (
                        <Badge tone="danger">
                          <AlertTriangleIcon className="size-3.5" />
                          {t('lowStock') || 'Bas'}
                        </Badge>
                      ) : (
                        <Badge tone={item.is_active?'success':'neutral'} dot>{t(item.is_active?'statusOk':'inactive')}</Badge>
                      )}
                    </DataTableCell>
                    <DataTableCell className="px-3 py-2" data-mobile-role="menu" onClick={(event) => event.stopPropagation()}>
                      <RowActionsMenu label={`${t('actions')} — ${item.name}`}
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
        <StockItemEditor
          rid={rid}
          editing={itemModal.editing}
          categories={categories.map((c) => c.name)}
          suppliers={suppliers}
          sourceLocale={sourceLocale}
          vatRate={vatRate}
          vatDisplayMode={vatDisplayMode}
          onClose={() => setItemModal({ open: false })}
          onSaved={reload}
        />
      )}

      {/* Transaction Modal */}
      {txModal.open && txModal.item && (
        <StockTransactionDialog
          rid={rid}
          item={txModal.item}
          defaultType={txModal.type}
          onClose={() => setTxModal({ open: false })}
          onSaved={reload}
        />
      )}

      {/* Transaction History Modal */}
      {historyItem && (
        <StockHistoryDialog
          rid={rid}
          item={historyItem}
          onClose={() => setHistoryItem(null)}
          timeZone={timeZone}
        />
      )}

      <ListFiltersDrawer open={filtersDrawer.open} initialView={filtersDrawer.view} onClose={closeFiltersDrawer} filters={listFilters}
        onApply={values => { setSelectedCategories(values.category); setSelectedStatuses(values.status); }} />

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
          canDelete: c.id>0,
          count: items.filter((i) => i.category === c.name).length,
        }))}
        currentCategory={
          selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ''
        }
        onSelect={handleCategorySelect}
        selectionCount={selected.size}
        deleteDescription={t('stockCategoryDeleteHint')}
        onCreateCategory={canManage ? async ({name})=>{
          const created=await createStockCategory(rid,{name});
          setCategories(previous=>previous.some(category=>category.name===created.name)?previous.map(category=>category.name===created.name?created:category):[...previous,created]);
        }:undefined}
        onEditCategory={canManage ? async (oldName,patch)=>{
          const category=categories.find(value=>value.name===oldName);if(!category)return;
          const ensured=category.id>0?category:await createStockCategory(rid,{name:oldName});
          if(category.id<=0)setCategories(previous=>previous.map(value=>value.name===oldName?ensured:value));
          if(patch.name&&patch.name!==oldName){
            const renamed=await updateStockCategory(rid,ensured.id,{name:patch.name});
            setCategories(previous=>previous.map(value=>value.name===oldName?renamed:value));
            setItems(previous=>previous.map(item=>item.category===oldName?{...item,category:renamed.name}:item));
            setSelectedCategories(previous=>new Set(Array.from(previous).map(name=>name===oldName?renamed.name:name)));
          }
        }:undefined}
        onDeleteCategory={canManage ? async name=>{
          const category=categories.find(value=>value.name===name);if(!category||category.id<=0)return;
          await deleteStockCategory(rid,category.id);
          setCategories(previous=>items.some(item=>item.category===name)?previous.map(value=>value.name===name?{...value,id:0,color:'',image_url:''}:value):previous.filter(value=>value.name!==name));
          setSelectedCategories(previous=>new Set(Array.from(previous).filter(value=>value!==name)));
        }:undefined}
        processing={bulkProcessing}
      />

      {/* Bulk Update VAT Modal — reuses VatRateSelect for the same default/exempt/custom
          semantics as the per-item editor. `null` clears the override; a value sets it. */}
      {bulkVatModal && (
        <Modal title={t('updateVat')} closeDisabled={bulkProcessing} onClose={() => {if(!mutationLock.current)setBulkVatModal(false);}}>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
            {t('bulkVatDesc').replace('{count}', String(selected.size))}
          </p>
          <fieldset disabled={bulkProcessing} className="mb-4">
            <VatRateSelect
              value={bulkVatValue}
              onChange={setBulkVatValue}
              restaurantRate={vatRate}
            />
          </fieldset>
          {mutationError&&<p role="alert" className="mb-4 text-sm text-[var(--danger-500)]">{mutationError}</p>}
          <div className="flex justify-end gap-2">
            <Button size="lg" variant="secondary" disabled={bulkProcessing} onClick={() => setBulkVatModal(false)}>{t('cancel')}</Button>
            <Button size="lg" disabled={bulkProcessing} onClick={handleBulkVat}>{t('apply')}</Button>
          </div>
        </Modal>
      )}
      {deleteTargets&&<Modal title={t('delete')} closeDisabled={bulkProcessing} onClose={()=>{if(!mutationLock.current)setDeleteTargets(null);}}
        footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={bulkProcessing} onClick={()=>setDeleteTargets(null)}>{t('cancel')}</Button><Button size="lg" variant="danger" disabled={bulkProcessing} onClick={()=>void removeSelected()}>{t(bulkProcessing?'saving':deletedCount?'retry':'delete')}</Button></div>}>
        <p className="text-sm text-fg-secondary">{t('bulkDeleteConfirm').replace('{count}',String(deleteTargets.length))}</p><ul className="my-4 space-y-2 text-sm">{deleteTargets.map(item=><li key={item.id} className="break-words">{item.name}</li>)}</ul>
        {deletedCount>0&&<p role="status" className="text-sm">{t('stockDeleteProgress').replace('{done}',String(deletedCount)).replace('{total}',String(deleteTargets.length))}</p>}
        {mutationError&&<p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{mutationError}</p>}
      </Modal>}
      </div>{/* /px-8 py-6 wrapper */}
    </div>
  );
}
