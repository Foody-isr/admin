'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { listPrepItems, listStockItems, getPrepCategories, createPrepCategory, updatePrepCategory, type PrepItem, type PrepCategory, type StockItem } from '@/lib/api';
import PrepItemEditor from '@/components/prep/PrepItemEditor';
import { BatchProduceDialog, PrepTransactionDialog, DailyPrepPlanDialog, PrepDeleteDialog } from '@/components/prep/PrepOperations';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import StockFiltersDrawer, {
  FilterView,
  FilterCategory,
  FilterStatusOption,
} from '@/components/stock/StockFiltersDrawer';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import CategoryDrawer from '@/components/menu/CategoryDrawer';
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
import {
  SearchIcon, PlusIcon, TrashIcon, PencilIcon,
  BeakerIcon, CalendarDaysIcon, ArrowRightLeftIcon,
  AlertTriangleIcon, PlayIcon, SparklesIcon,
  ChevronDownIcon, ChevronUpIcon, RefreshCwIcon, ClockIcon, ImageIcon,
} from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, Kpi, PageHead } from '@/components/ds';
import { FeatureIntro } from '@/components/help/FeatureIntro';
import RecipeImportModal from '../RecipeImportModal';
export default function PrepPage() {
  const {restaurantId}=useParams();
  return <PrepWorkspace key={String(restaurantId)} rid={Number(restaurantId)}/>;
}

function PrepWorkspace({rid}:{rid:number}) {
  const { money } = useCurrency();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const deepLinkAppliedRef = useRef(false);

  const [items, setItems] = useState<PrepItem[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  const [removing,setRemoving]=useState<PrepItem[]|null>(null);
  const guard=useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);

  // Filters
  const [search, setSearch] = useState('');
  type SortKey = 'name' | 'quantity' | 'yield' | 'shelf';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [filtersDrawer, setFiltersDrawer] = useState<{ open: boolean; view: FilterView }>({
    open: false,
    view: 'index',
  });
  const openFiltersDrawer = (view: FilterView) => setFiltersDrawer({ open: true, view });
  const closeFiltersDrawer = () => setFiltersDrawer((prev) => ({ ...prev, open: false }));

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // KPI collapse — parity with Stock & Articles pages.
  const [showKpis, setShowKpis] = useState(true);
  // Category drawer — filter-only for prep (no bulk-assign category op yet).
  const [categoryDrawer, setCategoryDrawer] = useState<{
    open: boolean;
    mode: 'filter' | 'bulk-assign';
  }>({ open: false, mode: 'filter' });
  const handleCategorySelect = (name: string | null) => {
    if (name === null) setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
    setCategoryDrawer({ open: false, mode: 'filter' });
  };
  // Prep category metadata (id, color, image_url, sort_order). Fetched
  // alongside items via the dedicated /prep/categories endpoint. Enables
  // image upload + rename from the drawer without touching the items list.
  const [categoryMeta, setCategoryMeta] = useState<PrepCategory[]>([]);
  // Modals
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: PrepItem }>({ open: false });
  const [batchModal, setBatchModal] = useState<{ open: boolean; item?: PrepItem }>({ open: false });
  const [txModal, setTxModal] = useState<{ open: boolean; item?: PrepItem }>({ open: false });
  const [planModal, setPlanModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const reload = useCallback(async () => {
    const request=guard.current.begin(rid);setLoading(true);setError('');
    try {
      const [prepItems, rawItems, cats] = await Promise.all([
        listPrepItems(rid),
        listStockItems(rid),
        getPrepCategories(rid),
      ]);
      if(!guard.current.isCurrent(request))return;
      setLoaded(true);setItems(prepItems);
      setStockItems(rawItems);
      setCategoryMeta(cats);
    } catch(cause) {
      if(guard.current.isCurrent(request))setError(cause instanceof Error?cause.message:t('loadFailed'));
      throw cause;
    } finally {
      if(guard.current.isCurrent(request))setLoading(false);
    }
  }, [rid,t]);

  useEffect(() => { void reload().catch(()=>{});const requests=guard.current;return()=>requests.invalidate(); }, [reload]);

  // Deep-link support: `?edit=<prepId>` opens the prep editor directly on the
  // matching item. Used by the menu-item Cost tab warning when a prep has no
  // yield / no ingredients / no priced ingredients. Applied once after the
  // list loads; the param is stripped so a refresh doesn't re-open the modal.
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (items.length === 0) return;
    const editId = searchParams.get('edit');
    if (!editId) return;
    const target = items.find((p) => String(p.id) === editId);
    if (!target) return;
    deepLinkAppliedRef.current = true;
    setItemModal({ open: true, editing: target });
    const q = new URLSearchParams(searchParams.toString());
    q.delete('edit');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [items, searchParams, router, pathname]);

  const categoryNames = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
  const categories: FilterCategory[] = categoryNames.sort().map((name) => ({ name }));
  const statuses: FilterStatusOption[] = [
    { value: 'ok', label: t('ok'), color: '#10b981' },
    { value: 'low', label: t('low'), color: '#ef4444' },
    { value: 'expiring', label: t('expiringSoon') || 'À consommer bientôt', color: '#f59e0b' },
    { value: 'expired', label: t('expired') || 'Périmées', color: '#dc2626' },
  ];

  const isLow = (item: PrepItem) =>
    item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold;

  // Time-based status helpers — used by both the filter and the KPI counts.
  // Computed inline (not memoized): items list is small and recomputes only on
  // re-render anyway since it depends on `Date.now()`.
  const nowMs = Date.now();
  const expiresAtMs = (p: PrepItem) =>
    new Date(p.updated_at).getTime() + (p.shelf_life_hours ?? 0) * 3600 * 1000;
  const isExpiring = (p: PrepItem) =>
    p.shelf_life_hours > 0 &&
    expiresAtMs(p) - nowMs < 48 * 3600 * 1000 &&
    expiresAtMs(p) > nowMs;
  const isExpired = (p: PrepItem) =>
    p.shelf_life_hours > 0 && expiresAtMs(p) <= nowMs;

  // Multi-tag matching: an item can match several status filters at once
  // (e.g. low AND expired). Keeping this independent prevents one status from
  // hiding another.
  const matchesStatus = (item: PrepItem, value: string) => {
    if (value === 'low') return isLow(item);
    if (value === 'ok') return !isLow(item);
    if (value === 'expiring') return isExpiring(item);
    if (value === 'expired') return isExpired(item);
    return false;
  };

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !selectedCategories.has(item.category)) return false;
    if (selectedStatuses.size > 0) {
      const anyMatch = Array.from(selectedStatuses).some((s) => matchesStatus(item, s));
      if (!anyMatch) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
    if (sortKey === 'quantity') return (a.quantity - b.quantity) * dir;
    if (sortKey === 'yield') return (a.yield_per_batch - b.yield_per_batch) * dir;
    return (a.shelf_life_hours - b.shelf_life_hours) * dir;
  });

  const handleDelete = (id:number) => {if(canManage)setRemoving(items.filter(item=>item.id===id));};

  const toggleSelectAll = () => {
    const ids = filtered.map((i) => i.id);
    const all = ids.every((id) => selected.has(id));
    if (all) setSelected(new Set());
    else setSelected(new Set(ids));
  };
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = () => {if(canManage&&selected.size)setRemoving(items.filter(item=>selected.has(item.id)));};

  if(!loaded)return <div><PageHead title={t('preparations')} desc={t('preparationsDesc')}/>{loading?<p role="status" className="py-16 text-center text-fg-secondary">{t('loading')}</p>:<div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button size="lg" variant="secondary" onClick={()=>void reload().catch(()=>{})}>{t('retry')}</Button></div>}</div>;

  // KPI derivations — used by the collapsible KPI row.
  const totalCost = items.reduce(
    (s, p) => s + (p.cost_per_unit ?? 0) * (p.quantity ?? 0),
    0,
  );
  const expiringCount = items.filter(isExpiring).length;
  const expiredCount = items.filter(isExpired).length;

  // Click-to-filter — same pattern as Stock's `filterByStatus`.
  // Pass null to clear all filters; pass a status value to apply it.
  const filterByStatus = (status: 'ok' | 'low' | 'expiring' | 'expired' | null) => {
    setSelectedCategories(new Set());
    setSelectedStatuses(status ? new Set([status]) : new Set());
  };

  // Category pill list — an "all" sentinel first, then distinct names alphabetically.
  const ALL_PILL = '__all__';
  const allLabel = t('all');
  const pillCategories = [ALL_PILL, ...[...categoryNames].sort()];
  const activePill =
    selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ALL_PILL;
  const selectPill = (name: string) => {
    if (name === ALL_PILL) setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
  };

  return (
    <div className="flex flex-col">
      <PageHead
        title={t('preparations') || 'Préparations'}
        desc={t('preparationsDesc')}
        actions={
          <>
            <Button
              variant="ghost"
              size="lg"
              icon
              onClick={() => setShowKpis((v) => !v)}
              aria-label={t(showKpis?'hideKpis':'showKpis')}
              title={showKpis ? (t('hideKpis') || 'Masquer les KPIs') : (t('showKpis') || 'Afficher les KPIs')}
              className="hidden md:inline-flex"
            >
              {showKpis ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setPlanModal(true)}>
              <CalendarDaysIcon />
              {t('dailyPlan') || 'Plan du jour'}
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href={`/${rid}/kitchen/lab`}>
                <SparklesIcon />
                {t('createWithLab')}
              </Link>
            </Button>
            {canManage && (
              <Button variant="primary" size="lg" onClick={() => setItemModal({ open: true })}>
                <PlusIcon />
                {t('newPreparation') || t('addPrepItem')}
              </Button>
            )}
          </>
        }
      />

      <FeatureIntro feature="prep" compactOnMobile />
      {error&&<div role="alert" className="mb-5 space-y-3 rounded-r-md border border-[var(--danger-500)]/30 bg-[var(--danger-50)] p-4"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button size="lg" variant="secondary" disabled={loading} onClick={()=>void reload().catch(()=>{})}>{t('retry')}</Button></div>}

      <header className="mb-[var(--s-4)]">
        {/* KPI strip — clickable shortcuts that set filters directly (mirrors Stock).
            Total cost stays static (info-only, like Stock's "Total Value"). */}
        {/* KPIs — desktop only (mobile keeps the table primary) */}
        {showKpis && (
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-6">
            <Kpi
              label={t('preparations')}
              value={items.length}
              sub={`${categoryNames.length} ${t('categoriesCount') || 'catégories'}`}
              onClick={() => filterByStatus(null)}
            />
            <Kpi
              label={t('totalCost') || 'Coût total en stock'}
              value={money(totalCost)}
              sub={t('prepValuationHint')}
            />
            <Kpi
              tone={expiringCount > 0 ? 'warning' : 'default'}
              label={t('expiringSoon') || 'À consommer bientôt'}
              value={expiringCount}
              sub={t('prepExpiryEstimate')}
              onClick={() => filterByStatus('expiring')}
            />
            <Kpi
              tone={expiredCount > 0 ? 'danger' : 'default'}
              label={t('expired') || 'Périmées'}
              value={expiredCount}
              sub={t('prepExpiryEstimate')}
              onClick={() => filterByStatus('expired')}
            />
          </div>
        )}

        {/* Bulk toolbar — orange banner matching Stock & Articles. */}
        {selected.size > 0 && (
          <div className="mb-4 p-4 bg-[var(--brand-soft)] border border-[var(--line-strong)] rounded-r-md flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[var(--brand-ink)]">
                {t('itemsSelected').replace('{count}', String(selected.size))}
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[var(--brand-ink)] min-h-11 text-sm font-medium"
              >
                {t('deselectAll') || 'Tout désélectionner'}
              </button>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2.5 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-md hover:bg-[var(--danger-50)] transition-colors flex items-center gap-2 text-sm font-medium text-[var(--danger-500)]"
                >
                  <TrashIcon className="w-4 h-4" />
                  {t('delete')} ({selected.size})
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search + filter pill-buttons row — matches Stock/Articles. */}
        <div className="flex flex-wrap items-center gap-[var(--s-3)]">
          <div className="relative flex-1 min-w-[240px]">
            <SearchIcon className="w-4 h-4 absolute start-4 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
            <input
              type="text"
              aria-label={t('searchPrepItems')}
              placeholder={t('searchPrepItems') || 'Rechercher une préparation…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-11 pe-3 h-11 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setCategoryDrawer({ open: true, mode: 'filter' })}
            className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm break-words font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors whitespace-nowrap"
          >
            <span className="text-[var(--fg-muted)]">{t('category')} ·</span>
            <span className="text-[var(--brand-ink)] font-semibold">
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
            className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm break-words font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors whitespace-nowrap"
          >
            {t('allFilters')}
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          <ActionsDropdown
            actions={[
              ...(canManage ? [{ label: t('importRecipe'), onClick: () => setImportModal(true), icon: <SparklesIcon className="w-4 h-4" /> }] : []),
              { label: t('refresh'), onClick: ()=>void reload().catch(()=>{}), icon: <RefreshCwIcon className="w-4 h-4" /> },
            ]}
          />
        </div>
      </header>

      {/* Category pills — rounded-r-lg CAPS rectangles (matches Stock/Articles). */}
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
                className={`inline-flex items-center min-h-11 px-[var(--s-4)] rounded-r-lg text-fs-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)] border border-[var(--brand-ink)]'
                    : 'bg-[var(--surface-2)] text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]'
                }`}
              >
                {name === ALL_PILL ? allLabel : name}
              </button>
            );
          })}
        </div>
      )}

      <p className="mb-4 text-sm text-fg-secondary">{t('prepExpiryHint')}</p>
      {/* Items table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <p className="text-base text-fg-secondary text-center max-w-md">
            {items.length === 0 ? t('addFirstPrepRecipe') : t('tryAdjustingFilters')}
          </p>
          {items.length === 0 && canManage && (
            <Button variant="primary" size="lg" onClick={() => setItemModal({ open: true })}>
              {t('addPrepItem')}
            </Button>
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
                  {t('item')}
                </SortableHeadCell>
                <DataTableHeadCell>{t('category')}</DataTableHeadCell>
                <SortableHeadCell
                  sortKey="quantity"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'quantity')}
                >
                  {t('stock')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="yield"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'yield')}
                >
                  {t('yieldPerBatch')}
                </SortableHeadCell>
                <SortableHeadCell
                  sortKey="shelf"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'shelf')}
                >
                  {t('shelfLife')}
                </SortableHeadCell>
                <DataTableHeadCell>{t('status')}</DataTableHeadCell>
                <DataTableHeadSpacerCell />
            </DataTableHead>
            <DataTableBody>
              {sorted.map((item, index) => {
                const low = isLow(item);
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
                        className="flex min-h-11 min-w-0 items-center gap-3 text-start hover:text-[var(--brand-ink)] transition-colors"
                      >
                        <div className="size-12 rounded-r-md bg-[var(--info-50)] flex items-center justify-center shrink-0">
                          <BeakerIcon className="w-5 h-5 text-[var(--info-500)]" />
                        </div>
                        <span className="break-words font-medium text-[var(--fg)]">
                          {item.name}
                        </span>
                      </button>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('category')}>
                      <span className="inline-flex items-center gap-[var(--s-2)] h-[22px] px-[var(--s-2)] bg-[var(--surface-2)] text-[var(--fg-muted)] rounded-r-sm text-fs-xs font-semibold uppercase tracking-[.02em] whitespace-nowrap">
                        {item.category || '—'}
                      </span>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('stock')} className="font-mono tabular-nums text-[var(--fg)]">
                      {item.quantity}{' '}
                      <span className="text-[var(--fg-muted)] text-xs">{item.unit}</span>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('yieldPerBatch')} className="font-mono tabular-nums text-[var(--fg)]">
                      {item.yield_per_batch > 0 ? `${item.yield_per_batch} ${item.unit}` : '—'}
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('shelfLife')} className="font-mono tabular-nums text-[var(--fg-muted)]">
                      {item.shelf_life_hours > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5 text-[var(--fg-subtle)]" />
                          {item.shelf_life_hours}h
                        </span>
                      ) : '—'}
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('status')}>
                      {low ? (
                        <span className="inline-flex items-center gap-1 text-[var(--danger-500)] text-xs font-medium">
                          <AlertTriangleIcon className="w-4 h-4" /> {t('low')}
                        </span>
                      ) : (
                        <span className="text-xs text-status-ready font-medium">{t('ok')}</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <RowActionsMenu label={`${t('actions')} — ${item.name}`}
                        actions={[
                          ...(canManage ? [
                            { label: t('produceBatch'), onClick: () => setBatchModal({ open: true, item }), icon: <PlayIcon className="w-4 h-4" /> },
                            { label: t('wasteAdjust'), onClick: () => setTxModal({ open: true, item }), icon: <ArrowRightLeftIcon className="w-4 h-4" /> },
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

      {/* Category drawer — same component Articles & Stock use.
          Create/edit back the prep_categories metadata table. */}
      <CategoryDrawer
        open={categoryDrawer.open}
        mode={categoryDrawer.mode}
        onClose={() => setCategoryDrawer({ open: false, mode: 'filter' })}
        categories={(() => {
          const seen = new Set<string>();
          const entries: Array<{ name: string; count: number }> = [];
          for (const name of [...categoryNames].sort()) {
            entries.push({
              name,
              count: items.filter((i) => i.category === name).length,
            });
            seen.add(name);
          }
          for (const m of categoryMeta) {
            if (seen.has(m.name)) continue;
            entries.push({ name: m.name, count: 0 });
          }
          return entries;
        })()}
        currentCategory={
          selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ''
        }
        onSelect={handleCategorySelect}
        onCreateCategory={canManage ? async ({name})=>{
          const created=await createPrepCategory(rid,{name});
          setCategoryMeta(previous=>previous.some(category=>category.name===created.name)?previous.map(category=>category.name===created.name?created:category):[...previous,created]);
        }:undefined}
        onEditCategory={canManage ? async (oldName,patch)=>{
          const existing=categoryMeta.find(category=>category.name===oldName);
          const ensured=existing??await createPrepCategory(rid,{name:oldName});
          if(!existing)setCategoryMeta(previous=>[...previous,ensured]);
          if(patch.name&&patch.name!==oldName){
            const renamed=await updatePrepCategory(rid,ensured.id,{name:patch.name});
            setCategoryMeta(previous=>previous.map(category=>category.name===oldName?renamed:category));
            setItems(previous=>previous.map(item=>item.category===oldName?{...item,category:renamed.name}:item));
            setSelectedCategories(previous=>new Set(Array.from(previous).map(name=>name===oldName?renamed.name:name)));
          }
        }:undefined}
      />

      <StockFiltersDrawer
        open={filtersDrawer.open}
        initialView={filtersDrawer.view}
        onClose={closeFiltersDrawer}
        categories={categories}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
        statuses={statuses}
        selectedStatuses={selectedStatuses}
        onStatusChange={setSelectedStatuses}
      />

      {removing&&<PrepDeleteDialog rid={rid} items={removing} onClose={()=>setRemoving(null)} onSaved={async()=>{await reload();setSelected(previous=>new Set(Array.from(previous).filter(id=>!removing.some(item=>item.id===id))));}}/>}
      {/* Modals */}
      {itemModal.open && (
        <PrepItemEditor rid={rid} editing={itemModal.editing} categories={categoryNames} stockItems={stockItems} onClose={() => setItemModal({ open: false })} onSaved={reload} />
      )}
      {importModal && (
        <RecipeImportModal
          rid={rid}
          mode={{ kind: 'prep' }}
          stockItems={stockItems}
          onClose={() => setImportModal(false)}
          onImported={reload}
        />
      )}
      {batchModal.open && batchModal.item && (
        <BatchProduceDialog rid={rid} item={batchModal.item} onClose={() => setBatchModal({ open: false })} onSaved={reload} />
      )}
      {txModal.open && txModal.item && (
        <PrepTransactionDialog rid={rid} item={txModal.item} onClose={() => setTxModal({ open: false })} onSaved={reload} />
      )}
      {planModal && (
        <DailyPrepPlanDialog rid={rid} onClose={() => setPlanModal(false)} />
      )}
    </div>
  );
}
