'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, ChevronUp, FolderPlus, ListChecks, Maximize2, Minimize2, PackageCheck, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  listCateringArticleLibrary,
  type CateringChoiceGroupInput,
  type CateringIncludedItemInput,
  type CateringIncludedSectionInput,
  type CateringLibraryItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

const INCLUDED_KEY = '__included__';

export type CateringChoiceGroupDraft = CateringChoiceGroupInput & { key: string };
export type CateringIncludedSectionDraft = CateringIncludedSectionInput & { key: string };

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

export function newIncludedSectionDraft(index: number, name = ''): CateringIncludedSectionDraft {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `included-section-${Date.now()}-${index}`,
    name,
    description: '',
    items: [],
  };
}

export function toIncludedSectionInputs(sections: CateringIncludedSectionDraft[]): CateringIncludedSectionInput[] {
  return sections.map(({ key: _key, ...section }) => section);
}

type Props = {
  restaurantId: number;
  groups: CateringChoiceGroupDraft[];
  onChange: (next: CateringChoiceGroupDraft[]) => void;
  includedItems: CateringIncludedItemInput[];
  onIncludedItemsChange: (next: CateringIncludedItemInput[]) => void;
  includedSections: CateringIncludedSectionDraft[];
  onIncludedSectionsChange: (next: CateringIncludedSectionDraft[]) => void;
};

export default function CateringFormulaComposer({
  restaurantId,
  groups,
  onChange,
  includedItems,
  onIncludedItemsChange,
  includedSections,
  onIncludedSectionsChange,
}: Props) {
  const { t } = useI18n();
  const [library, setLibrary] = useState<CateringLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [activeKey, setActiveKey] = useState(includedSections[0]?.key ?? INCLUDED_KEY);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [expanded]);

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

  const activeSection = includedSections.find((section) => section.key === activeKey) ?? null;
  const isIncluded = activeKey === INCLUDED_KEY || activeSection !== null;
  const active = groups.find((group) => group.key === activeKey) ?? null;
  const itemsById = useMemo(() => new Map(library.map((item) => [item.id, item])), [library]);
  const categories = useMemo(() => {
    const found = new Map<number, string>();
    for (const item of library) {
      if (!found.has(item.category_id)) found.set(item.category_id, item.category_name);
    }
    return Array.from(found, ([id, name]) => ({ id, name }));
  }, [library]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const categoryRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return categories.map((category) => {
      const items = library.filter((item) => item.category_id === category.id);
      const categoryMatches = category.name.toLocaleLowerCase().includes(query);
      const visibleItems = !query || categoryMatches ? items : items.filter((item) => item.name.toLocaleLowerCase().includes(query));
      return { category, items, visibleItems };
    }).filter((row) => row.visibleItems.length > 0);
  }, [categories, library, search]);
  const selectedIds = useMemo(() => new Set(
    isIncluded
      ? [...includedItems, ...includedSections.flatMap((section) => section.items)].flatMap((item) => item.menu_item_id ? [item.menu_item_id] : [])
      : (active?.items ?? []).flatMap((item) => item.menu_item_id ? [item.menu_item_id] : []),
  ), [active?.items, includedItems, includedSections, isIncluded]);

  const activeIncludedItems = activeSection?.items ?? includedItems;
  const setActiveIncludedItems = (items: CateringIncludedItemInput[]) => {
    if (activeSection) {
      onIncludedSectionsChange(includedSections.map((section) => section.key === activeSection.key ? { ...section, items } : section));
    } else {
      onIncludedItemsChange(items);
    }
  };

  const updateActive = (patch: Partial<CateringChoiceGroupDraft>) => {
    if (active) onChange(groups.map((group) => group.key === active.key ? { ...group, ...patch } : group));
  };
  const addGroup = () => {
    const next = newChoiceGroupDraft(groups.length, t('catering_choice_group_default_name'));
    onChange([...groups, next]);
    setActiveKey(next.key);
  };
  const addIncludedSection = (name = t('catering_included_section_default_name'), items: CateringIncludedItemInput[] = []) => {
    const next = { ...newIncludedSectionDraft(includedSections.length, name), items };
    onIncludedSectionsChange([...includedSections, next]);
    setActiveKey(next.key);
  };
  const updateActiveSection = (patch: Partial<CateringIncludedSectionDraft>) => {
    if (activeSection) onIncludedSectionsChange(includedSections.map((section) => section.key === activeSection.key ? { ...section, ...patch } : section));
  };
  const moveIncludedSection = (direction: -1 | 1) => {
    if (!activeSection) return;
    const index = includedSections.findIndex((section) => section.key === activeSection.key);
    const target = index + direction;
    if (target < 0 || target >= includedSections.length) return;
    const next = [...includedSections];
    [next[index], next[target]] = [next[target], next[index]];
    onIncludedSectionsChange(next);
  };
  const removeIncludedSection = () => {
    if (!activeSection) return;
    const index = includedSections.findIndex((section) => section.key === activeSection.key);
    const next = includedSections.filter((section) => section.key !== activeSection.key);
    onIncludedSectionsChange(next);
    setActiveKey(next[Math.min(index, next.length - 1)]?.key ?? INCLUDED_KEY);
  };
  const moveGroup = (direction: -1 | 1) => {
    if (!active) return;
    const index = groups.findIndex((group) => group.key === active.key);
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const removeGroup = () => {
    if (!active) return;
    const index = groups.findIndex((group) => group.key === active.key);
    const next = groups.filter((group) => group.key !== active.key);
    onChange(next);
    setActiveKey(next[Math.min(index, next.length - 1)]?.key ?? INCLUDED_KEY);
  };

  const addLinkedItem = (menuItemId: number) => {
    if (selectedIds.has(menuItemId)) return;
    if (isIncluded) {
      setActiveIncludedItems([...activeIncludedItems, { menu_item_id: menuItemId, description: '' }]);
    } else if (active) {
      updateActive({ items: [...active.items, { menu_item_id: menuItemId, price_delta: 0, default_quantity: 0 }] });
    }
  };
  const removeLinkedItem = (menuItemId: number) => {
    if (isIncluded) {
      setActiveIncludedItems(activeIncludedItems.filter((item) => item.menu_item_id !== menuItemId));
    } else if (active) {
      updateActive({ items: active.items.filter((item) => item.menu_item_id !== menuItemId) });
    }
  };
  const toggleItem = (menuItemId: number) => selectedIds.has(menuItemId) ? removeLinkedItem(menuItemId) : addLinkedItem(menuItemId);
  const addCategory = (items: CateringLibraryItem[]) => {
    const additions = items.filter((item) => item.is_active && !selectedIds.has(item.id));
    if (!additions.length) return;
    if (isIncluded) {
      const rows = additions.map((item) => ({ menu_item_id: item.id, description: '' }));
      if (activeSection) setActiveIncludedItems([...activeIncludedItems, ...rows]);
      else addIncludedSection(items[0]?.category_name ?? t('catering_included_section_default_name'), rows);
    } else if (active) {
      updateActive({ items: [...active.items, ...additions.map((item) => ({ menu_item_id: item.id, price_delta: 0, default_quantity: 0 }))] });
    }
  };
  const addManualItem = () => {
    const name = manualName.trim();
    if (!name) return;
    if (isIncluded) {
      setActiveIncludedItems([...activeIncludedItems, { name, description: '' }]);
    } else if (active) {
      updateActive({ items: [...active.items, { name, description: '', price_delta: 0, default_quantity: 0 }] });
    }
    setManualName('');
  };

  const defaultCount = active?.items.reduce((sum, item) => sum + item.default_quantity, 0) ?? 0;
  const setMinimum = (raw: number) => {
    if (!active) return;
    const min = Math.max(0, Number.isFinite(raw) ? raw : 0);
    updateActive({ min_selections: min, max_selections: Math.max(min, active.max_selections) });
  };
  const setMaximum = (raw: number) => {
    if (!active) return;
    const max = Math.max(1, Number.isFinite(raw) ? raw : 1);
    let defaultsLeft = max;
    const items = active.items.map((item) => {
      if (item.default_quantity <= 0) return item;
      if (defaultsLeft <= 0) return { ...item, default_quantity: 0 };
      defaultsLeft -= 1;
      return { ...item, default_quantity: 1 };
    });
    updateActive({ max_selections: max, min_selections: Math.min(active.min_selections, max), items });
  };
  const setChefDefault = (itemIndex: number, checked: boolean) => {
    if (!active) return;
    updateActive({ items: active.items.map((item, index) => ({
      ...item,
      default_quantity: index === itemIndex
        ? (checked ? 1 : 0)
        : (checked && active.max_selections === 1 ? 0 : item.default_quantity),
    })) });
  };

  const content = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-fg-primary">{t('catering_formula_composition')}</h4>
          <p className="mt-0.5 max-w-2xl text-xs text-fg-secondary">{t('catering_formula_composition_hint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <Minimize2 /> : <Maximize2 />}
            {expanded ? t('catering_formula_collapse') : t('catering_formula_expand')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => addIncludedSection()}><FolderPlus />{t('catering_included_add_section')}</Button>
          <Button variant="secondary" size="sm" onClick={addGroup}><Plus />{t('catering_choice_add_group')}</Button>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setActiveKey(INCLUDED_KEY)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-start transition ${isIncluded ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-[var(--divider)] bg-[var(--surface)] text-fg-secondary hover:border-brand-500/50'}`}>
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface-subtle)]"><PackageCheck className="h-3.5 w-3.5" /></span>
          <span className="text-sm font-semibold">{t('catering_included_unsectioned_title')}</span>
          <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs text-fg-tertiary">{includedItems.length}</span>
        </button>
        {includedSections.map((section) => (
          <button key={section.key} type="button" onClick={() => setActiveKey(section.key)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-start transition ${activeSection?.key === section.key ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-[var(--divider)] bg-[var(--surface)] text-fg-secondary hover:border-brand-500/50'}`}>
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface-subtle)]"><FolderPlus className="h-3.5 w-3.5" /></span>
            <span className="max-w-[10rem] truncate text-sm font-semibold">{section.name || t('catering_included_section_unnamed')}</span>
            <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs text-fg-tertiary">{section.items.length}</span>
          </button>
        ))}
        {groups.map((group, index) => (
          <button key={group.key} type="button" onClick={() => setActiveKey(group.key)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-start transition ${active?.key === group.key ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-[var(--divider)] bg-[var(--surface)] text-fg-secondary hover:border-brand-500/50'}`}>
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface-subtle)] text-xs font-bold">{index + 1}</span>
            <span className="max-w-[10rem] truncate text-sm font-semibold">{group.name || t('catering_choice_unnamed')}</span>
            <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs text-fg-tertiary">{group.min_selections === group.max_selections ? group.min_selections : `${group.min_selections}–${group.max_selections}`} / {group.items.length}</span>
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex min-h-[18rem] flex-col overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-3 lg:min-h-0">
          <label className="relative block">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-tertiary" />
            <input className="input pe-9 ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('catering_choice_search_library')} />
            {search && <button type="button" aria-label={t('catering_choice_clear_search')} onClick={() => setSearch('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-tertiary"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <div className="mb-2 mt-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t('catering_choice_article_library')}</p>
            {!loading && !loadError && <span className="text-xs text-fg-tertiary">{categories.length} {t('catering_choice_categories_short')} · {library.length} {t('catering_choice_articles_short')}</span>}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-secondary"><RefreshCw className="h-4 w-4 animate-spin" />{t('catering_choice_library_loading')}</div>
            ) : loadError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                <p className="text-sm font-medium text-fg-primary">{t('catering_choice_library_error')}</p>
                <p className="mt-1 text-xs text-fg-secondary">{loadError}</p>
                <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />{t('catering_choice_library_retry')}</button>
              </div>
            ) : categoryRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--divider)] p-5 text-center">
                <p className="text-sm font-medium text-fg-primary">{library.length === 0 ? t('catering_choice_library_empty') : t('catering_choice_no_search_results')}</p>
                <p className="mt-1 text-xs text-fg-secondary">{library.length === 0 ? t('catering_choice_library_empty_hint') : `« ${search.trim()} »`}</p>
              </div>
            ) : categoryRows.map(({ category, items, visibleItems }) => (
              <LibraryCategory
                key={category.id}
                category={category}
                items={items}
                visibleItems={visibleItems}
                expanded={expandedCategories.has(category.id) || Boolean(search.trim())}
                selectedIds={selectedIds}
                onToggleExpanded={() => setExpandedCategories((previous) => {
                  const next = new Set(previous);
                  if (next.has(category.id)) next.delete(category.id); else next.add(category.id);
                  return next;
                })}
                onAddCategory={addCategory}
                onToggleItem={toggleItem}
                importAsSection={isIncluded && !activeSection}
                t={t}
              />
            ))}
          </div>
        </aside>

        <div className="min-w-0 overflow-y-auto rounded-xl border border-[var(--divider)] bg-[var(--surface)]">
          {isIncluded ? (
            <IncludedPanel
              items={activeIncludedItems}
              libraryById={itemsById}
              categoryById={categoryById}
              manualName={manualName}
              onManualName={setManualName}
              onAddManual={addManualItem}
              onChange={setActiveIncludedItems}
              section={activeSection}
              onSectionChange={updateActiveSection}
              onMoveSection={moveIncludedSection}
              onRemoveSection={removeIncludedSection}
              sectionIndex={activeSection ? includedSections.findIndex((section) => section.key === activeSection.key) : -1}
              sectionCount={includedSections.length}
              t={t}
            />
          ) : active ? (
            <section>
              <div className="sticky top-0 z-10 border-b border-[var(--divider)] bg-[var(--surface)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">{t('catering_choice_step_label').replace('{n}', String(groups.findIndex((group) => group.key === active.key) + 1))}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={groups.indexOf(active) === 0} aria-label={t('catering_move_up')} onClick={() => moveGroup(-1)} className="rounded-lg p-2 text-fg-secondary disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" disabled={groups.indexOf(active) === groups.length - 1} aria-label={t('catering_move_down')} onClick={() => moveGroup(1)} className="rounded-lg p-2 text-fg-secondary disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" aria-label={t('catering_remove_image')} onClick={removeGroup} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="space-y-3">
                  <input className="input font-semibold" value={active.name} onChange={(event) => updateActive({ name: event.target.value })} placeholder={t('catering_choice_group_name')} />
                  <input className="input" value={active.description ?? ''} onChange={(event) => updateActive({ description: event.target.value })} placeholder={t('catering_choice_group_description')} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-fg-secondary">
                  <ListChecks className="h-4 w-4 text-brand-500" /><span className="font-medium text-fg-primary">{t('catering_choice_customer_selects')}</span>
                  <input type="number" min={0} aria-label={t('catering_choice_min')} className="h-8 w-16 rounded-md border border-[var(--divider)] bg-[var(--surface)] px-2 text-center" value={active.min_selections} onChange={(event) => setMinimum(Number(event.target.value))} />
                  <span>{t('catering_choice_to')}</span>
                  <input type="number" min={1} aria-label={t('catering_choice_max')} className="h-8 w-16 rounded-md border border-[var(--divider)] bg-[var(--surface)] px-2 text-center" value={active.max_selections} onChange={(event) => setMaximum(Number(event.target.value))} />
                  <span>{t('catering_choice_among').replace('{n}', String(active.items.length))}</span>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-fg-secondary"><input type="checkbox" checked={active.max_per_item === 0} onChange={(event) => updateActive({ max_per_item: event.target.checked ? 0 : 1 })} />{t('catering_choice_allow_repeats')}</label>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h5 className="font-semibold text-fg-primary">{t('catering_choice_available_articles')} <span className="ms-1 text-sm font-normal text-fg-tertiary">({active.items.length})</span></h5><p className="mt-0.5 text-xs text-fg-secondary">{t('catering_choice_selected_articles_hint')}</p></div>
                  <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">{t('catering_choice_defaults_count').replace('{count}', String(defaultCount)).replace('{max}', String(active.max_selections))}</span>
                </div>
                <div className="mt-3 rounded-lg border border-dashed border-brand-500/35 bg-brand-500/5 p-3">
                  <p className="text-xs font-semibold text-fg-primary">{t('catering_choice_manual_title')}</p>
                  <div className="mt-2 flex gap-2">
                    <input className="input h-9" value={manualName} onChange={(event) => setManualName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addManualItem(); } }} placeholder={t('catering_choice_manual_placeholder')} />
                    <Button variant="secondary" size="sm" onClick={addManualItem} disabled={!manualName.trim()}><Plus />{t('catering_choice_manual_add')}</Button>
                  </div>
                </div>
                {active.items.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-[var(--divider)] p-5 text-center text-sm text-fg-secondary">{t('catering_choice_pick_or_create')}</p> : (
                  <div className="mt-3 overflow-hidden rounded-lg border border-[var(--divider)]">
                    {active.items.map((choice, index) => {
                      const item = choice.menu_item_id ? itemsById.get(choice.menu_item_id) : undefined;
                      const defaultLimitReached = defaultCount >= active.max_selections && choice.default_quantity === 0;
                      return (
                        <div key={choice.menu_item_id ? `linked-${choice.menu_item_id}` : `manual-${index}`} className="grid items-center gap-3 border-b border-[var(--divider)] p-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_2.5rem]">
                          {choice.menu_item_id ? (
                            <ArticleIdentity item={item} categoryName={item ? categoryById.get(item.category_id) : ''} fallback={`#${choice.menu_item_id}`} />
                          ) : (
                            <div className="min-w-0 space-y-1">
                              <input className="input h-9 font-medium" value={choice.name ?? ''} onChange={(event) => updateActive({ items: active.items.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row) })} aria-label={t('catering_choice_manual_name')} />
                              <input className="input h-8 text-xs" value={choice.description ?? ''} onChange={(event) => updateActive({ items: active.items.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row) })} placeholder={t('catering_choice_manual_description')} />
                            </div>
                          )}
                          <input type="number" step="0.01" aria-label={t('catering_choice_surcharge')} className="h-9 w-full rounded-md border border-[var(--divider)] bg-[var(--surface)] px-2 text-sm" value={choice.price_delta} onChange={(event) => updateActive({ items: active.items.map((row, rowIndex) => rowIndex === index ? { ...row, price_delta: Number(event.target.value) || 0 } : row) })} />
                          <label className="flex items-center gap-2 text-xs text-fg-secondary"><input type="checkbox" disabled={defaultLimitReached} checked={choice.default_quantity > 0} onChange={(event) => setChefDefault(index, event.target.checked)} /><span className="sm:hidden">{t('catering_choice_chef_default')}</span></label>
                          <button type="button" aria-label={t('catering_remove_image')} onClick={() => updateActive({ items: active.items.filter((_, rowIndex) => rowIndex !== index) })} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (expanded && typeof document !== 'undefined') {
    return createPortal(
      <div role="dialog" aria-modal="true" aria-label={t('catering_formula_composition')} className="fixed inset-0 z-[80] bg-[var(--surface)] p-4 sm:p-6">
        {content}
      </div>,
      document.body,
    );
  }
  return content;
}

function ArticleIdentity({ item, categoryName, fallback }: { item?: CateringLibraryItem; categoryName?: string; fallback: string }) {
  return <div className="flex min-w-0 items-center gap-2">
    {item?.image_url ? <img src={item.image_url} alt="" className="h-9 w-9 rounded-md object-cover" /> : <span className="h-9 w-9 shrink-0 rounded-md bg-[var(--surface-subtle)]" />}
    <div className="min-w-0"><p className="truncate text-sm font-medium text-fg-primary">{item?.name ?? fallback}</p><p className="truncate text-xs text-fg-tertiary">{categoryName}</p></div>
  </div>;
}

function IncludedPanel({ items, libraryById, categoryById, manualName, onManualName, onAddManual, onChange, section, onSectionChange, onMoveSection, onRemoveSection, sectionIndex, sectionCount, t }: {
  items: CateringIncludedItemInput[];
  libraryById: Map<number, CateringLibraryItem>;
  categoryById: Map<number, string>;
  manualName: string;
  onManualName: (value: string) => void;
  onAddManual: () => void;
  onChange: (items: CateringIncludedItemInput[]) => void;
  section: CateringIncludedSectionDraft | null;
  onSectionChange: (patch: Partial<CateringIncludedSectionDraft>) => void;
  onMoveSection: (direction: -1 | 1) => void;
  onRemoveSection: () => void;
  sectionIndex: number;
  sectionCount: number;
  t: (key: string) => string;
}) {
  return <section>
    <div className="sticky top-0 z-10 border-b border-[var(--divider)] bg-[var(--surface)] p-4">
      {section ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600"><FolderPlus className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1 space-y-2">
                <input className="input font-semibold" value={section.name} onChange={(event) => onSectionChange({ name: event.target.value })} placeholder={t('catering_included_section_name')} />
                <input className="input" value={section.description ?? ''} onChange={(event) => onSectionChange({ description: event.target.value })} placeholder={t('catering_included_section_description')} />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={sectionIndex <= 0} aria-label={t('catering_move_up')} onClick={() => onMoveSection(-1)} className="rounded-lg p-2 text-fg-secondary disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" disabled={sectionIndex < 0 || sectionIndex >= sectionCount - 1} aria-label={t('catering_move_down')} onClick={() => onMoveSection(1)} className="rounded-lg p-2 text-fg-secondary disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" aria-label={t('catering_included_remove_section')} onClick={onRemoveSection} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-secondary">{t('catering_included_section_hint')}</p>
        </div>
      ) : (
        <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600"><PackageCheck className="h-5 w-5" /></span><div><h5 className="font-semibold text-fg-primary">{t('catering_included_unsectioned_title')}</h5><p className="mt-0.5 text-xs leading-relaxed text-fg-secondary">{t('catering_included_unsectioned_hint')}</p></div></div>
      )}
      <div className="mt-3 flex gap-2">
        <input className="input" value={manualName} onChange={(event) => onManualName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAddManual(); } }} placeholder={t('catering_included_manual_placeholder')} />
        <Button variant="secondary" size="sm" onClick={onAddManual} disabled={!manualName.trim()}><Plus />{t('catering_included_manual_add')}</Button>
      </div>
    </div>
    <div className="p-4">
      <p className="mb-3 text-xs text-fg-secondary">{t('catering_included_library_hint')}</p>
      {items.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--divider)] p-6 text-center text-sm text-fg-secondary">{t('catering_included_empty')}</p> : (
        <div className="overflow-hidden rounded-lg border border-[var(--divider)]">{items.map((included, index) => {
          const item = included.menu_item_id ? libraryById.get(included.menu_item_id) : undefined;
          return <div key={included.menu_item_id ? `linked-${included.menu_item_id}` : `manual-${index}`} className="flex items-center gap-2 border-b border-[var(--divider)] p-3 last:border-b-0">
            {included.menu_item_id ? <div className="min-w-0 flex-1"><ArticleIdentity item={item} categoryName={item ? categoryById.get(item.category_id) : ''} fallback={`#${included.menu_item_id}`} /></div> : <div className="min-w-0 flex-1"><input className="input h-9" value={included.name ?? ''} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /></div>}
            <button type="button" disabled={index === 0} aria-label={t('catering_move_up')} onClick={() => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} className="rounded-lg p-2 text-fg-secondary disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" disabled={index === items.length - 1} aria-label={t('catering_move_down')} onClick={() => { const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next); }} className="rounded-lg p-2 text-fg-secondary disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" aria-label={t('catering_remove_image')} onClick={() => onChange(items.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
          </div>;
        })}</div>
      )}
    </div>
  </section>;
}

function LibraryCategory({ category, items, visibleItems, expanded, selectedIds, onToggleExpanded, onAddCategory, onToggleItem, importAsSection, t }: {
  category: { id: number; name: string };
  items: CateringLibraryItem[];
  visibleItems: CateringLibraryItem[];
  expanded: boolean;
  selectedIds: Set<number>;
  onToggleExpanded: () => void;
  onAddCategory: (items: CateringLibraryItem[]) => void;
  onToggleItem: (id: number) => void;
  importAsSection: boolean;
  t: (key: string) => string;
}) {
  const activeItems = items.filter((item) => item.is_active);
  const selectedCount = activeItems.filter((item) => selectedIds.has(item.id)).length;
  const imported = activeItems.length > 0 && selectedCount === activeItems.length;
  return <section className="overflow-hidden rounded-lg border border-[var(--divider)] bg-[var(--surface)]">
    <div className="flex items-center gap-2 border-s-2 border-s-brand-500 px-2.5 py-2">
      <button type="button" onClick={onToggleExpanded} className="flex min-w-0 flex-1 items-center gap-2 text-start">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span className="truncate text-sm font-semibold text-fg-primary">{category.name}</span><span className="text-xs text-fg-tertiary">{selectedCount}/{activeItems.length}</span></button>
      <button type="button" disabled={imported || activeItems.length === 0} onClick={() => onAddCategory(items)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500/10 disabled:text-fg-tertiary">{imported ? <Check className="h-3.5 w-3.5" /> : <FolderPlus className="h-3.5 w-3.5" />}{imported ? t('catering_choice_category_imported_short') : importAsSection ? t('catering_included_import_section') : t('catering_choice_add_remaining').replace('{n}', String(activeItems.length - selectedCount))}</button>
    </div>
    {expanded && <div className="border-t border-[var(--divider)] p-1.5">{visibleItems.map((item) => {
      const selected = selectedIds.has(item.id);
      return <button key={item.id} type="button" disabled={!item.is_active} aria-pressed={selected} onClick={() => onToggleItem(item.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-start transition disabled:opacity-40 ${selected ? 'bg-brand-500/10 text-brand-700' : 'hover:bg-[var(--surface-subtle)]'}`}>{item.image_url ? <img src={item.image_url} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="h-8 w-8 rounded-md bg-[var(--surface-subtle)]" />}<span className="min-w-0 flex-1 truncate text-sm">{item.name}</span><span className={`grid h-6 w-6 place-items-center rounded-full border ${selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-[var(--divider)] text-fg-tertiary'}`}>{selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</span></button>;
    })}</div>}
  </section>;
}
