'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listRecipeItems, RecipeCardItem } from '@/lib/api';
import StockFiltersDrawer, {
  FilterView,
  FilterCategory,
  FilterStatusOption,
} from '@/components/stock/StockFiltersDrawer';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import RowActionsMenu from '@/components/common/RowActionsMenu';
import {
  MagnifyingGlassIcon, ChevronDownIcon, ChevronUpIcon,
  ClockIcon, PencilIcon, PhotoIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

type RecipeStatus = 'complete' | 'partial' | 'none';

function statusOf(item: RecipeCardItem): RecipeStatus {
  if (item.has_steps && item.has_ingredients) return 'complete';
  if (item.has_steps || item.has_ingredients) return 'partial';
  return 'none';
}

export default function RecipesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [items, setItems] = useState<RecipeCardItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  type SortKey = 'name' | 'prep' | 'ingredients' | 'steps';
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

  const reload = useCallback(async () => {
    try {
      const data = await listRecipeItems(rid);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // Derive unique categories as FilterCategory[]
  const categories: FilterCategory[] = Array.from(
    new Set(items.map((i) => i.category_name).filter(Boolean)),
  )
    .sort()
    .map((name) => ({ name }));

  const statuses: FilterStatusOption[] = [
    { value: 'complete', label: t('completeRecipe'), color: '#10b981' },
    { value: 'partial', label: t('partialRecipe'), color: '#f59e0b' },
    { value: 'none', label: t('noRecipe'), color: '#9ca3af' },
  ];

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategories.size > 0 && !selectedCategories.has(item.category_name)) return false;
    if (selectedStatuses.size > 0 && !selectedStatuses.has(statusOf(item))) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
    if (sortKey === 'prep') return (a.prep_time_mins - b.prep_time_mins) * dir;
    if (sortKey === 'ingredients') return (a.ingredient_count - b.ingredient_count) * dir;
    return (a.step_count - b.step_count) * dir;
  });

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

  const getStatusColor = (s: RecipeStatus) =>
    s === 'complete' ? 'bg-emerald-500' : s === 'partial' ? 'bg-amber-500' : 'bg-gray-400';
  const getStatusLabel = (s: RecipeStatus) =>
    s === 'complete' ? t('completeRecipe') : s === 'partial' ? t('partialRecipe') : t('noRecipe');

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Filters + actions row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !pl-10 text-sm h-11 w-full rounded-full"
          />
        </div>

        <button
          type="button"
          onClick={() => openFiltersDrawer('category')}
          className="flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
        >
          {t('category')}{' '}
          <span className="font-semibold text-fg-primary">
            {selectedCategories.size === 0 ? t('all') : `${selectedCategories.size}`}
          </span>
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => openFiltersDrawer('status')}
          className="flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
        >
          {t('status')}{' '}
          <span className="font-semibold text-fg-primary">
            {selectedStatuses.size === 0 ? t('all') : `${selectedStatuses.size}`}
          </span>
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => openFiltersDrawer('index')}
          className="flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--divider)] bg-[var(--surface)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors whitespace-nowrap"
        >
          {t('allFilters')}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        <ActionsDropdown
          actions={[
            { label: t('refresh'), onClick: reload, icon: <ArrowPathIcon className="w-4 h-4" /> },
          ]}
        />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20">
          <span className="text-sm font-medium text-brand-500">
            {t('itemsSelected').replace('{count}', String(selected.size))}
          </span>
          <div className="flex-1" />
          <button onClick={() => setSelected(new Set())} className="text-xs text-fg-secondary hover:text-fg-primary">
            {t('cancel')}
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <p className="text-base text-fg-secondary text-center max-w-md">
            {items.length === 0 ? t('noRecipeYet') : t('tryAdjustingFilters')}
          </p>
        </div>
      ) : (
        <div>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider">
                <th className="py-3 px-2 font-medium w-10 sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-[var(--divider)]"
                  />
                </th>
                <th
                  aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-fg-primary transition-colors"
                  >
                    {t('item')}
                    {sortKey === 'name' && (sortDir === 'asc'
                      ? <ChevronUpIcon className="w-3.5 h-3.5" />
                      : <ChevronDownIcon className="w-3.5 h-3.5" />)}
                  </button>
                </th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('category')}</th>
                <th
                  aria-sort={sortKey === 'prep' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-2 font-medium text-right sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('prep')}
                    className="inline-flex items-center gap-1 hover:text-fg-primary transition-colors ml-auto"
                  >
                    {t('prepTime')}
                    {sortKey === 'prep' && (sortDir === 'asc'
                      ? <ChevronUpIcon className="w-3.5 h-3.5" />
                      : <ChevronDownIcon className="w-3.5 h-3.5" />)}
                  </button>
                </th>
                <th
                  aria-sort={sortKey === 'ingredients' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-2 font-medium text-right sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('ingredients')}
                    className="inline-flex items-center gap-1 hover:text-fg-primary transition-colors ml-auto"
                  >
                    {t('recipeIngredients')}
                    {sortKey === 'ingredients' && (sortDir === 'asc'
                      ? <ChevronUpIcon className="w-3.5 h-3.5" />
                      : <ChevronDownIcon className="w-3.5 h-3.5" />)}
                  </button>
                </th>
                <th
                  aria-sort={sortKey === 'steps' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-2 font-medium text-right sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('steps')}
                    className="inline-flex items-center gap-1 hover:text-fg-primary transition-colors ml-auto"
                  >
                    {t('steps')}
                    {sortKey === 'steps' && (sortDir === 'asc'
                      ? <ChevronUpIcon className="w-3.5 h-3.5" />
                      : <ChevronDownIcon className="w-3.5 h-3.5" />)}
                  </button>
                </th>
                <th className="py-3 px-2 font-medium sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary">{t('status')}</th>
                <th className="py-3 px-2 font-medium w-10 sticky top-0 z-10 bg-[var(--bg)] border-b-2 border-fg-primary" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const s = statusOf(item);
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-[var(--surface-subtle)] transition-colors [&>td]:border-b [&>td]:border-[var(--divider)] ${selected.has(item.id) ? 'bg-brand-500/5' : ''}`}
                  >
                    <td className="py-3.5 px-2 w-10">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-[var(--divider)]"
                      />
                    </td>
                    <td className="py-3.5 px-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/${rid}/kitchen/recipes/${item.id}`)}
                        className="flex items-center gap-3 text-left hover:text-brand-500 transition-colors"
                      >
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                            <PhotoIcon className="w-5 h-5 text-fg-tertiary" />
                          </div>
                        )}
                        <span className="font-medium text-fg-primary">{item.name}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-2 text-fg-secondary">{item.category_name || '—'}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-fg-primary">
                      {item.prep_time_mins > 0 ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <ClockIcon className="w-3.5 h-3.5 text-fg-tertiary" />
                          {item.prep_time_mins}m
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3.5 px-2 text-right font-mono text-fg-primary">
                      {item.ingredient_count > 0 ? item.ingredient_count : '—'}
                    </td>
                    <td className="py-3.5 px-2 text-right font-mono text-fg-primary">
                      {item.step_count > 0 ? item.step_count : '—'}
                    </td>
                    <td className="py-3.5 px-2">
                      <span className="inline-flex items-center gap-2 text-xs font-medium text-fg-secondary">
                        <span className={`w-2 h-2 rounded-full ${getStatusColor(s)}`} />
                        {getStatusLabel(s)}
                      </span>
                    </td>
                    <td className="py-3.5 px-2">
                      <RowActionsMenu
                        actions={[
                          {
                            label: t('edit'),
                            onClick: () => router.push(`/${rid}/kitchen/recipes/${item.id}`),
                            icon: <PencilIcon className="w-4 h-4" />,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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

    </div>
  );
}
