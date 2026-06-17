'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteMenuItem, duplicateMenuItem, createMenuItem,
  createCategory, updateCategory,
  AvailabilityOverride, MenuCategory, MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { getPageCache, setPageCache, saveScroll, restoreScroll } from '@/lib/page-state';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MoreVertical,
  Tag,
  Trash2,
  Sparkles,
  Settings,
  ListPlus,
  CircleDot,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import KPIInfoModal, { KPI_INFO } from '@/components/common/KPIInfoModal';
import StockFiltersDrawer, { FilterView } from '@/components/stock/StockFiltersDrawer';
import ArticlesKpiRow from '@/components/menu/ArticlesKpiRow';
import { AvailabilityPill, availabilityToggleTarget } from '@/components/menu/AvailabilityPill';
import CategoryDrawer from '@/components/menu/CategoryDrawer';
import AssignSetDrawer from '@/components/menu/AssignSetDrawer';
import CsvImportModal from '@/components/import/CsvImportModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Button, PageHead } from '@/components/ds';
import { FeatureIntro } from '@/components/help/FeatureIntro';
import { NumberInput } from '@/components/ui/NumberInput';
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
 * The scroll offset is saved too, so closing the editor returns the user to
 * the exact row they left (restored by the effect in the page below).
 */
function openEditor(item: FlatItem, rid: number, router: ReturnType<typeof useRouter>) {
  try {
    sessionStorage.setItem(`foody.menuItem.${item.id}`, JSON.stringify(item));
  } catch {
    /* quota or SSR — fall through */
  }
  saveScroll(`menu.items.${rid}`);
  router.push(`/${rid}/menu/items/${item.id}`);
}

export default function ItemLibraryPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  // Last-known data, kept across route round-trips (list → editor → back) so
  // the table renders instantly at the user's place instead of flashing a
  // full spinner. A silent refetch reconciles on every mount.
  const CACHE_KEY = `menu.items.${rid}`;
  const [categories, setCategories] = useState<MenuCategory[]>(
    () => getPageCache<MenuCategory[]>(CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(() => !getPageCache(CACHE_KEY));

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
  const [optionsDrawerOpen, setOptionsDrawerOpen] = useState(false);
  const [modifiersDrawerOpen, setModifiersDrawerOpen] = useState(false);

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

  // Items with an in-flight quick "86" toggle — disables the button to block
  // double-taps while the single-field availability mutation is in flight.
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  // Availability bulk dropdown — small inline menu in the bulk toolbar.
  // Inline (not a drawer) because there are only three fixed options and the
  // operational use case is fast: 86 these items, or put them back on.
  const [availabilityMenuOpen, setAvailabilityMenuOpen] = useState(false);
  const availabilityMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!availabilityMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (availabilityMenuRef.current?.contains(e.target as Node)) return;
      setAvailabilityMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAvailabilityMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [availabilityMenuOpen]);

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
  const [qcPrice, setQcPrice] = useState(0);
  const [qcCategoryId, setQcCategoryId] = useState(0);
  const [qcSaving, setQcSaving] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  // ─── Data loading ─────────────────────────────────────────────────

  const reload = useCallback(() => {
    return getAllCategories(rid).then((cats) => {
      setPageCache(`menu.items.${rid}`, cats);
      setCategories(cats);
    }).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // Returning from the item editor: put the user back on the exact row they
  // left. The offset was saved by openEditor() above.
  useEffect(() => {
    if (loading) return;
    requestAnimationFrame(() => restoreScroll(CACHE_KEY));
  }, [loading, CACHE_KEY]);

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

  // The DISPONIBILITÉ pill doubles as the availability toggle (see
  // AvailabilityPill + availabilityToggleTarget — shared with the carte rows).
  const handleAvailabilityToggle = async (item: FlatItem) => {
    const next = availabilityToggleTarget(item.availability_state);
    setTogglingIds((prev) => new Set(prev).add(item.id));
    // Optimistic patch so the pill flips instantly — reload() reconciles with
    // the server's computed state (a rule may still report low/sold_out after
    // a restore to 'auto').
    setCategories((cats) =>
      cats.map((c) => ({
        ...c,
        items: (c.items ?? []).map((it) =>
          it.id === item.id
            ? {
                ...it,
                availability_override: next,
                availability_state: next === 'force_sold_out' ? 'sold_out' : 'available',
              }
            : it,
        ),
      })),
    );
    try {
      await updateMenuItem(rid, item.id, { availability_override: next });
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update availability');
      await reload(); // revert optimistic patch to server truth
    } finally {
      setTogglingIds((prev) => {
        const n = new Set(prev);
        n.delete(item.id);
        return n;
      });
    }
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

  // Bulk-set the availability override on every selected item. The per-item
  // availability_rule_id is intentionally left untouched: the rule is a
  // sleeping pointer that wakes up when override flips back to 'auto', so
  // "force sold out today, back to auto tomorrow" preserves rule choices.
  const handleBulkAvailability = async (value: AvailabilityOverride) => {
    if (selected.size === 0) return;
    setBulkProcessing(true);
    try {
      for (const id of Array.from(selected)) {
        await updateMenuItem(rid, id, { availability_override: value });
      }
      setSelected(new Set());
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update availability');
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

  const handleCreateCategory = async ({ name }: { name: string }) => {
    await createCategory(rid, { name });
    await reload();
  };

  const handleEditCategory = async (oldName: string, patch: { name: string }) => {
    const cat = categories.find((c) => c.name === oldName);
    if (!cat) return;
    if (patch.name && patch.name !== oldName) {
      await updateCategory(rid, cat.id, { name: patch.name });
    }
    await reload();
  };

  const handleCategorySelect = (name: string | null) => {
    if (categoryDrawer.mode === 'bulk-assign') {
      if (name) {
        const category = categories.find((c) => c.name === name);
        if (category) handleBulkAssignCategory(category);
      }
      return;
    }
    // Filter mode
    if (name === null) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set([name]));
    }
    setCategoryDrawer({ open: false, mode: 'filter' });
  };

  const handleQuickCreate = async () => {
    if (!qcName.trim()) return;
    setQcSaving(true);
    try {
      await createMenuItem(rid, {
        name: qcName.trim(),
        price: qcPrice,
        category_id: qcCategoryId || categories[0]?.id,
        is_active: true,
      });
      setQcName('');
      setQcPrice(0);
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

  // Category pills — the top-level quick filter (single-select pattern from Figma).
  // The "all" pill (sentinel value below) clears the category filter; any other pill toggles that single category.
  const ALL_PILL = '__all__';
  const allLabel = t('all');
  const pillCategories = [ALL_PILL, ...categoryOptions.map((c) => c.name)];
  const activePillName =
    selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ALL_PILL;
  const selectPill = (name: string) => {
    if (name === ALL_PILL) setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
  };

  return (
    <div className="flex flex-col">
      <PageHead
        title={t('itemLibrary')}
        desc={`${allItems.length} ${t('articlesUnit')} · ${categories.length} ${t('categoriesCount')}`}
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
              {showKpis ? <ChevronUp /> : <ChevronDown />}
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push(`/${rid}/menu/items/new`)}
              >
                <Plus />
                {t('createItem')}
              </Button>
            )}
          </>
        }
      />

      <FeatureIntro feature="items" />

      {/* Legacy header wrapper — kept for layout, stripped of styling */}
      <header className="mb-[var(--s-4)]">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap hidden">
          <div />
        </div>

        {/* KPI row — desktop only (mobile keeps the table primary) */}
        {showKpis && (
          <div className="hidden md:block mb-6">
            <ArticlesKpiRow
              items={allItems}
              categoriesCount={categories.length}
              onKpiClick={setSelectedKpi}
            />
          </div>
        )}

        {/* Bulk selection toolbar — Figma App.tsx:497-523 */}
        {canEdit && selectionCount > 0 && (
          <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-orange-900 dark:text-orange-300">
                {selectionCount} {t('selectedItems') || 'article'}{selectionCount > 1 ? 's' : ''} {t('selectedSuffix') || 'sélectionné'}{selectionCount > 1 ? 's' : ''}
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
                disabled={bulkProcessing}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-50"
              >
                <Tag size={16} />
                {t('assignCategory') || 'Assigner une catégorie'}
              </button>
              <button
                onClick={() => setOptionsDrawerOpen(true)}
                disabled={bulkProcessing}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-50"
              >
                <ListPlus size={16} />
                {t('assignOptions')}
              </button>
              <button
                onClick={() => setModifiersDrawerOpen(true)}
                disabled={bulkProcessing}
                className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-50"
              >
                <Settings size={16} />
                {t('assignModifiers')}
              </button>
              <div className="relative" ref={availabilityMenuRef}>
                <button
                  onClick={() => setAvailabilityMenuOpen((v) => !v)}
                  disabled={bulkProcessing}
                  aria-haspopup="menu"
                  aria-expanded={availabilityMenuOpen}
                  className="px-4 py-2.5 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#222222] transition-colors flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-50"
                >
                  <CircleDot size={16} />
                  {t('availabilityModeTitle')}
                  <ChevronDown size={14} />
                </button>
                {availabilityMenuOpen && (
                  <div
                    role="menu"
                    className="absolute end-0 top-full mt-1 w-60 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-20"
                  >
                    {([
                      { value: 'auto', label: t('availabilityOverrideAuto') },
                      { value: 'force_available', label: t('availabilityOverrideForceAvailable') },
                      { value: 'force_sold_out', label: t('availabilityOverrideForceSoldOut') },
                    ] as { value: AvailabilityOverride; label: string }[]).map((opt, i) => (
                      <button
                        key={opt.value}
                        role="menuitem"
                        onClick={() => {
                          setAvailabilityMenuOpen(false);
                          handleBulkAvailability(opt.value);
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-3 text-sm text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-start ${
                          i > 0 ? 'border-t border-neutral-200 dark:border-neutral-700' : ''
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

        {/* Search + filter pill-buttons row — larger, rounded-r-lg, CAPS-ready */}
        <div className="flex flex-wrap items-center gap-[var(--s-3)] mt-[var(--s-4)]">
          <div className="relative flex-1 min-w-[240px]">
            <Search
              className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none"
            />
            <input
              type="text"
              placeholder={t('search') || 'Rechercher'}
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
            <ChevronDown className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => openFiltersDrawer('index')}
            className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors whitespace-nowrap"
          >
            {t('allFilters')}
            <ChevronDown className="w-4 h-4" />
          </button>

          <ActionsDropdown
            actions={[
              ...(canEdit
                ? [
                    {
                      label: t('importMenuWithAI'),
                      icon: <Sparkles size={16} />,
                      onClick: () => router.push(`/${rid}/menu/import`),
                    },
                    {
                      label: t('importCsv'),
                      icon: <ListPlus size={16} />,
                      onClick: () => setCsvImportOpen(true),
                    },
                  ]
                : []),
              { label: t('refresh'), onClick: reload },
            ]}
          />
        </div>
      </header>

      {/* Category pills — rounded-r-lg rectangles with CAPS labels */}
      {pillCategories.length > 0 && (
        <div className="flex flex-wrap gap-[var(--s-2)] mb-[var(--s-4)]">
          {pillCategories.map((name) => {
            const active = activePillName === name;
            const label = name === ALL_PILL ? allLabel : name;
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
                {label}
              </button>
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
          {allItems.length === 0 && canEdit && (
            <button
              onClick={() => router.push(`/${rid}/menu/items/new`)}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 flex items-center gap-2 font-medium"
            >
              {t('createItem')}
            </button>
          )}
        </div>
      ) : (
        <DataTable>
            <DataTableHead>
                <DataTableSelectAllCell
                  checked={selected.size > 0 && selected.size === paged.length}
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
                <DataTableHeadCell>{t('availability')}</DataTableHeadCell>
                <SortableHeadCell
                  sortKey="price"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'price')}
                  align="right"
                >
                  {t('price')}
                </SortableHeadCell>
                <DataTableHeadSpacerCell />
            </DataTableHead>
            <DataTableBody>
              {/* Quick create */}
              {canEdit && (!quickCreateOpen ? (
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
                    <NumberInput
                      min={0}
                      value={qcPrice}
                      onChange={setQcPrice}
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
              ))}

              {paged.map((item, rowIdx) => {
                const variantOpts = (item.variant_groups ?? []).flatMap((g) =>
                  (g.variants ?? []).map((v) => ({
                    id: v.id,
                    name: v.name,
                    price: v.price,
                    is_active: v.is_active,
                    is_combo_only: false,
                  })),
                );
                const optionSetOpts = (item.option_sets ?? []).flatMap((os) =>
                  (os.options ?? []).map((o) => ({
                    id: o.id,
                    name: o.name,
                    price: o.price,
                    is_active: o.is_active,
                    is_combo_only: o.is_combo_only ?? false,
                  })),
                );
                // Combo-only variants are excluded from the displayed price
                // range — their price is 0 by design (combo total covers them)
                // and showing "₪0.00 – ₪75.00" misleads operators reading the
                // article list. They still count for stock & combos elsewhere.
                const variants = [...variantOpts, ...optionSetOpts].filter(
                  (v) => v.is_active && !v.is_combo_only,
                );
                const hasVariants = variants.length > 0;
                const isExpanded = expandedItemIds.has(item.id);

                // A variant priced at 0 is interpreted as "same as the item
                // base price" — operators use that to express choices (e.g.
                // a sauce on a pasta) that don't change the price. So the
                // displayed range coerces 0 to the item base before
                // computing min/max.
                const itemBase = item.price ?? 0;
                const variantPrices = variants.map((v) => {
                  const raw = v.price ?? 0;
                  return raw > 0 ? raw : itemBase;
                });
                const minVariantPrice = hasVariants ? Math.min(...variantPrices) : 0;
                const maxVariantPrice = hasVariants ? Math.max(...variantPrices) : 0;
                const priceLabel = hasVariants
                  ? minVariantPrice === maxVariantPrice
                    ? `₪${minVariantPrice.toFixed(2)}`
                    : `₪${minVariantPrice.toFixed(2)} – ₪${maxVariantPrice.toFixed(2)}`
                  : `₪${itemBase.toFixed(2)}`;

                return (
                  <React.Fragment key={item.id}>
                    <DataTableRow
                      index={rowIdx}
                      className="cursor-pointer"
                      onClick={() => openEditor(item, rid, router)}
                    >
                      <DataTableCell onClick={(e) => e.stopPropagation()} mobileHidden>
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
                      </DataTableCell>
                      <DataTableCell mobilePrimary>
                        <div className="flex items-center gap-4">
                          {item.image_url ? (
                            <div className="size-20 rounded-2xl shrink-0 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-white/[0.04] dark:to-white/[0.02] ring-1 ring-black/5 dark:ring-white/5 shadow-sm shadow-black/5 dark:shadow-black/30 flex items-center justify-center overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.image_url}
                                alt=""
                                className="size-full object-contain drop-shadow-sm"
                              />
                            </div>
                          ) : (
                            <div className="size-20 rounded-2xl shrink-0 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-white/[0.04] dark:to-white/[0.02] ring-1 ring-black/5 dark:ring-white/5 shadow-sm shadow-black/5 dark:shadow-black/30 flex items-center justify-center">
                              <ImageIcon className="w-7 h-7 text-neutral-400 dark:text-white/30" />
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
                      </DataTableCell>
                      <DataTableCell mobileLabel={t('category')}>
                        <span className="px-3 py-1 bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-300 rounded-lg text-sm font-medium">
                          {item.category_name}
                        </span>
                      </DataTableCell>
                      <DataTableCell mobileLabel={t('availability')}>
                        <AvailabilityPill
                          state={item.availability_state}
                          isActive={item.is_active}
                          bottleneck={item.availability_bottleneck}
                          canEdit={canEdit}
                          pending={togglingIds.has(item.id)}
                          onToggle={() => handleAvailabilityToggle(item)}
                        />
                      </DataTableCell>
                      <DataTableCell align="right" mobileLabel={t('price')}>
                        <span className="font-semibold text-neutral-900 dark:text-white whitespace-nowrap">
                          {priceLabel}
                        </span>
                      </DataTableCell>
                      <DataTableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                          <RowActionsMenu
                            actions={[
                              {
                                label: t('edit'),
                                onClick: () => openEditor(item, rid, router),
                              },
                              {
                                label: t('duplicate') || 'Dupliquer',
                                onClick: async () => {
                                  try {
                                    const created = await duplicateMenuItem(rid, item.id);
                                    // Open the new item in the editor so the
                                    // user can adjust price / step rules
                                    // before publishing. The clone landed
                                    // inactive; saving from the editor
                                    // (with isActive toggled on) publishes it.
                                    saveScroll(CACHE_KEY);
                                    router.push(`/${rid}/menu/items/${created.id}`);
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : 'Failed to duplicate');
                                  }
                                },
                              },
                              {
                                label: t('delete'),
                                onClick: () => handleDeleteItem(item.id),
                                variant: 'danger',
                              },
                            ]}
                          />
                          )}
                        </div>
                      </DataTableCell>
                    </DataTableRow>

                    {hasVariants &&
                      isExpanded &&
                      variants.map((v) => {
                        const raw = v.price ?? 0;
                        const effective = raw > 0 ? raw : itemBase;
                        return (
                          <tr
                            key={`${item.id}-v-${v.id}`}
                            className="cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-900/20 transition-colors border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#0f0f0f]"
                            onClick={() => {
                              saveScroll(CACHE_KEY);
                              router.push(`/${rid}/menu/items/${item.id}?tab=details`);
                            }}
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
                              ₪{effective.toFixed(2)}
                              {raw === 0 && itemBase > 0 && (
                                <span className="ml-1 text-xs text-neutral-400 dark:text-neutral-500">
                                  ({t('inherited') || 'inherited'})
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <MoreVertical className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </DataTableBody>
        </DataTable>
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

      {/* Category drawer — dual-mode (filter | bulk-assign). */}
      <CategoryDrawer
        open={categoryDrawer.open}
        mode={categoryDrawer.mode}
        onClose={() => setCategoryDrawer({ open: false, mode: 'filter' })}
        categories={categories.map((c) => ({
          name: c.name,
          count: c.items?.length ?? 0,
        }))}
        currentCategory={
          selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : ''
        }
        onSelect={handleCategorySelect}
        selectionCount={selectionCount}
        onCreateCategory={handleCreateCategory}
        onEditCategory={handleEditCategory}
        processing={bulkProcessing}
      />

      <AssignSetDrawer
        open={optionsDrawerOpen}
        onClose={() => setOptionsDrawerOpen(false)}
        mode="options"
        restaurantId={rid}
        selectedItems={paged.filter((i) => selected.has(i.id))}
        onApplied={() => {
          setSelected(new Set());
          reload();
        }}
      />

      <AssignSetDrawer
        open={modifiersDrawerOpen}
        onClose={() => setModifiersDrawerOpen(false)}
        mode="modifiers"
        restaurantId={rid}
        selectedItems={paged.filter((i) => selected.has(i.id))}
        onApplied={() => {
          setSelected(new Set());
          reload();
        }}
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

      {csvImportOpen && (
        <CsvImportModal
          mode="library"
          restaurantId={rid}
          onClose={() => setCsvImportOpen(false)}
          onImported={reload}
          existingCategories={categories.map((c) => c.name)}
          existingItemKeys={new Set(
            categories.flatMap((c) =>
              (c.items ?? []).map((it) => `${c.name.toLowerCase()}::${it.name.toLowerCase()}`)
            )
          )}
        />
      )}
    </div>
  );
}
