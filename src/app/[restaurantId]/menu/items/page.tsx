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
  Plus,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MoreVertical,
  ListFilter,
  X,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';
import { ListToolbar, ListPagination } from '@/components/data-table';
import { ColumnPicker } from '@/components/data-table/ColumnPicker';
import { ITEM_TABLE_COLUMNS } from '@/lib/menu/item-table-columns';
import { useItemTableColumns } from '@/lib/menu/useItemTableColumns';
type FilterView = 'index' | 'category' | 'status';
import { AvailabilityPill, availabilityToggleTarget } from '@/components/menu/AvailabilityPill';
import CategoryDrawer from '@/components/menu/CategoryDrawer';
import AssignSetDrawer from '@/components/menu/AssignSetDrawer';
import CsvImportModal from '@/components/import/CsvImportModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ds';
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
    sessionStorage.setItem(`foody.menuItem.${rid}.${item.id}`, JSON.stringify(item));
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
  const columns = useItemTableColumns(rid);
  const visible = columns.visible;
  const columnCount = 3 + Number(visible.category) + Number(visible.availability) + Number(visible.price);

  // Last-known data, kept across route round-trips (list → editor → back) so
  // the table renders instantly at the user's place instead of flashing a
  // full spinner. A silent refetch reconciles on every mount.
  const CACHE_KEY = `menu.items.${rid}`;
  const [categories, setCategories] = useState<MenuCategory[]>(
    () => getPageCache<MenuCategory[]>(CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(() => !getPageCache(CACHE_KEY));
  const [loadError, setLoadError] = useState(false);

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
        page: Number.isInteger(parsed.page) && Number(parsed.page) > 0 ? Number(parsed.page) : 1,
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
    setLoadError(false);
    return getAllCategories(rid).then((cats) => {
      setPageCache(`menu.items.${rid}`, cats);
      setCategories(cats);
    }).catch(() => setLoadError(true)).finally(() => setLoading(false));
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

  const statusOptions = [{ value: 'active', label: t('active') }, { value: 'inactive', label: t('inactive') }];
  const listFilters = [
    { id: 'category', label: t('category'), options: categoryOptions.map(category => ({ value: category.name, label: category.name })), selected: selectedCategories },
    { id: 'status', label: t('listState'), options: statusOptions, selected: selectedStatuses },
  ];

  return (
    <div className="min-h-[calc(100dvh-var(--topbar-total-h)-64px)]">
      <div className="min-w-0">
        <h1 className="sr-only">{t('itemLibrary')}</h1>
        <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
          filters={<>
            <ListFilterButton label={t('category')} value={selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : selectedCategories.size > 1 ? selectedCategories.size : undefined} onClick={() => openFiltersDrawer('category')} />
            <ListStateFilter label={t('listState')} options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} />
            <ListFilterButton label={t('allFilters')} icon={<ListFilter />} onClick={() => openFiltersDrawer('index')} />
          </>}
          actions={<ActionsDropdown actions={[
            ...(canEdit ? [
              { label: t('importMenuWithAI'), onClick: () => router.push(`/${rid}/menu/import`) },
              { label: t('importCsv'), onClick: () => setCsvImportOpen(true) },
            ] : []),
            { label: t('refresh'), onClick: reload },
            ...(canEdit && selectionCount > 0 ? [
              { label: t('assignCategory'), disabled: bulkProcessing, onClick: () => setCategoryDrawer({ open: true, mode: 'bulk-assign' }) },
              { label: t('assignOptions'), disabled: bulkProcessing, onClick: () => setOptionsDrawerOpen(true) },
              { label: t('assignModifiers'), disabled: bulkProcessing, onClick: () => setModifiersDrawerOpen(true) },
              ...(['auto','force_available','force_sold_out'] as AvailabilityOverride[]).map((value,index) => ({ label: t(['availabilityOverrideAuto','availabilityOverrideForceAvailable','availabilityOverrideForceSoldOut'][index]), disabled: bulkProcessing, onClick: () => void handleBulkAvailability(value) })),
              { label: t('delete'), disabled: bulkProcessing, onClick: handleBulkDelete, variant: 'danger' as const },
              { label: t('deselectAll'), onClick: () => setSelected(new Set()) },
            ] : []),
          ]} />}
          primaryAction={canEdit && <Button onClick={() => router.push(`/${rid}/menu/items/new`)}>{t('createItem')}</Button>}
        />
        {selectionCount > 0 && <p role="status" className="sr-only">{t('listSelected').replace('{count}', String(selectionCount))}</p>}

      {loadError && <div role="alert" className="mb-4 space-y-3 border border-[var(--line)] p-4"><p>{t('workspaceLoadError')}</p><Button variant="secondary" onClick={reload}>{t('retry')}</Button></div>}
      <div>
      {loadError && allItems.length === 0 ? null : sorted.length === 0 ? (
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
          className="catalog-operational-table operational-table list-table"
          data-density="compact"
        >
            <DataTableHead className="sticky top-0 z-[2]">
                <DataTableHeadSpacerCell className="w-[76px] ps-11 pe-3 py-3">
                  <Checkbox
                    aria-label={t('selectAll')}
                    checked={paged.length > 0 && paged.every(item => selected.has(item.id))}
                    onCheckedChange={toggleSelectAll}
                  />
                </DataTableHeadSpacerCell>
                <SortableHeadCell
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'name')}
                  className="ps-0 pe-3 py-3 normal-case tracking-normal [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('item')}
                </SortableHeadCell>
                {visible.category && <DataTableHeadCell className="px-3 py-4 normal-case tracking-normal">
                  {t('category')}
                </DataTableHeadCell>}
                {visible.availability && <DataTableHeadCell className="px-3 py-4 normal-case tracking-normal">
                  {t('availability')}
                </DataTableHeadCell>}
                {visible.price && <SortableHeadCell
                  sortKey="price"
                  currentSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={(k) => toggleSort(k as 'price')}
                  align="right"
                  className="px-3 py-4 normal-case tracking-normal [&_button]:normal-case [&_button]:tracking-normal"
                >
                  {t('price')}
                </SortableHeadCell>}
                <DataTableHeadCell className="w-12 px-2 !py-1.5 text-end">
                  <ColumnPicker>
                    {ITEM_TABLE_COLUMNS.map(column => <label key={column.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-[var(--surface-2)]">
                      <Checkbox className="size-5" checked={visible[column.key]} onCheckedChange={checked => columns.toggle(column.key, checked === true)} />
                      <span>{t(column.labelKey)}</span>
                    </label>)}
                    <p className="px-2 pb-2 pt-3 text-xs leading-5 text-[var(--fg-muted)]" role={columns.saveFailed ? 'status' : undefined}>{t(columns.saveFailed ? 'columnsSaveFailed' : 'columnsPersonalHint')}</p>
                    {columns.hasCustom && <button type="button" onClick={columns.reset} className="min-h-11 w-full rounded px-2 text-start text-xs font-medium underline hover:bg-[var(--surface-2)]">{t('resetColumns')}</button>}
                  </ColumnPicker>
                </DataTableHeadCell>
            </DataTableHead>
            <DataTableBody>
              {/* Quick create */}
              {canEdit && (!quickCreateOpen ? (
                <tr data-mobile-hidden-row="" className="border-b border-[var(--line)] hover:bg-[var(--surface-2)]">
                  <td colSpan={columnCount} className="ps-12 pe-3">
                    <button type="button" className="flex h-14 items-center gap-2 text-sm font-semibold underline underline-offset-2" onClick={() => {
                      setQuickCreateOpen(true);
                      if (!qcCategoryId && categories.length > 0) setQcCategoryId(categories[0].id);
                    }}><Plus size={20} />{t('quickCreate')}</button>
                  </td>
                </tr>
              ) : (
                <tr data-mobile-hidden-row="" className="border-b border-neutral-100 bg-neutral-50 dark:border-neutral-800 dark:bg-[#0a0a0a]">
                  <td colSpan={columnCount} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-3 ps-9">
                      <input
                        autoFocus
                        value={qcName}
                        onChange={(e) => setQcName(e.target.value)}
                        aria-label={t('nameRequired')}
                        placeholder={t('nameRequired')}
                        className="input h-9 min-w-40 flex-1 text-fs-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleQuickCreate();
                          if (e.key === 'Escape') setQuickCreateOpen(false);
                        }}
                      />

                      <select
                        aria-label={t('category')}
                        value={qcCategoryId}
                        onChange={(e) => setQcCategoryId(Number(e.target.value))}
                        className="input h-9 min-w-40 flex-1 text-fs-sm"
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      <NumberInput
                        aria-label={t('price')}
                        min={0}
                        value={qcPrice}
                        onChange={setQcPrice}
                        placeholder="0.00"
                        className="input h-9 w-32 text-end text-fs-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleQuickCreate();
                          if (e.key === 'Escape') setQuickCreateOpen(false);
                        }}
                      />

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
                        <div className="flex w-[52px] items-center gap-3">
                          <span className="inline-flex size-5 shrink-0 items-center justify-center">
                            {hasVariants && <button type="button" onClick={() => toggleExpand(item.id)} aria-expanded={isExpanded} aria-label={`${t(isExpanded ? 'collapseRow' : 'expandRow')} ${item.name}`} className="grid size-5 place-items-center">
                              <ChevronDown className={`size-4 ${isExpanded ? '' : '-rotate-90 rtl:rotate-90'}`} />
                            </button>}
                          </span>
                          <Checkbox aria-label={`${t('select')} ${item.name}`} checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
                        </div>
                      </DataTableCell>
                      <DataTableCell className="ps-0 pe-3 py-2" mobilePrimary>
                        <div className="flex items-center gap-4">
                          {visible.images && (item.image_url ? (
                            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--surface-2)]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.image_url}
                                alt=""
                                className="size-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex size-10 shrink-0 items-center justify-center rounded bg-[var(--surface-2)]">
                              <ImageIcon className="size-5 text-[var(--fg-subtle)]" />
                            </div>
                          ))}
                          <div>
                            <span className="text-sm font-normal text-[var(--fg)]">
                              {item.name}
                            </span>
                            {item.item_type === 'combo' && (
                              <span className="ms-2 rounded-r-sm bg-[var(--brand-50)] px-1.5 py-0.5 text-fs-micro font-semibold text-[var(--brand-600)]">
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
                      {visible.category && <DataTableCell className="px-3 py-2" mobileLabel={t('category')} data-mobile-role="detail" data-mobile-column="category">
                        <span className="inline-flex rounded-r-sm bg-[var(--surface-2)] px-2 py-1 text-fs-xs font-medium text-[var(--fg-muted)]">
                          {item.category_name}
                        </span>
                      </DataTableCell>}
                      {visible.availability && <DataTableCell className="px-3 py-2" mobileLabel={t('availability')} data-mobile-role="detail" data-mobile-column="availability">
                        <AvailabilityPill
                          state={item.availability_state}
                          override={item.availability_override}
                          isActive={item.is_active}
                          bottleneck={item.availability_bottleneck}
                          canEdit={canEdit}
                          pending={togglingIds.has(item.id)}
                          onToggle={() => handleAvailabilityToggle(item)}
                        />
                      </DataTableCell>}
                      {visible.price && <DataTableCell className="px-3 py-2" align="right" mobileLabel={t('price')} data-mobile-role="detail" data-mobile-column="price">
                        <span className="num whitespace-nowrap text-sm font-normal text-[var(--fg)]">
                          {priceLabel}
                        </span>
                      </DataTableCell>}
                      <DataTableCell className="px-3 py-2" data-mobile-role="menu" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                          <RowActionsMenu label={`${t('actions')} — ${item.name}`}
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
                            className="cursor-pointer hover:bg-[var(--surface-2)] transition-colors border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#0f0f0f]"
                            onClick={() => {
                              saveScroll(CACHE_KEY);
                              router.push(`/${rid}/menu/items/${item.id}?tab=details`);
                            }}
                          >
                            <td className="p-3" />
                            <td className={`p-3 ${visible.images ? 'ps-14' : 'ps-0'}`}>
                              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                                {v.name}
                              </span>
                            </td>
                            {visible.category && <td className="p-3" />}
                            {visible.availability && <td className="p-3">
                              <span
                                className={`text-xs font-medium ${
                                  v.is_active
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-neutral-500 dark:text-neutral-400'
                                }`}
                              >
                                {v.is_active ? t('available') : t('unavailable')}
                              </span>
                            </td>}
                            {visible.price && <td className="p-3 text-right text-sm text-neutral-600 dark:text-neutral-400">
                              {money(effective)}
                              {raw === 0 && itemBase > 0 && (
                                <span className="ml-1 text-xs text-neutral-400 dark:text-neutral-500">
                                  ({t('inherited') || 'inherited'})
                                </span>
                              )}
                            </td>}
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

      {sorted.length > 0 && <ListPagination page={pageSafe} totalPages={totalPages} pageSize={PAGE_SIZE} onPageChange={setPage} />}
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
        onCreateCategory={canEdit ? handleCreateCategory : undefined}
        onEditCategory={canEdit ? handleEditCategory : undefined}
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

      <ListFiltersDrawer open={filtersDrawer.open} initialView={filtersDrawer.view} onClose={closeFiltersDrawer} filters={listFilters}
        onApply={values => { setSelectedCategories(values.category ?? new Set()); setSelectedStatuses(values.status ?? new Set()); setPage(1); }} />

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
