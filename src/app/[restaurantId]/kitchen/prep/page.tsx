'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  listPrepItems, listStockItems, createPrepItem, updatePrepItem, deletePrepItem,
  getPrepIngredients, setPrepIngredients, previewPrepBatch, producePrepBatch,
  getDailyPrepPlan, createPrepTransaction,
  getPrepCategories, createPrepCategory, updatePrepCategory, uploadPrepCategoryImage,
  PrepItem, PrepItemInput, PrepIngredientInput, PrepCategory,
  StockItem, StockUnit, ProduceBatchResult, DailyPlanItem, PrepTransactionType,
} from '@/lib/api';
import Modal from '@/components/Modal';
import FormModal from '@/components/FormModal';
import FormSection from '@/components/FormSection';
import SearchableListField from '@/components/SearchableListField';
import StatusPill from '@/components/StatusPill';
import StockItemPickerModal from '@/components/stock/StockItemPickerModal';
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
import { useI18n } from '@/lib/i18n';
import { Button, PageHead } from '@/components/ds';
import RecipeImportModal from '../RecipeImportModal';
import { FullScreenEditor, EditorSectionHead, Badge, Field, Input, Textarea } from '@/components/ds';
import { Layers as LayersIcon } from 'lucide-react';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function PrepPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const deepLinkAppliedRef = useRef(false);

  const [items, setItems] = useState<PrepItem[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

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
  const reloadCategoryMeta = useCallback(async () => {
    const cats = await getPrepCategories(rid);
    setCategoryMeta(cats);
  }, [rid]);

  // Modals
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: PrepItem }>({ open: false });
  const [batchModal, setBatchModal] = useState<{ open: boolean; item?: PrepItem }>({ open: false });
  const [txModal, setTxModal] = useState<{ open: boolean; item?: PrepItem }>({ open: false });
  const [planModal, setPlanModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [prepItems, rawItems, cats] = await Promise.all([
        listPrepItems(rid),
        listStockItems(rid),
        getPrepCategories(rid),
      ]);
      setItems(prepItems);
      setStockItems(rawItems);
      setCategoryMeta(cats);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

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
  ];

  const isLow = (item: PrepItem) =>
    item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold;

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !selectedCategories.has(item.category)) return false;
    if (selectedStatuses.size > 0) {
      const s = isLow(item) ? 'low' : 'ok';
      if (!selectedStatuses.has(s)) return false;
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

  const lowCount = items.filter(isLow).length;

  const handleDelete = async (id: number) => {
    if (!confirm(t('deletePrepItemConfirm'))) return;
    await deletePrepItem(rid, id);
    reload();
  };

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
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(t('bulkDeleteConfirm').replace('{count}', String(selected.size)))) return;
    for (const id of Array.from(selected)) {
      await deletePrepItem(rid, id);
    }
    setSelected(new Set());
    reload();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // KPI derivations — used by the collapsible KPI row.
  const totalCost = items.reduce(
    (s, p) => s + (p.cost_per_unit ?? 0) * (p.quantity ?? 0),
    0,
  );
  const now = Date.now();
  const shelfMs = (p: PrepItem) => (p.shelf_life_hours ?? 0) * 3600 * 1000;
  const updatedMs = (p: PrepItem) => new Date(p.updated_at).getTime();
  const expiresAt = (p: PrepItem) => updatedMs(p) + shelfMs(p);
  const isExpiring = (p: PrepItem) =>
    p.shelf_life_hours > 0 && expiresAt(p) - now < 48 * 3600 * 1000 && expiresAt(p) > now;
  const isExpired = (p: PrepItem) => p.shelf_life_hours > 0 && expiresAt(p) <= now;
  const expiringCount = items.filter(isExpiring).length;
  const expiredCount = items.filter(isExpired).length;

  // Category pill list — "Tous" first, then distinct names alphabetically.
  const pillCategories = ['Tous', ...[...categoryNames].sort()];
  const activePill =
    selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : 'Tous';
  const selectPill = (name: string) => {
    if (name === 'Tous') setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
  };

  return (
    <div className="flex flex-col">
      <PageHead
        title={t('preparations') || 'Préparations'}
        desc={`${t('preparationsDesc') || 'Sous-recettes et bases réutilisées dans vos plats'} · ${items.length} ${t('activePreparations') || 'préparations actives'}`}
        actions={
          <>
            <Button
              variant="ghost"
              size="md"
              icon
              onClick={() => setShowKpis((v) => !v)}
              aria-label="Toggle KPIs"
              title={showKpis ? (t('hideKpis') || 'Masquer les KPIs') : (t('showKpis') || 'Afficher les KPIs')}
            >
              {showKpis ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setPlanModal(true)}>
              <CalendarDaysIcon />
              {t('dailyPlan') || 'Plan du jour'}
            </Button>
            <Button variant="primary" size="md" onClick={() => setItemModal({ open: true })}>
              <PlusIcon />
              {t('newPreparation') || t('addPrepItem')}
            </Button>
          </>
        }
      />

      <header className="mb-[var(--s-4)]">
        {/* KPI strip — Actives / Coût total / À consommer bientôt / Périmées */}
        {showKpis && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)] mb-6">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)]">
              <p className="text-fs-xs text-[var(--fg-muted)] uppercase tracking-[.06em] font-medium">
                {t('activePreps') || 'Préparations actives'}
              </p>
              <p className="text-fs-3xl font-semibold leading-none text-[var(--fg)] tabular-nums">
                {items.length}
              </p>
              <p className="text-fs-xs text-[var(--fg-subtle)]">
                {categoryNames.length} {t('categoriesCount') || 'catégories'}
              </p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)]">
              <p className="text-fs-xs text-[var(--fg-muted)] uppercase tracking-[.06em] font-medium">
                {t('totalCost') || 'Coût total en stock'}
              </p>
              <p className="text-fs-3xl font-semibold leading-none text-[var(--fg)] tabular-nums">
                ₪{Math.round(totalCost).toLocaleString()}
                <span className="text-fs-lg text-[var(--fg-muted)] font-medium">
                  .{String(Math.round((totalCost % 1) * 100)).padStart(2, '0')}
                </span>
              </p>
              <p className="text-fs-xs text-[var(--fg-subtle)]">HT · basé sur recettes</p>
            </div>
            <div
              className="rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)]"
              style={{
                background: 'color-mix(in oklab, var(--warning-500) 8%, var(--surface))',
                border: '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))',
              }}
            >
              <p className="text-fs-xs text-[var(--fg-muted)] uppercase tracking-[.06em] font-medium">
                {t('expiringSoon') || 'À consommer bientôt'}
              </p>
              <p className="text-fs-3xl font-semibold leading-none text-[var(--warning-500)] tabular-nums">
                {expiringCount}
              </p>
              <p className="text-fs-xs text-[var(--warning-500)]">
                {t('shelfUnder48h') || 'DLC < 48h'}
              </p>
            </div>
            <div
              className="rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)]"
              style={{
                background: 'color-mix(in oklab, var(--danger-500) 6%, var(--surface))',
                border: '1px solid color-mix(in oklab, var(--danger-500) 25%, var(--line))',
              }}
            >
              <p className="text-fs-xs text-[var(--fg-muted)] uppercase tracking-[.06em] font-medium">
                {t('expired') || 'Périmées'}
              </p>
              <p className="text-fs-3xl font-semibold leading-none text-[var(--danger-500)] tabular-nums">
                {expiredCount}
              </p>
              <p className="text-fs-xs text-[var(--danger-500)]">
                {t('toDiscard') || 'À jeter'}
              </p>
            </div>
          </div>
        )}

        {/* Bulk toolbar — orange banner matching Stock & Articles. */}
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
                onClick={handleBulkDelete}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400"
              >
                <TrashIcon className="w-4 h-4" />
                {t('delete')} ({selected.size})
              </button>
            </div>
          </div>
        )}

        {/* Search + filter pill-buttons row — matches Stock/Articles. */}
        <div className="flex flex-wrap items-center gap-[var(--s-3)]">
          <div className="relative flex-1 min-w-[240px]">
            <SearchIcon className="w-4 h-4 absolute start-4 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder={t('searchPrepItems') || 'Rechercher une préparation…'}
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
            className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors whitespace-nowrap"
          >
            {t('allFilters')}
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          <ActionsDropdown
            actions={[
              { label: t('importRecipe'), onClick: () => setImportModal(true), icon: <SparklesIcon className="w-4 h-4" /> },
              { label: t('refresh'), onClick: reload, icon: <RefreshCwIcon className="w-4 h-4" /> },
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
                className={`inline-flex items-center h-10 px-[var(--s-4)] rounded-r-lg text-fs-sm font-semibold uppercase tracking-[.02em] transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--brand-500)] text-white shadow-1'
                    : 'bg-[var(--surface-2)] text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]'
                }`}
              >
                {name === 'Tous' ? t('all') || 'Tous' : name}
              </button>
            );
          })}
        </div>
      )}

      {/* Items table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <p className="text-base text-fg-secondary text-center max-w-md">
            {items.length === 0 ? t('addFirstPrepRecipe') : t('tryAdjustingFilters')}
          </p>
          {items.length === 0 && (
            <Button variant="primary" size="md" onClick={() => setItemModal({ open: true })}>
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
                    <DataTableCell>
                      <button
                        type="button"
                        onClick={() => setItemModal({ open: true, editing: item })}
                        className="flex items-center gap-3 text-left hover:text-orange-500 transition-colors"
                      >
                        <div className="size-12 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800 flex items-center justify-center shrink-0">
                          <BeakerIcon className="w-5 h-5 text-orange-600 dark:text-orange-200" />
                        </div>
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {item.name}
                        </span>
                      </button>
                    </DataTableCell>
                    <DataTableCell>
                      <span className="inline-flex items-center gap-[var(--s-2)] h-[22px] px-[var(--s-2)] bg-[var(--surface-2)] text-[var(--fg-muted)] rounded-r-sm text-fs-xs font-semibold uppercase tracking-[.02em] whitespace-nowrap">
                        {item.category || '—'}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="font-mono tabular-nums text-neutral-900 dark:text-white">
                      {item.quantity}{' '}
                      <span className="text-neutral-500 dark:text-neutral-400 text-xs">{item.unit}</span>
                    </DataTableCell>
                    <DataTableCell className="font-mono tabular-nums text-neutral-900 dark:text-white">
                      {item.yield_per_batch > 0 ? `${item.yield_per_batch} ${item.unit}` : '—'}
                    </DataTableCell>
                    <DataTableCell className="font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                      {item.shelf_life_hours > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5 text-neutral-400" />
                          {item.shelf_life_hours}h
                        </span>
                      ) : '—'}
                    </DataTableCell>
                    <DataTableCell>
                      {low ? (
                        <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium">
                          <AlertTriangleIcon className="w-4 h-4" /> {t('low')}
                        </span>
                      ) : (
                        <span className="text-xs text-status-ready font-medium">{t('ok')}</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <RowActionsMenu
                        actions={[
                          { label: t('produceBatch'), onClick: () => setBatchModal({ open: true, item }), icon: <PlayIcon className="w-4 h-4" /> },
                          { label: t('wasteAdjust'), onClick: () => setTxModal({ open: true, item }), icon: <ArrowRightLeftIcon className="w-4 h-4" /> },
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

      {/* Category drawer — same component Articles & Stock use.
          Create/edit back the prep_categories metadata table. */}
      <CategoryDrawer
        open={categoryDrawer.open}
        mode={categoryDrawer.mode}
        onClose={() => setCategoryDrawer({ open: false, mode: 'filter' })}
        categories={(() => {
          const metaByName = new Map(categoryMeta.map((m) => [m.name, m]));
          const seen = new Set<string>();
          const entries: Array<{
            name: string;
            count: number;
            color?: string;
            imageUrl?: string;
          }> = [];
          for (const name of [...categoryNames].sort()) {
            const m = metaByName.get(name);
            entries.push({
              name,
              count: items.filter((i) => i.category === name).length,
              color: m?.color,
              imageUrl: m?.image_url || undefined,
            });
            seen.add(name);
          }
          for (const m of categoryMeta) {
            if (seen.has(m.name)) continue;
            entries.push({
              name: m.name,
              count: 0,
              color: m.color,
              imageUrl: m.image_url || undefined,
            });
          }
          return entries;
        })()}
        currentCategory={
          selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ''
        }
        onSelect={handleCategorySelect}
        onCreateCategory={async ({ name, imageFile }) => {
          const cat = await createPrepCategory(rid, { name });
          if (imageFile) {
            await uploadPrepCategoryImage(rid, cat.id, imageFile);
          }
          await reload();
        }}
        onEditCategory={async (oldName, patch) => {
          const existing = categoryMeta.find((c) => c.name === oldName);
          const ensured = existing ?? (await createPrepCategory(rid, { name: oldName }));
          if (patch.name && patch.name !== oldName) {
            await updatePrepCategory(rid, ensured.id, { name: patch.name });
          }
          if (patch.imageFile) {
            await uploadPrepCategoryImage(rid, ensured.id, patch.imageFile);
          }
          await reload();
        }}
        supportsImage
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

      {/* Modals */}
      {itemModal.open && (
        <PrepItemModal rid={rid} editing={itemModal.editing} categories={categoryNames} stockItems={stockItems} onClose={() => setItemModal({ open: false })} onSaved={reload} />
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

// ─── Prep Item Create/Edit Modal (with inline ingredients) ─────────────────

function PrepItemModal({
  rid, editing, categories, stockItems, onClose, onSaved,
}: {
  rid: number; editing?: PrepItem; categories: string[]; stockItems: StockItem[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [unit, setUnit] = useState<StockUnit>(editing?.unit ?? 'unit');
  const [quantity, setQuantity] = useState(editing?.quantity ?? 0);
  const [yieldPerBatch, setYieldPerBatch] = useState(editing?.yield_per_batch ?? 0);
  const [reorder, setReorder] = useState(editing?.reorder_threshold ?? 0);
  const [shelfLife, setShelfLife] = useState(editing?.shelf_life_hours ?? 0);
  const [category, setCategory] = useState(editing?.category ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  const [ingredients, setIngredients] = useState<PrepIngredientInput[]>([]);
  const [loadingIngs, setLoadingIngs] = useState(!!editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    getPrepIngredients(rid, editing.id)
      .then((ings) => setIngredients(ings.map((i) => ({
        stock_item_id: i.stock_item_id,
        quantity_needed: Math.round(i.quantity_needed * 10000) / 10000,
      }))))
      .finally(() => setLoadingIngs(false));
  }, [rid, editing]);

  const removeIngredient = (idx: number) => setIngredients(ingredients.filter((_, i) => i !== idx));
  const updateIngredient = (idx: number, patch: Partial<PrepIngredientInput>) => {
    setIngredients(ingredients.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'add' | 'swap'>('add');
  const [pickerSwapIdx, setPickerSwapIdx] = useState<number | null>(null);

  const openAddPicker = () => {
    setPickerMode('add');
    setPickerSwapIdx(null);
    setPickerOpen(true);
  };
  const openSwapPicker = (idx: number) => {
    setPickerMode('swap');
    setPickerSwapIdx(idx);
    setPickerOpen(true);
  };
  const onPickerConfirm = (ids: number[]) => {
    if (pickerMode === 'swap' && pickerSwapIdx != null) {
      if (ids[0] != null) updateIngredient(pickerSwapIdx, { stock_item_id: ids[0] });
    } else {
      setIngredients((prev) => [
        ...prev,
        ...ids.map((id) => ({ stock_item_id: id, quantity_needed: 0 })),
      ]);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload: PrepItemInput = {
        name, unit, quantity, yield_per_batch: yieldPerBatch,
        reorder_threshold: reorder, shelf_life_hours: shelfLife,
        category, notes, is_active: isActive,
      };
      let itemId: number;
      if (editing) {
        await updatePrepItem(rid, editing.id, payload);
        itemId = editing.id;
      } else {
        const created = await createPrepItem(rid, payload);
        itemId = created.id;
      }
      if (ingredients.length > 0) {
        await setPrepIngredients(rid, itemId, ingredients);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Per-unit cost estimate for the rail hero
  const costTotal = ingredients.reduce((s, ing) => {
    const si = stockItems.find((x) => x.id === ing.stock_item_id);
    return s + (si?.cost_per_unit ?? 0) * (ing.quantity_needed ?? 0);
  }, 0);
  const perUnit = yieldPerBatch > 0 ? costTotal / yieldPerBatch : 0;

  const rail = (
    <>
      {/* Icon tile instead of photo */}
      <div
        className="w-full aspect-square rounded-r-lg grid place-items-center text-white"
        style={{ background: 'linear-gradient(135deg, var(--brand-700), var(--brand-900))' }}
      >
        <LayersIcon className="w-20 h-20" strokeWidth={1.5} />
      </div>

      <div className="mt-[var(--s-4)]">
        <div className="text-fs-xl font-semibold -tracking-[0.01em] text-[var(--fg)]">
          {name || (t('addPrepItem') || 'Nouvelle préparation')}
        </div>
        <div className="flex items-center gap-[var(--s-2)] mt-1.5">
          {category && <Badge tone="neutral">{category.toUpperCase()}</Badge>}
          <Badge tone={isActive ? 'success' : 'neutral'} dot>
            {isActive ? (t('fresh') || 'Frais') : t('inactive')}
          </Badge>
        </div>
      </div>

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Cost summary — key metric */}
      <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-3)]">
        {t('costPerUnit') || 'Coût de revient'}
      </div>
      <div className="flex items-baseline gap-1 font-display text-fs-2xl font-semibold tabular-nums -tracking-[0.02em]">
        ₪{perUnit.toFixed(2)}
        <span className="text-fs-sm text-[var(--fg-muted)] font-normal font-sans">/ {unit}</span>
      </div>
      <div className="text-fs-xs text-[var(--fg-subtle)] mt-1">
        {t('yieldLabel') || 'Rendement'} {yieldPerBatch || 0} {unit} · {t('totalLabel') || 'total'} ₪{costTotal.toFixed(2)}
      </div>

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Status toggle */}
      <div className="flex items-center justify-between">
        <span className="text-fs-sm text-[var(--fg-muted)]">{t('status')}</span>
        <StatusPill
          active={isActive}
          onToggle={() => setIsActive(!isActive)}
          activeLabel={t('active')}
          inactiveLabel={t('inactive')}
        />
      </div>

      {editing && (
        <>
          <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />
          {/* Utilisation summary */}
          <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-3)]">
            {t('usageHeader') || 'Utilisation'}
          </div>
          <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">{t('ingredientsCount') || 'Ingrédients'}</span>
              <span className="font-mono tabular-nums">{ingredients.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">{t('lastUpdated') || 'Dernière MAJ'}</span>
              <span className="text-fs-xs">
                {new Date(editing.updated_at).toLocaleDateString()}
              </span>
            </div>
            {editing.shelf_life_hours > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--fg-muted)]">{t('shelfLifeHours') || 'DLC'}</span>
                <span className="font-mono tabular-nums text-fs-xs">
                  {editing.shelf_life_hours}h
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />

      {/* Notes */}
      <div className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)] mb-[var(--s-2)]">
        {t('notes')}
      </div>
      <Textarea
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('notes')}
        className="text-fs-sm"
      />

      {editing && (
        <>
          <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />
          {/* Quick actions — reference has Dupliquer + Archiver ghost buttons */}
          <div className="flex flex-col gap-[var(--s-2)]">
            <button
              type="button"
              onClick={async () => {
                if (!editing) return;
                try {
                  const payload: PrepItemInput = {
                    name: `${name} (copie)`,
                    unit,
                    quantity: 0,
                    yield_per_batch: yieldPerBatch,
                    reorder_threshold: reorder,
                    shelf_life_hours: shelfLife,
                    category,
                    notes,
                    is_active: false,
                  };
                  const created = await createPrepItem(rid, payload);
                  if (ingredients.length > 0) {
                    await setPrepIngredients(rid, created.id, ingredients);
                  }
                  onSaved();
                  onClose();
                } catch (err: any) {
                  alert(err.message);
                }
              }}
              className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-8 rounded-r-md text-fs-sm font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] transition-colors self-start"
            >
              <LayersIcon className="w-3.5 h-3.5" />
              {t('duplicate') || 'Dupliquer'}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!editing) return;
                if (!confirm(t('deletePrepItemConfirm'))) return;
                try {
                  await deletePrepItem(rid, editing.id);
                  onSaved();
                  onClose();
                } catch (err: any) {
                  alert(err.message);
                }
              }}
              className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-8 rounded-r-md text-fs-sm font-medium text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors self-start"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              {t('archive') || 'Archiver'}
            </button>
          </div>
        </>
      )}
    </>
  );

  return (
    <FullScreenEditor
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={editing ? t('editPrepItem') : t('addPrepItem')}
      subtitle={editing ? `${t('editingItem') || 'Modification'} · ${editing.name}` : undefined}
      onSave={handleSubmit}
      saveLabel={editing ? t('update') : t('create')}
      saveDisabled={!name.trim() || saving}
      cancelLabel={t('cancel')}
      rail={rail}
    >
      <div className="max-w-3xl">
        <EditorSectionHead title={t('identityAndYield') || 'Identité & rendement'} />

        {/* Name */}
        <div className="mb-[var(--s-5)]">
          <Field label={t('nameLabel') || "Nom de la préparation"}>
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
            <Field label={t('category')}>
              <SearchableListField
                mode="single"
                allowCustom
                placeholder={t('category')}
                options={categories.map((c) => ({ value: c, label: c }))}
                value={category}
                onChange={setCategory}
              />
            </Field>
            <Field label={t('shelfLifeHours') || 'DLC (heures)'}>
              <Input
                type="number"
                value={shelfLife || ''}
                onChange={(e) => setShelfLife(+e.target.value)}
              />
            </Field>
            <Field label={t('reorderThreshold') || 'Seuil'}>
              <Input
                type="number"
                step="any"
                value={reorder || ''}
                onChange={(e) => setReorder(+e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Yield + quantity */}
        <div className="mb-[var(--s-5)]">
          <h3 className="text-fs-sm font-semibold text-[var(--fg)] mb-[var(--s-3)]">
            {t('yieldAndStock') || 'Rendement & stock'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-3)]">
            <Field label={t('unitLabel') || 'Unité'}>
              <select
                className="h-9 w-full px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value as StockUnit)}
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label={t('yieldPerBatchLabel') || 'Rendement / batch'}>
              <Input
                type="number"
                step="any"
                value={yieldPerBatch || ''}
                onChange={(e) => setYieldPerBatch(+e.target.value)}
              />
            </Field>
            <Field label={t('currentStock') || 'Stock actuel'}>
              <Input
                type="number"
                step="any"
                value={quantity || ''}
                onChange={(e) => setQuantity(+e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Ingredients — 3px brand accent matches reference */}
        <EditorSectionHead
          title={t('prepRecipeSection') || 'Ingrédients'}
          desc={
            (yieldPerBatch ?? 0) > 0
              ? t('rawIngredientsDesc').replace('{yield}', String(yieldPerBatch)).replace('{unit}', unit)
              : undefined
          }
          aside={
            <button
              type="button"
              onClick={openAddPicker}
              className="inline-flex items-center gap-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {t('addIngredient')}
            </button>
          }
        />
        {(yieldPerBatch ?? 0) > 0 && (
          <p className="text-fs-xs text-[var(--fg-muted)] -mt-[var(--s-3)] mb-[var(--s-3)]">
            {/* absorbed into EditorSectionHead desc above */}
          </p>
        )}
        {loadingIngs ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-2">
            {ingredients.map((ing, idx) => {
              const si = stockItems.find((s) => s.id === ing.stock_item_id);
              const qtyStr = ing.quantity_needed
                ? String(Math.round(ing.quantity_needed * 10000) / 10000)
                : '';
              return (
                <div key={idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openSwapPicker(idx)}
                    className="flex-1 min-w-0 flex items-center gap-3 px-2 py-1.5 rounded-lg border border-[var(--divider)] hover:border-brand-500 hover:bg-brand-500/5 transition-colors text-left"
                  >
                    {si?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={si.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5 text-fg-tertiary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg-primary truncate">
                        {si?.name || '—'}
                      </div>
                      <div className="text-xs text-fg-secondary truncate">
                        {si ? `${si.category || '—'} · ${si.unit}` : ''}
                      </div>
                    </div>
                  </button>
                  <div className="relative w-32 shrink-0">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="input w-full text-sm text-right pr-9"
                      value={qtyStr}
                      onChange={(e) => updateIngredient(idx, { quantity_needed: +e.target.value })}
                      placeholder={t('qty')}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-secondary pointer-events-none">
                      {si?.unit || ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeIngredient(idx)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                    aria-label={t('delete')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pickerOpen && (
        <StockItemPickerModal
          stockItems={stockItems}
          mode={pickerMode}
          excludeIds={
            pickerMode === 'add'
              ? new Set(ingredients.map((i) => i.stock_item_id))
              : undefined
          }
          initialSelectedId={
            pickerMode === 'swap' && pickerSwapIdx != null
              ? ingredients[pickerSwapIdx]?.stock_item_id
              : undefined
          }
          onConfirm={onPickerConfirm}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </FullScreenEditor>
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
          (() => {
            const previewIngredients = preview.ingredients ?? [];
            const previewInsufficient = preview.insufficient ?? [];
            return (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-fg-primary">{t('ingredientsToConsume')}</p>
                  {previewIngredients.map((ing) => (
                    <div key={ing.stock_item_id} className="flex justify-between text-sm">
                      <span className="text-fg-secondary">{ing.stock_item_name}</span>
                      <span className="font-mono text-fg-primary">-{ing.quantity_used.toFixed(2)} (rem: {ing.remaining.toFixed(2)})</span>
                    </div>
                  ))}
                </div>

                {previewInsufficient.length > 0 && (
                  <div className="bg-red-500/10 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-medium text-red-500 flex items-center gap-1">
                      <AlertTriangleIcon className="w-4 h-4" /> {t('insufficientStock')}
                    </p>
                    {previewInsufficient.map((s) => (
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
                  <button onClick={handleProduce} disabled={loading || previewInsufficient.length > 0} className="btn-primary text-sm">
                    {loading ? t('producing') : t('confirmProduce')}
                  </button>
                </div>
              </>
            );
          })()
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
