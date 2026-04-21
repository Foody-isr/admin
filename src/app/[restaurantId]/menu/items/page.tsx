'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAllCategories, updateMenuItem, deleteMenuItem, createMenuItem,
  MenuCategory, MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Image as ImageIcon,
  MoreVertical,
  X,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import StockFiltersDrawer, { FilterView } from '@/components/stock/StockFiltersDrawer';
import ArticlesKpiRow from '@/components/menu/ArticlesKpiRow';
import { Checkbox } from '@/components/ui/checkbox';

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

export default function ItemLibraryPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(['active']));
  const [filtersDrawer, setFiltersDrawer] = useState<{ open: boolean; view: FilterView }>({
    open: false,
    view: 'index',
  });
  const openFiltersDrawer = (view: FilterView) => setFiltersDrawer({ open: true, view });
  const closeFiltersDrawer = () => setFiltersDrawer((prev) => ({ ...prev, open: false }));

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
  const [page, setPage] = useState(1);

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

  const removeCategoryPill = (name: string) => {
    const next = new Set(selectedCategories);
    next.delete(name);
    setSelectedCategories(next);
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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm">
            <span className="text-[var(--text-secondary)]">{t('articlesGroup')}</span>
            <ChevronRight size={14} className="text-[var(--text-secondary)]" />
            <span className="font-medium text-brand-500">{t('itemLibrary')}</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {t('itemLibrary')}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">
            {t('articlesSubtitle') || 'Gérez votre catalogue de produits'}
          </p>
        </div>
        <button
          onClick={() => router.push(`/${rid}/menu/items/new`)}
          className="px-6 py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl hover:from-brand-600 hover:to-brand-700 transition-all shadow-lg shadow-brand-500/25 flex items-center gap-2 font-medium"
        >
          <Plus size={20} />
          {t('createItem')}
        </button>
      </div>

      {/* KPI row */}
      <ArticlesKpiRow items={allItems} categoriesCount={categories.length} />

      {/* Bulk selection toolbar */}
      {selectionCount > 0 && (
        <div className="p-4 bg-brand-500/10 border border-brand-500/30 rounded-xl flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-brand-600 dark:text-brand-400">
              {(t('selectedCount') || '{n} selected').replace('{n}', String(selectionCount))}
            </span>
            {compareHint && (
              <span className="text-[var(--text-secondary)]">{compareHint}</span>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:opacity-80"
            >
              {t('deselectAll') || t('clearSelection') || 'Clear'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goCompare}
              disabled={compareDisabled}
              className="px-5 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('compareCosts') || 'Compare costs'}
              {!compareDisabled && ` (${selectionCount})`}
            </button>
          </div>
        </div>
      )}

      {/* Search + filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            size={20}
          />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-[var(--divider)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          />
        </div>
        <button
          onClick={() => openFiltersDrawer('category')}
          className="px-5 py-3 border border-[var(--divider)] bg-[var(--surface)] rounded-xl hover:bg-[var(--surface-subtle)] transition-colors flex items-center gap-2 font-medium text-[var(--text-primary)] text-sm"
        >
          {t('category')}:{' '}
          <span className="text-brand-500">
            {selectedCategories.size === 0 ? t('all') : selectedCategories.size}
          </span>
          <ChevronDown size={16} />
        </button>
        <button
          onClick={() => openFiltersDrawer('index')}
          className="px-5 py-3 border border-[var(--divider)] bg-[var(--surface)] rounded-xl hover:bg-[var(--surface-subtle)] transition-colors flex items-center gap-2 font-medium text-[var(--text-primary)] text-sm"
        >
          {t('allFilters')}
          <ChevronDown size={16} />
        </button>
        <ActionsDropdown
          actions={[{ label: t('refresh'), onClick: reload }]}
        />
      </div>

      {/* Category pills */}
      {selectedCategories.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from(selectedCategories).map((name) => (
            <button
              key={name}
              onClick={() => removeCategoryPill(name)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg text-sm font-medium border border-brand-500/30 hover:bg-brand-500/20 transition-colors"
            >
              {name}
              <X size={14} />
            </button>
          ))}
          <button
            onClick={() => setSelectedCategories(new Set())}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 font-medium"
          >
            {t('clearAll') || 'Clear all'}
          </button>
        </div>
      )}

      {/* Items table */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <ImageIcon className="w-12 h-12 text-[var(--text-secondary)]" />
          <p className="text-base text-[var(--text-secondary)] text-center max-w-md">
            {allItems.length === 0 ? t('addFirstMenuItem') : t('tryAdjustingFilters')}
          </p>
          {allItems.length === 0 && (
            <button
              onClick={() => router.push(`/${rid}/menu/items/new`)}
              className="btn-primary mt-2 rounded-full"
            >
              {t('createItem')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--divider)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--divider)] bg-[var(--surface-subtle)]">
                <th className="text-left p-4 w-12">
                  <Checkbox
                    checked={selected.size > 0 && selected.size === paged.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left p-4 font-semibold text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
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
                <th className="text-left p-4 font-semibold text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                  {t('category')}
                </th>
                <th className="text-left p-4 font-semibold text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                  {t('availability')}
                </th>
                <th className="text-right p-4 font-semibold text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => toggleSort('price')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
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
                <th className="text-right p-4 w-12" />
              </tr>
            </thead>
            <tbody>
              {/* Quick create */}
              {!quickCreateOpen ? (
                <tr
                  className="cursor-pointer hover:bg-brand-500/5 transition-colors border-b border-[var(--divider)]"
                  onClick={() => {
                    setQuickCreateOpen(true);
                    if (!qcCategoryId && categories.length > 0) setQcCategoryId(categories[0].id);
                  }}
                >
                  <td colSpan={6} className="py-3 px-4">
                    <span className="flex items-center gap-2 text-sm font-medium text-brand-500">
                      <Plus size={16} /> {t('quickCreate')}
                    </span>
                  </td>
                </tr>
              ) : (
                <tr className="bg-[var(--surface-subtle)] border-b border-[var(--divider)]">
                  <td className="py-3 px-4" />
                  <td className="py-3 px-2">
                    <input
                      autoFocus
                      value={qcName}
                      onChange={(e) => setQcName(e.target.value)}
                      placeholder={t('nameRequired')}
                      className="input text-sm py-1.5 rounded-lg"
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
                      className="input text-sm py-1.5 rounded-lg"
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
                      className="input text-sm py-1.5 text-right rounded-lg"
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
                        className="btn-primary text-xs px-3 py-1.5 rounded-full disabled:opacity-50"
                      >
                        {qcSaving ? '...' : t('save')}
                      </button>
                      <button
                        onClick={() => setQuickCreateOpen(false)}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1.5 transition-colors"
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
                      className={`border-b border-[var(--divider)] hover:bg-brand-500/5 transition-colors cursor-pointer ${rowIdx % 2 === 0 ? 'bg-[var(--surface)]' : 'bg-[var(--surface-subtle)]/50'}`}
                      onClick={() => router.push(`/${rid}/menu/items/${item.id}`)}
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
                              className="w-5 h-5 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
                            <div className="size-12 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/30 dark:to-brand-800/30 flex items-center justify-center shrink-0">
                              <ImageIcon className="w-5 h-5 text-brand-500" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-[var(--text-primary)]">
                              {item.name}
                            </span>
                            {item.item_type === 'combo' && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-brand-500/15 text-brand-500">
                                Combo
                              </span>
                            )}
                            {hasVariants && (
                              <span className="text-xs text-[var(--text-secondary)] ml-2">
                                {variants.length} {t('variants').toLowerCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-3 py-1 bg-[var(--surface-subtle)] text-[var(--text-secondary)] rounded-lg text-sm font-medium">
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
                        <span className="font-semibold text-[var(--text-primary)]">
                          {hasVariants ? '—' : `₪${(item.price ?? 0).toFixed(2)}`}
                        </span>
                      </td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          actions={[
                            {
                              label: t('edit'),
                              onClick: () => router.push(`/${rid}/menu/items/${item.id}`),
                            },
                            {
                              label: t('delete'),
                              onClick: () => handleDeleteItem(item.id),
                              variant: 'danger',
                            },
                          ]}
                        />
                      </td>
                    </tr>

                    {hasVariants &&
                      isExpanded &&
                      variants.map((v) => (
                        <tr
                          key={`${item.id}-v-${v.id}`}
                          className="cursor-pointer hover:bg-brand-500/5 transition-colors border-b border-[var(--divider)] bg-[var(--surface-subtle)]/30"
                          onClick={() => router.push(`/${rid}/menu/items/${item.id}/variants`)}
                        >
                          <td className="p-3" />
                          <td className="p-3 pl-16">
                            <span className="text-sm text-[var(--text-secondary)]">
                              {v.name}
                            </span>
                          </td>
                          <td className="p-3" />
                          <td className="p-3">
                            <span
                              className={`text-xs font-medium ${
                                v.is_active
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-[var(--text-secondary)]'
                              }`}
                            >
                              {v.is_active ? t('available') : t('unavailable')}
                            </span>
                          </td>
                          <td className="p-3 text-right text-sm text-[var(--text-secondary)]">
                            ₪{(v.price ?? 0).toFixed(2)}
                          </td>
                          <td className="p-3">
                            <MoreVertical className="w-4 h-4 text-[var(--text-secondary)]/50" />
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-[var(--text-secondary)]">
            {(t('paginationShowing') || 'Showing {n} of {total}')
              .replace('{n}', String(paged.length))
              .replace('{total}', String(sorted.length))}
          </p>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe === 1}
                className="px-4 py-2 border border-[var(--divider)] bg-[var(--surface)] rounded-lg hover:bg-[var(--surface-subtle)] transition-colors font-medium text-sm text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <span className="px-2 py-2 text-[var(--text-secondary)]">…</span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                          p === pageSafe
                            ? 'bg-brand-500 text-white'
                            : 'border border-[var(--divider)] bg-[var(--surface)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)]'
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
                className="px-4 py-2 border border-[var(--divider)] bg-[var(--surface)] rounded-lg hover:bg-[var(--surface-subtle)] transition-colors font-medium text-sm text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('nextPage') || 'Next'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters Drawer (nested: index → category / status) */}
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
