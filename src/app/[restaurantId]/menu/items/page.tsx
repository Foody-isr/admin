'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteMenuItem, duplicateMenuItem, createMenuItem,
  createCategory, updateCategory,
  AvailabilityOverride, MenuCategory, MenuItem,
} from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
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
  ChevronLeft,
  ChevronRight,
  ListFilter,
  X,
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
import { NumberInput } from '@/components/ui/NumberInput';
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
import { HorizontalScrollRail } from '@/components/common/HorizontalScrollRail';

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
  const { money } = useCurrency();
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

  // KPI info modal
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
    const next = availabilityToggleTarget(item.availability_state, item.availability_override);
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
  const activePillName = selectedCategories.size === 0
    ? ALL_PILL
    : selectedCategories.size === 1
      ? Array.from(selectedCategories)[0]
      : null;
  const selectPill = (name: string) => {
    if (name === ALL_PILL) setSelectedCategories(new Set());
    else setSelectedCategories(new Set([name]));
  };
  const visibleStart = sorted.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const visibleEnd = Math.min(pageSafe * PAGE_SIZE, sorted.length);
  const hasDefaultStatus = selectedStatuses.size === 1 && selectedStatuses.has('active');
  const activeFilterCount = selectedCategories.size + (hasDefaultStatus ? 0 : 1);
  const resetFilters = () => {
    setSearch('');
    setSelectedCategories(new Set());
    setSelectedStatuses(new Set(['active']));
    setPage(1);
  };

  return (
    <div className="min-h-[calc(100dvh-var(--topbar-total-h)-64px)]">
      <div className="min-w-0 space-y-[var(--s-3)] md:space-y-[var(--s-4)]">
        <PageHead
          title={t('itemLibrary')}
          desc={`${allItems.length} ${t('articlesUnit')} · ${categories.length} ${t('categoriesCount')}`}
          className="mb-0 items-center"
          actions={
            <>
              {canEdit && (
                <Button
                  variant="primary"
                  size="lg"
                  icon
                  onClick={() => router.push(`/${rid}/menu/items/new`)}
                  aria-label={t('createItem')}
                  title={t('createItem')}
                  className="rounded-full text-white shadow-sm"
                >
                  <Plus />
                </Button>
              )}
            </>
          }
        />

        <header>
          <ArticlesKpiRow
            items={allItems}
            categoriesCount={categories.length}
            onKpiClick={setSelectedKpi}
          />

        {/* Bulk selection toolbar — Figma App.tsx:497-523 */}
        {canEdit && selectionCount > 0 && (
          <div className="mt-[var(--s-4)] flex flex-wrap items-center justify-between gap-4 rounded-r-md border border-[var(--brand-100)] bg-[var(--brand-50)] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-fs-sm font-semibold text-[var(--brand-700)]">
                {selectionCount} {t('selectedItems') || 'article'}{selectionCount > 1 ? 's' : ''} {t('selectedSuffix') || 'sélectionné'}{selectionCount > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-fs-xs font-medium text-[var(--brand-600)] hover:text-[var(--brand-700)] focus-visible:outline-none focus-visible:shadow-ring"
              >
                {t('deselectAll') || 'Tout désélectionner'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setCategoryDrawer({ open: true, mode: 'bulk-assign' })}
                disabled={bulkProcessing}
              >
                <Tag size={16} />
                {t('assignCategory') || 'Assigner une catégorie'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setOptionsDrawerOpen(true)}
                disabled={bulkProcessing}
              >
                <ListPlus size={16} />
                {t('assignOptions')}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setModifiersDrawerOpen(true)}
                disabled={bulkProcessing}
              >
                <Settings size={16} />
                {t('assignModifiers')}
              </Button>
              <div className="relative" ref={availabilityMenuRef}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setAvailabilityMenuOpen((v) => !v)}
                  disabled={bulkProcessing}
                  aria-haspopup="menu"
                  aria-expanded={availabilityMenuOpen}
                >
                  <CircleDot size={16} />
                  {t('availabilityModeTitle')}
                  <ChevronDown size={14} />
                </Button>
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
              <Button
                variant="secondary"
                size="md"
                onClick={handleBulkDelete}
                disabled={bulkProcessing}
                className="text-[var(--danger-500)] hover:bg-[var(--danger-50)]"
              >
                <Trash2 size={16} />
                {t('delete') || 'Supprimer'}
              </Button>
            </div>
          </div>
        )}

      </header>

      {/* Categories use the same restrained underline navigation as order history. */}
      {pillCategories.length > 0 && (
        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[var(--line)]">
          <HorizontalScrollRail activeKey={activePillName} edgeFlush>
            <div className="inline-flex items-center gap-5 pe-4">
              <span className="hidden py-2.5 text-fs-xs font-medium text-[var(--fg-subtle)] md:inline">
                {t('category')}
              </span>
              {pillCategories.map((name) => {
                const active = activePillName === name;
                const label = name === ALL_PILL ? allLabel : name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectPill(name)}
                    aria-pressed={active}
                    data-rail-active={active ? '' : undefined}
                    className={`relative py-2.5 text-fs-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:shadow-ring ${
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

      {/* Sticky controls preserve context while scanning a long catalogue. */}
      <div className="sticky top-[var(--topbar-total-h)] z-10 -mx-1 flex flex-wrap items-center gap-2 border-b border-transparent bg-[var(--bg)] px-1 py-2 max-md:border-[var(--line)]">
        <div className="relative w-full md:w-[300px]">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" />
          <input
            type="search"
            placeholder={t('searchItems') || t('search')}
            aria-label={t('searchItems') || t('search')}
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
              <X className="size-4" />
            </button>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="max-md:hidden"
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
          <ChevronDown />
        </Button>

        <Button type="button" variant="secondary" size="lg" className="max-md:flex-1" onClick={() => openFiltersDrawer('index')}>
          <ListFilter />
          {t('allFilters')}
          <ChevronDown />
        </Button>

        {activeFilterCount > 0 && (
          <Button type="button" variant="ghost" size="lg" onClick={resetFilters}>
            <ListFilter />
            {t('ordersResetFiltersWithCount').replace('{n}', String(activeFilterCount))}
          </Button>
        )}

        <div className="ms-auto max-md:ms-0 [&>button]:h-11 [&>button]:rounded-r-md [&>button]:border [&>button]:border-[var(--line-strong)] [&>button]:!bg-[var(--surface)] [&>button]:px-[var(--s-4)] [&>button]:text-fs-sm hover:[&>button]:!bg-[var(--surface-2)]">
          <ActionsDropdown
            compactOnMobile
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
      </div>

      <div>
      {sorted.length === 0 ? (
        <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] px-6 py-16 text-center shadow-1">
          <ImageIcon className="mx-auto size-10 text-[var(--fg-subtle)]" />
          <p className="mx-auto mt-3 max-w-md text-fs-sm text-[var(--fg-muted)]">
            {allItems.length === 0 ? t('addFirstMenuItem') : t('tryAdjustingFilters')}
          </p>
          {allItems.length === 0 && canEdit && (
            <Button
              variant="primary"
              size="md"
              onClick={() => router.push(`/${rid}/menu/items/new`)}
              className="mt-5"
            >
              <Plus />
              {t('createItem')}
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          className="catalog-operational-table operational-table md:max-h-[calc(100dvh-var(--topbar-total-h)-350px)] md:overflow-auto"
          data-density="compact"
        >
            <DataTableHead className="sticky top-0 z-[2]">
                <DataTableHeadSpacerCell className="bg-neutral-50 px-3 py-2 dark:bg-[#0a0a0a]">
                  <Checkbox
                    checked={selected.size > 0 && selected.size === paged.length}
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
                  {t('item')}
                </SortableHeadCell>
                <DataTableHeadCell className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a]">
                  {t('category')}
                </DataTableHeadCell>
                <DataTableHeadCell className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a]">
                  {t('availability')}
                </DataTableHeadCell>
                <SortableHeadCell
                  sortKey="price"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'price')}
                  align="right"
                  className="bg-neutral-50 px-3 py-2 normal-case tracking-normal dark:bg-[#0a0a0a] [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('price')}
                </SortableHeadCell>
                <DataTableHeadSpacerCell className="bg-neutral-50 px-3 py-2 dark:bg-[#0a0a0a]" />
            </DataTableHead>
            <DataTableBody>
              {/* Quick create */}
              {canEdit && (!quickCreateOpen ? (
                <tr
                  data-mobile-hidden-row=""
                  className="cursor-pointer border-b border-neutral-100 transition-colors hover:bg-orange-50/50 dark:border-neutral-800 dark:hover:bg-orange-900/20"
                  onClick={() => {
                    setQuickCreateOpen(true);
                    if (!qcCategoryId && categories.length > 0) setQcCategoryId(categories[0].id);
                  }}
                >
                  <td colSpan={6} className="px-3 py-2">
                    <span className="flex items-center gap-2 text-fs-sm font-medium text-[var(--brand-500)]">
                      <Plus size={16} /> {t('quickCreate')}
                    </span>
                  </td>
                </tr>
              ) : (
                <tr data-mobile-hidden-row="" className="border-b border-neutral-100 bg-neutral-50 dark:border-neutral-800 dark:bg-[#0a0a0a]">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">
                    <input
                      autoFocus
                      value={qcName}
                      onChange={(e) => setQcName(e.target.value)}
                      placeholder={t('nameRequired')}
                      className="input h-9 w-full text-fs-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickCreate();
                        if (e.key === 'Escape') setQuickCreateOpen(false);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={qcCategoryId}
                      onChange={(e) => setQcCategoryId(Number(e.target.value))}
                      className="input h-9 w-full text-fs-sm"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">
                    <NumberInput
                      min={0}
                      value={qcPrice}
                      onChange={setQcPrice}
                      placeholder="0.00"
                      className="input h-9 w-full text-right text-fs-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickCreate();
                        if (e.key === 'Escape') setQuickCreateOpen(false);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleQuickCreate}
                        disabled={qcSaving || !qcName.trim()}
                      >
                        {qcSaving ? '...' : t('save')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() => setQuickCreateOpen(false)}
                        aria-label={t('cancel')}
                      >
                        <X />
                      </Button>
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
                    ? money(minVariantPrice)
                    : `${money(minVariantPrice)} – ${money(maxVariantPrice)}`
                  : money(itemBase);

                return (
                  <React.Fragment key={item.id}>
                    <DataTableRow
                      index={rowIdx}
                      striped={false}
                      tabIndex={0}
                      className="group cursor-pointer outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand-500)]"
                      onClick={() => openEditor(item, rid, router)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openEditor(item, rid, router);
                        }
                      }}
                    >
                      <DataTableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()} mobileHidden>
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
                          <div>
                            <span className="text-fs-sm font-semibold text-[var(--fg)]">
                              {item.name}
                            </span>
                            {item.item_type === 'combo' && (
                              <span className="ms-2 rounded-r-sm bg-[var(--brand-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-600)]">
                                Combo
                              </span>
                            )}
                            {hasVariants && (
                              <span className="ms-2 text-fs-xs text-[var(--fg-muted)]">
                                {variants.length} {t('variants').toLowerCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </DataTableCell>
                      <DataTableCell className="px-3 py-2" mobileLabel={t('category')} data-mobile-role="detail" data-mobile-column="category">
                        <span className="inline-flex rounded-r-sm bg-[var(--surface-2)] px-2 py-1 text-fs-xs font-medium text-[var(--fg-muted)]">
                          {item.category_name}
                        </span>
                      </DataTableCell>
                      <DataTableCell className="px-3 py-2" mobileLabel={t('availability')} data-mobile-role="detail" data-mobile-column="availability">
                        <AvailabilityPill
                          state={item.availability_state}
                          override={item.availability_override}
                          isActive={item.is_active}
                          bottleneck={item.availability_bottleneck}
                          canEdit={canEdit}
                          pending={togglingIds.has(item.id)}
                          onToggle={() => handleAvailabilityToggle(item)}
                        />
                      </DataTableCell>
                      <DataTableCell className="px-3 py-2" align="right" mobileLabel={t('price')} data-mobile-role="detail" data-mobile-column="price">
                        <span className="num whitespace-nowrap text-fs-sm font-semibold text-[var(--fg)]">
                          {priceLabel}
                        </span>
                      </DataTableCell>
                      <DataTableCell className="px-3 py-2" data-mobile-role="menu" onClick={(e) => e.stopPropagation()}>
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
                            data-mobile-hidden-row=""
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
                              {money(effective)}
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
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-fs-xs text-[var(--fg-muted)]">
            {t('showing')
              .replace('{start}', String(visibleStart))
              .replace('{end}', String(visibleEnd))
              .replace('{total}', String(sorted.length))}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                icon
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe === 1}
                aria-label={t('previousPage') || 'Previous'}
              >
                <ChevronLeft />
              </Button>
              <span className="px-2 text-fs-xs text-[var(--fg-muted)]">
                {t('pageOf').replace('{page}', String(pageSafe)).replace('{total}', String(totalPages))}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe === totalPages}
                aria-label={t('nextPage') || 'Next'}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
      </div>

      </div>

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
