'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp, FolderPlus, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  listCateringArticleLibrary,
  type CateringChoiceGroupInput,
  type CateringLibraryItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

export type CateringChoiceGroupDraft = CateringChoiceGroupInput & { key: string };

export function newChoiceGroupDraft(index: number, name = ''): CateringChoiceGroupDraft {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `choice-${Date.now()}-${index}`,
    name,
    description: '',
    min_selections: 1,
    max_selections: 1,
    max_per_item: 1,
    items: [],
  };
}

export function toChoiceGroupInputs(groups: CateringChoiceGroupDraft[]): CateringChoiceGroupInput[] {
  return groups.map(({ key: _key, ...group }) => group);
}

export default function CateringFormulaComposer({
  restaurantId,
  groups,
  onChange,
}: {
  restaurantId: number;
  groups: CateringChoiceGroupDraft[];
  onChange: (next: CateringChoiceGroupDraft[]) => void;
}) {
  const { t } = useI18n();
  const [library, setLibrary] = useState<CateringLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(groups[0]?.key ?? null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    listCateringArticleLibrary(restaurantId)
      .then((items) => {
        if (!live) return;
        setLibrary(items);
        if (items[0]) setExpandedCategories(new Set([items[0].category_id]));
      })
      .catch((error: unknown) => {
        if (!live) return;
        setLibrary([]);
        setLoadError(error instanceof Error ? error.message : t('catering_choice_library_error'));
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [restaurantId, loadAttempt, t]);

  const active = groups.find((group) => group.key === activeKey) ?? null;
  const itemsById = useMemo(() => new Map(library.map((item) => [item.id, item])), [library]);
  const categories = useMemo(() => {
    const seen = new Map<number, { id: number; name: string }>();
    for (const item of library) {
      if (!seen.has(item.category_id)) seen.set(item.category_id, { id: item.category_id, name: item.category_name });
    }
    return Array.from(seen.values());
  }, [library]);
  const categoryById = useMemo(() => new Map(categories.map((cat) => [cat.id, cat])), [categories]);
  const categoryRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return categories
      .map((category) => {
        const items = library.filter((item) => item.category_id === category.id);
        const categoryMatches = category.name.toLocaleLowerCase().includes(q);
        const visibleItems = !q || categoryMatches
          ? items
          : items.filter((item) => item.name.toLocaleLowerCase().includes(q));
        return { category, items, visibleItems };
      })
      .filter((row) => row.visibleItems.length > 0);
  }, [categories, library, search]);

  const updateActive = (patch: Partial<CateringChoiceGroupDraft>) => {
    if (!active) return;
    onChange(groups.map((group) => group.key === active.key ? { ...group, ...patch } : group));
  };

  const addGroup = () => {
    const next = newChoiceGroupDraft(groups.length, t('catering_choice_group_default_name'));
    onChange([...groups, next]);
    setActiveKey(next.key);
  };

  const moveGroup = (key: string, direction: -1 | 1) => {
    const index = groups.findIndex((group) => group.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const removeGroup = (key: string) => {
    const index = groups.findIndex((group) => group.key === key);
    const next = groups.filter((group) => group.key !== key);
    onChange(next);
    if (activeKey === key) setActiveKey(next[Math.min(index, next.length - 1)]?.key ?? null);
  };

  const addItem = (menuItemId: number) => {
    if (!active || active.items.some((item) => item.menu_item_id === menuItemId)) return;
    updateActive({ items: [...active.items, { menu_item_id: menuItemId, price_delta: 0, default_quantity: 0 }] });
  };

  const addCategory = (items: CateringLibraryItem[]) => {
    if (!active) return;
    const existing = new Set(active.items.map((item) => item.menu_item_id));
    const additions = items
      .filter((item) => item.is_active && !existing.has(item.id))
      .map((item) => ({ menu_item_id: item.id, price_delta: 0, default_quantity: 0 }));
    if (additions.length) updateActive({ items: [...active.items, ...additions] });
  };

  const clearSearch = () => setSearch('');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
        <div>
          <h4 className="font-semibold text-fg-primary">{t('catering_formula_composition')}</h4>
          <p className="mt-1 max-w-2xl text-sm text-fg-secondary">{t('catering_formula_composition_hint')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={addGroup}><Plus />{t('catering_choice_add_group')}</Button>
      </div>

      {groups.length === 0 ? (
        <button type="button" onClick={addGroup} className="w-full rounded-xl border border-dashed border-[var(--divider)] px-6 py-10 text-center hover:border-brand-500">
          <Plus className="mx-auto h-6 w-6 text-brand-500" />
          <span className="mt-2 block font-medium text-fg-primary">{t('catering_choice_empty')}</span>
          <span className="mt-1 block text-sm text-fg-secondary">{t('catering_choice_empty_hint')}</span>
        </button>
      ) : (
        <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.4fr)]">
          <aside className="flex min-h-0 flex-col rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-tertiary" />
              <input className="input ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('catering_choice_search_library')} />
            </label>
            <div className="mb-2 mt-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t('catering_choice_article_library')}</p>
              {!loading && !loadError && <span className="text-xs text-fg-tertiary">{categories.length} {t('catering_choice_categories_short')} · {library.length} {t('catering_choice_articles_short')}</span>}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
              {loading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-secondary"><RefreshCw className="h-4 w-4 animate-spin" />{t('catering_choice_library_loading')}</div> : loadError ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                  <p className="text-sm font-medium text-fg-primary">{t('catering_choice_library_error')}</p>
                  <p className="mt-1 text-xs text-fg-secondary">{loadError}</p>
                  <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-fg-primary hover:border-brand-500">
                    <RefreshCw className="h-3.5 w-3.5" />{t('catering_choice_library_retry')}
                  </button>
                </div>
              ) : categoryRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--divider)] p-5 text-center">
                  <p className="text-sm font-medium text-fg-primary">{library.length === 0 ? t('catering_choice_library_empty') : t('catering_choice_no_search_results')}</p>
                  <p className="mt-1 text-xs text-fg-secondary">{library.length === 0 ? t('catering_choice_library_empty_hint') : `« ${search.trim()} »`}</p>
                  {search.trim() && <button type="button" onClick={clearSearch} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-500"><X className="h-3.5 w-3.5" />{t('catering_choice_clear_search')}</button>}
                </div>
              ) : categoryRows.map(({ category, items, visibleItems }) => {
                const expanded = expandedCategories.has(category.id) || Boolean(search.trim());
                const activeItems = items.filter((item) => item.is_active);
                const selectedCount = activeItems.filter((item) => active?.items.some((choice) => choice.menu_item_id === item.id)).length;
                const categoryImported = activeItems.length > 0 && selectedCount === activeItems.length;
                return (
                  <section key={category.id} className="overflow-hidden rounded-lg border border-[var(--divider)] bg-[var(--surface)]">
                    <div className="border-s-2 border-s-brand-500 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setExpandedCategories((previous) => {
                          const next = new Set(previous);
                          if (next.has(category.id)) next.delete(category.id); else next.add(category.id);
                          return next;
                        })} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="truncate text-sm font-semibold text-fg-primary">{category.name}</span>
                          <span className="text-xs text-fg-tertiary">{items.length}</span>
                        </button>
                        {categoryImported && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
                      </div>
                      <button type="button" disabled={!active || categoryImported || activeItems.length === 0} onClick={() => addCategory(items)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-brand-500/30 bg-brand-500/5 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500/10 disabled:border-[var(--divider)] disabled:bg-[var(--surface-subtle)] disabled:text-fg-tertiary">
                        {categoryImported ? <Check className="h-3.5 w-3.5" /> : <FolderPlus className="h-3.5 w-3.5" />}
                        {categoryImported ? t('catering_choice_category_imported') : t('catering_choice_import_category')}
                        {!categoryImported && selectedCount > 0 && <span>({selectedCount}/{activeItems.length})</span>}
                      </button>
                    </div>
                    {expanded && <div className="border-t border-[var(--divider)] p-1.5">
                      {visibleItems.map((item) => {
                        const selected = active?.items.some((choice) => choice.menu_item_id === item.id) ?? false;
                        return (
                          <button key={item.id} type="button" disabled={!active || selected || !item.is_active} onClick={() => addItem(item.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-[var(--surface-subtle)] disabled:opacity-60">
                            {item.image_url ? <img src={item.image_url} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="h-8 w-8 rounded-md bg-[var(--surface-subtle)]" />}
                            <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">{item.name}</span>
                            {selected ? <Check className="h-4 w-4 text-brand-500" /> : <Plus className="h-4 w-4 text-fg-tertiary" />}
                          </button>
                        );
                      })}
                    </div>}
                  </section>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {groups.map((group, index) => (
                <button key={group.key} type="button" onClick={() => setActiveKey(group.key)} className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${active?.key === group.key ? 'border-brand-500 bg-brand-500 text-white' : 'border-[var(--divider)] bg-[var(--surface)] text-fg-secondary'}`}>
                  {index + 1}. {group.name || t('catering_choice_unnamed')} · {group.items.length}
                </button>
              ))}
            </div>

            {active && <section className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <input className="input font-semibold" value={active.name} onChange={(event) => updateActive({ name: event.target.value })} placeholder={t('catering_choice_group_name')} />
                  <input className="input" value={active.description ?? ''} onChange={(event) => updateActive({ description: event.target.value })} placeholder={t('catering_choice_group_description')} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => moveGroup(active.key, -1)} className="rounded-lg p-2 text-fg-secondary hover:bg-[var(--surface-subtle)]"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => moveGroup(active.key, 1)} className="rounded-lg p-2 text-fg-secondary hover:bg-[var(--surface-subtle)]"><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => removeGroup(active.key)} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-fg-secondary">{t('catering_choice_min')}<input type="number" min={0} className="input mt-1" value={active.min_selections} onChange={(event) => updateActive({ min_selections: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <label className="text-sm text-fg-secondary">{t('catering_choice_max')}<input type="number" min={1} className="input mt-1" value={active.max_selections} onChange={(event) => updateActive({ max_selections: Math.max(1, Number(event.target.value) || 1) })} /></label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-fg-primary">
                <input type="checkbox" checked={active.max_per_item === 0} onChange={(event) => updateActive({ max_per_item: event.target.checked ? 0 : 1 })} />
                {t('catering_choice_allow_repeats')}
              </label>

              <div className="mt-5 flex items-center justify-between gap-3">
                <h5 className="font-semibold text-fg-primary">{t('catering_choice_available_articles')}</h5>
                <span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-semibold text-fg-secondary">{active.items.length}</span>
              </div>
              {active.items.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-[var(--divider)] p-5 text-center text-sm text-fg-secondary">{t('catering_choice_pick_from_library')}</p> : (
                <div className="mt-3 space-y-2">
                  {active.items.map((choice, index) => {
                    const item = itemsById.get(choice.menu_item_id);
                    return (
                      <div key={choice.menu_item_id} className="grid items-center gap-2 rounded-lg border border-[var(--divider)] p-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]">
                        <div className="flex min-w-0 items-center gap-2">
                          {item?.image_url ? <img src={item.image_url} alt="" className="h-10 w-10 rounded-md object-cover" /> : <span className="h-10 w-10 rounded-md bg-[var(--surface-subtle)]" />}
                          <div className="min-w-0"><p className="truncate text-sm font-medium text-fg-primary">{item?.name ?? `#${choice.menu_item_id}`}</p><p className="truncate text-xs text-fg-tertiary">{item ? categoryById.get(item.category_id)?.name : ''}</p></div>
                        </div>
                        <label className="text-xs text-fg-secondary">{t('catering_choice_surcharge')}<input type="number" step="0.01" className="input mt-1 py-1.5" value={choice.price_delta} onChange={(event) => updateActive({ items: active.items.map((row, rowIndex) => rowIndex === index ? { ...row, price_delta: Number(event.target.value) || 0 } : row) })} /></label>
                        <label className="flex items-center gap-2 text-xs text-fg-secondary"><input type="checkbox" checked={choice.default_quantity > 0} onChange={(event) => updateActive({ items: active.items.map((row, rowIndex) => rowIndex === index ? { ...row, default_quantity: event.target.checked ? 1 : 0 } : row) })} />{t('catering_choice_chef_default')}</label>
                        <button type="button" aria-label={t('catering_remove_image')} onClick={() => updateActive({ items: active.items.filter((_, rowIndex) => rowIndex !== index) })} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>}
          </div>
        </div>
      )}
    </div>
  );
}
