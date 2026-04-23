'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteMenuItem, createMenuItem, createCategory,
  MenuCategory, MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MoreVertical,
  Eye,
  Tag,
  Trash2,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import KPIInfoModal, { KPI_INFO } from '@/components/common/KPIInfoModal';
import StockFiltersDrawer, { FilterView } from '@/components/stock/StockFiltersDrawer';
import ArticlesKpiRow from '@/components/menu/ArticlesKpiRow';
import CategoryDrawer from '@/components/menu/CategoryDrawer';
import { Checkbox } from '@/components/ui/checkbox';
import { Button, Chip, InputGroup, PageHead } from '@/components/ds';

// ─── Flat item with category name for table display ────────────────────────

interface FlatItem extends MenuItem {
  category_name: string;
}

function flattenItems(categories: MenuCategory[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const cat of categories) {
    for (const item of cat.items ?? []) {
      items.push({ ...item, category_name: cat.name });
    }
  }
  return items;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

/**
 * Stash an item in sessionStorage before navigating to the edit route.
 * The edit page hydrates from this cache on first render so the modal opens
 * populated instantly — mirrors the stock-editor UX which passes StockItem
 * inline without a fetch. Background refresh still runs for freshness.
 */
function openEditor(item: FlatItem, rid: number, router: ReturnType<typeof useRouter>) {
  try {
    sessionStorage.setItem(`foody.menuItem.${item.id}`, JSON.stringify(item));
  } catch {
    /* quota or SSR — fall through */
  }
  router.push(`/${rid}/menu/items/${item.id}`);
}

export default function ItemLibraryPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state — persisted to sessionStorage so navigating to the item
  // editor and back doesn't reset the user's search/filter/page. Only live
  // within this browser tab; a true new page load starts fresh.
  const FILTER_KEY = `foody.library.filters.${rid}`;
  const hydratedFilters = (() => {
    if (typeof window === 'undefined') {
      return { search: '', cats: [] as string[], statuses: ['active'] as string[], page: 1 };
    }
    try {
      const raw = sessionStorage.getItem(FILTER_KEY);
      if (!raw) return { search: '', cats: [] as string[], statuses: ['active'] as string[], page: 1 };
      const parsed = JSON.parse(raw) as {
        search?: string;
        cats?: string[];
        statuses?: string[];
        page?: number;
      };
      return {
        search: parsed.search ?? '',
        cats: Array.isArray(parsed.cats) ? parsed.cats : [],
        statuses: Array.isArray(parsed.statuses) ? parsed.statuses : ['active'],
        page: typeof parsed.page === 'number' ? parsed.page : 1,
      };
    } catch {
      return { search: '', cats: [] as string[], statuses: ['active'] as string[], page: 1 };
    }
  })();

  // Filters
  const [search, setSearch] = useState(hydratedFilters.search);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(hydratedFilters.cats),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    () => new Set(hydratedFilters.statuses),
  );
  const [filtersDrawer, setFiltersDrawer] = useState<{ open: boolean; view: FilterView }>({
    open: false,
    view: 'index',
  });
  const openFiltersDrawer = (view: FilterView) => setFiltersDrawer({ open: true, view });
  const closeFiltersDrawer = () => setFiltersDrawer((prev) => ({ ...prev, open: false }));

  // Figma CategoryDrawer — serves two modes:
  //   1. filter: clicking the "Catégorie:" header button OR the drawer's bulk
  //      button when no rows are selected → filter the list to one category.
  //   2. bulk-assign: clicking "Assigner une catégorie" in the bulk toolbar
  //      while rows are selected → patch category_id on each selected item.
  const [categoryDrawer, setCategoryDrawer] = useState<{ open: boolean; mode: 'filter' | 'bulk-assign' }>({
    open: false,
    mode: 'filter',
  });
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // KPI collapse + info modal — Figma App.tsx:552, 570
  const [showKpis, setShowKpis] = useState(true);
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);

  // Sort
  type SortKey = 'name' | 'price';
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

  // Selection for checkboxes
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Pagination
  const [page, setPage] = useState(hydratedFilters.page);

  // Persist filter snapshot on every change so it survives edit→list round-trips.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        FILTER_KEY,
        JSON.stringify({
          search,
          cats: Array.from(selectedCategories),
          statuses: Array.from(selectedStatuses),
          page,
        }),
      );
    } catch {
      /* quota — ignore */
    }
  }, [FILTER_KEY, search, selectedCategories, selectedStatuses, page]);

  // Variant accordion
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => setExpandedItemIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // Quick create
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [qcName, setQcName] = useState('');
  const [qcPrice, setQcPrice] = useState('');
  const [qcCategoryId, setQcCategoryId] = useState(0);
  const [qcSaving, setQcSaving] = useState(false);

  // ─── Data loading ─────────────────────────────────────────────────

  const reload = useCallback(() => {
    return getAllCategories(rid).then(setCategories).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // ─── Derived data ─────────────────────────────────────────────────

  const allItems = flattenItems(categories);
  const filtered = allItems.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !selectedCategories.has(item.category_name)) return false;
    if (selectedStatuses.size > 0) {
      const itemStatus = item.is_active ? 'active' : 'inactive';
      if (!selectedStatuses.has(itemStatus)) return false;
    }
    return true;
  });

  const categoryOptions = Array.from(new Set(categories.map((c) => c.name))).map((name) => ({ name }));

  // Sort items. Variant items (no base price) are treated as 0 for price sorting,
  // keeping them grouped at one end rather than scattered.
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
    return ((a.price ?? 0) - (b.price ?? 0)) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, selectedCategories, selectedStatuses, sortKey, sortDir]);

  // ─── Item actions ─────────────────────────────────────────────────

  const handleDeleteItem = async (id: number) => {
    if (!confirm(t('delete') + '?')) return;
    await deleteMenuItem(rid, id);
    reload();
  };

  const handleToggleAvailability = async (item: FlatItem) => {
    await updateMenuItem(rid, item.id, { is_active: !item.is_active });
    reload();
  };

  const toggleSelectAll = () => {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((i) => i.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // ─── Bulk actions ────────────────────────────────────────────────

  const handleBulkAssignCategory = async (category: MenuCategory) => {
    if (selected.size === 0) return;
    setBulkProcessing(true);
    try {
      // Bare-fetch API, no bulk endpoint — iterate sequentially so errors stop
      // the chain and we can surface the first failure. Backend order doesn't
      // matter for this mutation.
      for (const id of Array.from(selected)) {
        await updateMenuItem(rid, id, { category_id: category.id });
      }
      setSelected(new Set());
      setCategoryDrawer({ open: false, mode: 'filter' });
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign category');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const confirmMsg = (t('confirmBulkDelete') || 'Delete {n} selected item(s)?').replace(
      '{n}',
      String(selected.size),
    );
    if (!confirm(confirmMsg)) return;
    setBulkProcessing(true);
    try {
      for (const id of Array.from(selected)) {
        await deleteMenuItem(rid, id);
      }
      setSelected(new Set());
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleCreateCategory = async (name: string) => {
    await createCategory(rid, { name });
    await reload();
  };

  const handleCategorySelect = (category: MenuCategory | null) => {
    if (categoryDrawer.mode === 'bulk-assign') {
      if (category) handleBulkAssignCategory(category);
      return;
    }
    // Filter mode
    if (category === null) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set([category.name]));
    }
    setCategoryDrawer({ open: false, mode: 'filter' });
  };

  const handleQuickCreate = async () => {
    if (!qcName.trim()) return;
    setQcSaving(true);
    try {
      await createMenuItem(rid, {
        name: qcName.trim(),
        price: parseFloat(qcPrice) || 0,
        category_id: qcCategoryId || categories[0]?.id,
        is_active: true,
      });
      setQcName('');
      setQcPrice('');
      setQcCategoryId(0);
      setQuickCreateOpen(false);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setQcSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const selectionCount = selected.size;
  const MIN_COMPARE = 2;
  const MAX_COMPARE = 6;
  const compareDisabled = selectionCount < MIN_COMPARE || selectionCount > MAX_COMPARE;
  const compareHint =
    selectionCount > 0
      ? selectionCount < MIN_COMPARE
        ? t('compareMinHint') || 'Select at least 2 items to compare'
        : selectionCount > MAX_COMPARE
          ? t('compareMaxHint') || 'Select up to 6 items'
          : ''
      : '';
  const goCompare = () => {
    if (compareDisabled) return;
    const ids = Array.from(selected).join(',');
    router.push(`/${rid}/menu/items/compare?ids=${ids}`);
  };

  // Category pills — the top-level quick filter (single-select pattern from Figma).
  // "Tous" clears the category filter. Any category pill toggles that single category.
  const pillCategories = ['Tous', ...categoryOptions.map((c) => c.name)];
  const activePillName =
    selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : 'Tous';
  const selectPill = (name: string) => {
    if (name === 'Tous') setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
  };

  return (
    <div className="flex flex-col">
      <PageHead
        title={t('itemLibrary')}
        desc={`${allItems.length} articles · ${categories.length} catégories`}
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
              {showKpis ? <ChevronUp /> : <ChevronDown />}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => router.push(`/${rid}/menu/items/new`)}
            >
              <Plus />
              {t('createItem')}
            </Button>
          </>
        }
      />

      {/* Legacy header wrapper — kept for layout, stripped of styling */}
      <header className="mb-[var(--s-4)]">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap hidden">
          <div />
        </div>

        {/* KPI row */}
        {showKpis && (
          <div className="mb-6">
            <ArticlesKpiRow
              items={allItems}
              categoriesCount={categories.length}
              onKpiClick={setSelectedKpi}
            />
          </div>
        )}

        {/* Bulk selection toolbar — Figma App.tsx:497-523 */}
        {selectionCount > 0 && (
          <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-orange-900 dark:text-orange-300">
                {selectionCount} {t('selectedItems') || 'article'}{selectionCount > 1 ? 's' : ''} {t('selectedSuffix') || 'sélectionné'}{selectionCount > 1 ? 's' : ''}
              </span>
              {compareHint && (
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {compareHint}
                </span>
              )}
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
                disabled={bulkProcessing}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-50"
              >
                <Tag size={16} />
                {t('assignCategory') || 'Assigner une catégorie'}
              </button>
              <button
                onClick={goCompare}
                disabled={compareDisabled || bulkProcessing}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title={compareHint || undefined}
              >
                {t('compareCosts') || 'Compare costs'}
                {!compareDisabled && ` (${selectionCount})`}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkProcessing}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
              >
                <Trash2 size={16} />
                {t('delete') || 'Supprimer'}
              </button>
            </div>
          </div>
        )}

        {/* Search + filter chips row — matches Stock's layout */}
        <div className="flex flex-wrap items-center gap-[var(--s-3)] mt-[var(--s-4)]">
          <div className="w-80">
            <InputGroup
              leading={<Search />}
              inputProps={{
                placeholder: t('search') || 'Rechercher',
                value: search,
                onChange: (e) => setSearch(e.target.value),
              }}
            />
          </div>

          <Chip onClick={() => setCategoryDrawer({ open: true, mode: 'filter' })}>
            {t('category')} ·{' '}
            <span className="opacity-70">
              {selectedCategories.size === 0
                ? t('all')
                : selectedCategories.size === 1
                  ? Array.from(selectedCategories)[0]
                  : selectedCategories.size}
            </span>
            <ChevronDown className="w-3 h-3" />
          </Chip>

          <Chip onClick={() => openFiltersDrawer('index')}>
            {t('allFilters')}
            <ChevronDown className="w-3 h-3" />
          </Chip>

          <div className="flex-1" />

          <ActionsDropdown actions={[{ label: t('refresh'), onClick: reload }]} />
        </div>
      </header>

      {/* Category pills — .chip pattern, flat row */}
      {pillCategories.length > 0 && (
        <div className="flex flex-wrap gap-[var(--s-2)] mb-[var(--s-4)]">
          {pillCategories.map((name) => {
            const active = activePillName === name;
            return (
              <Chip key={name} active={active} onClick={() => selectPill(name)}>
                {name}
              </Chip>
            );
          })}
          {selectedCategories.size > 1 && (
            <button
              onClick={() => setSelectedCategories(new Set())}
              className="text-fs-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors px-[var(--s-3)]"
            >
              {t('clearAll') || 'Tout effacer'}
            </button>
          )}
        </div>
      )}

      {/* Table wrapper */}
      <div>
      {/* Items table */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <ImageIcon className="w-12 h-12 text-neutral-400 dark:text-neutral-500" />
          <p className="text-base text-neutral-600 dark:text-neutral-400 text-center max-w-md">
            {allItems.length === 0 ? t('addFirstMenuItem') : t('tryAdjustingFilters')}
          </p>
          {allItems.length === 0 && (
            <button
              onClick={() => router.push(`/${rid}/menu/items/new`)}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 flex items-center gap-2 font-medium"
            >
              {t('createItem')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111111] rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a]">
                <th className="text-left p-4 w-12">
                  <Checkbox
                    checked={selected.size > 0 && selected.size === paged.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left p-4 font-semibold text-neutral-700 dark:text-neutral-300 text-sm uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    {t('item')}
                    {sortKey === 'name' &&
                      (sortDir === 'asc' ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ))}
                  </button>
                </th>
                <th className="text-left p-4 font-semibold text-neutral-700 dark:text-neutral-300 text-sm uppercase tracking-wider">
                  {t('category')}
                </th>
                <th className="text-left p-4 font-semibold text-neutral-700 dark:text-neutral-300 text-sm uppercase tracking-wider">
                  {t('availability')}
                </th>
                <th className="text-right p-4 font-semibold text-neutral-700 dark:text-neutral-300 text-sm uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => toggleSort('price')}
                    className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white transition-colors ml-auto"
                  >
                    {t('price')}
                    {sortKey === 'price' &&
                      (sortDir === 'asc' ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ))}
                  </button>
                </th>
                <th className="text-left p-4 w-12" />
              </tr>
            </thead>
            <tbody>
              {/* Quick create */}
              {!quickCreateOpen ? (
                <tr
                  className="cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-900/20 transition-colors border-b border-neutral-100 dark:border-neutral-800"
                  onClick={() => {
                    setQuickCreateOpen(true);
                    if (!qcCategoryId && categories.length > 0) setQcCategoryId(categories[0].id);
                  }}
                >
                  <td colSpan={6} className="py-3 px-4">
                    <span className="flex items-center gap-2 text-sm font-medium text-orange-500">
                      <Plus size={16} /> {t('quickCreate')}
                    </span>
                  </td>
                </tr>
              ) : (
                <tr className="bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-100 dark:border-neutral-800">
                  <td className="py-3 px-4" />
                  <td className="py-3 px-2">
                    <input
                      autoFocus
                      value={qcName}
                      onChange={(e) => setQcName(e.target.value)}
                      placeholder={t('nameRequired')}
                      className="w-full px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickCreate();
                        if (e.key === 'Escape') setQuickCreateOpen(false);
                      }}
                    />
                  </td>
                  <td className="py-3 px-2">
                    <select
                      value={qcCategoryId}
                      onChange={(e) => setQcCategoryId(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-2" />
                  <td className="py-3 px-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={qcPrice}
                      onChange={(e) => setQcPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-1.5 text-sm text-right border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] text-neutral-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickCreate();
                        if (e.key === 'Escape') setQuickCreateOpen(false);
                      }}
                    />
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleQuickCreate}
                        disabled={qcSaving || !qcName.trim()}
                        className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs font-medium rounded-lg shadow-sm disabled:opacity-50"
                      >
                        {qcSaving ? '...' : t('save')}
                      </button>
                      <button
                        onClick={() => setQuickCreateOpen(false)}
                        className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white px-2 py-1.5 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {paged.map((item, rowIdx) => {
                const variantOpts = (item.variant_groups ?? []).flatMap((g) =>
                  (g.variants ?? []).map((v) => ({
                    id: v.id,
                    name: v.name,
                    price: v.price,
                    is_active: v.is_active,
                  })),
                );
                const optionSetOpts = (item.option_sets ?? []).flatMap((os) =>
                  (os.options ?? []).map((o) => ({
                    id: o.id,
                    name: o.name,
                    price: o.price,
                    is_active: o.is_active,
                  })),
                );
                const variants = [...variantOpts, ...optionSetOpts].filter((v) => v.is_active);
                const hasVariants = variants.length > 0;
                const isExpanded = expandedItemIds.has(item.id);

                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`border-b border-neutral-100 dark:border-neutral-800 hover:bg-orange-50/50 dark:hover:bg-orange-900/20 transition-colors cursor-pointer ${rowIdx % 2 === 0 ? 'bg-white dark:bg-[#111111]' : 'bg-neutral-50/50 dark:bg-[#0f0f0f]'}`}
                      onClick={() => openEditor(item, rid, router)}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                          />
                          {hasVariants && (
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="w-5 h-5 flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
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
                          <div>
                            <span className="font-medium text-neutral-900 dark:text-white">
                              {item.name}
                            </span>
                            {item.item_type === 'combo' && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-orange-500/15 text-orange-500">
                                Combo
                              </span>
                            )}
                            {hasVariants && (
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                                {variants.length} {t('variants').toLowerCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-3 py-1 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-300 rounded-lg text-sm font-medium">
                          {item.category_name}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAvailability(item);
                          }}
                          className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            item.is_active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}
                        >
                          {item.is_active ? t('available') : t('unavailable')}
                        </button>
                      </td>
                      <td className="p-4 text-right">
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {hasVariants ? '—' : `₪${(item.price ?? 0).toFixed(2)}`}
                        </span>
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditor(item, rid, router)}
                            className="p-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors group"
                            title={t('viewDetails') || 'Voir les détails'}
                          >
                            <Eye size={18} className="text-neutral-600 dark:text-neutral-400 group-hover:text-orange-500" />
                          </button>
                          <RowActionsMenu
                            actions={[
                              {
                                label: t('edit'),
                                onClick: () => openEditor(item, rid, router),
                              },
                              {
                                label: t('delete'),
                                onClick: () => handleDeleteItem(item.id),
                                variant: 'danger',
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>

                    {hasVariants &&
                      isExpanded &&
                      variants.map((v) => (
                        <tr
                          key={`${item.id}-v-${v.id}`}
                          className="cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-900/20 transition-colors border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#0f0f0f]"
                          onClick={() => router.push(`/${rid}/menu/items/${item.id}/variants`)}
                        >
                          <td className="p-3" />
                          <td className="p-3 pl-16">
                            <span className="text-sm text-neutral-600 dark:text-neutral-400">
                              {v.name}
                            </span>
                          </td>
                          <td className="p-3" />
                          <td className="p-3">
                            <span
                              className={`text-xs font-medium ${
                                v.is_active
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-neutral-500 dark:text-neutral-400'
                              }`}
                            >
                              {v.is_active ? t('available') : t('unavailable')}
                            </span>
                          </td>
                          <td className="p-3 text-right text-sm text-neutral-600 dark:text-neutral-400">
                            ₪{(v.price ?? 0).toFixed(2)}
                          </td>
                          <td className="p-3">
                            <MoreVertical className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-neutral-600 dark:text-neutral-400">
            {(t('paginationShowing') || 'Showing {n} of {total}')
              .replace('{n}', String(paged.length))
              .replace('{total}', String(sorted.length))}
          </p>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe === 1}
                className="px-4 py-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('previousPage') || 'Previous'}
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    (p >= pageSafe - 1 && p <= pageSafe + 1),
                )
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <React.Fragment key={p}>
                      {showEllipsis && (
                        <span className="px-2 py-2 text-neutral-400">…</span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          p === pageSafe
                            ? 'bg-orange-500 text-white'
                            : 'border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] hover:bg-neutral-50 dark:hover:bg-[#222222] text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe === totalPages}
                className="px-4 py-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1a1a1a] rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors font-medium text-sm text-neutral-700 dark:text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('nextPage') || 'Next'}
              </button>
            </div>
          )}
        </div>
      )}
      </div>{/* /px-8 py-6 table wrapper */}

      {/* Category drawer — dual-mode (filter | bulk-assign). Figma App.tsx:1035 */}
      <CategoryDrawer
        open={categoryDrawer.open}
        mode={categoryDrawer.mode}
        onClose={() => setCategoryDrawer({ open: false, mode: 'filter' })}
        categories={categories}
        currentCategory={
          selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ''
        }
        onSelect={handleCategorySelect}
        selectionCount={selectionCount}
        onCreateCategory={handleCreateCategory}
        processing={bulkProcessing}
      />

      {/* Filters Drawer (nested: index → category / status) */}
      <KPIInfoModal
        kpiInfo={selectedKpi ? KPI_INFO[selectedKpi] ?? null : null}
        onClose={() => setSelectedKpi(null)}
      />

      <StockFiltersDrawer
        open={filtersDrawer.open}
        initialView={filtersDrawer.view}
        onClose={closeFiltersDrawer}
        categories={categoryOptions}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
        statuses={[
          { value: 'active', label: t('active') },
          { value: 'inactive', label: t('inactive') },
        ]}
        selectedStatuses={selectedStatuses}
        onStatusChange={setSelectedStatuses}
      />
    </div>
  );
}
