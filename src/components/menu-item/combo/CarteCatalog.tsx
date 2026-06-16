'use client';

// Left-pane catalog for the combo composer (Design B — two-pane builder).
//
// Picks a carte at the top, then renders that carte's item categories as a
// collapsible tree. Each item line is a click-to-toggle that adds/removes the
// item from the currently-active step. Each category header has a "+ tout
// ajouter" affordance that drops the whole category into the active step as
// a category-mode binding (the rotation use case).
//
// The catalog is presentational + emits intent — actual draft mutations live
// in CompositionTab, which owns the step list and the active-step selection.

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import type { Menu, MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Select, InputGroup } from '@/components/ds';
import type { ComboStepDraft } from './types';

const CARTE_FILTER_STORAGE_KEY = 'foody.combo.carte';

interface Props {
  menus: Menu[];
  categories: MenuCategory[];
  /** Flat item lookup — used to derive which item-categories contain items
   *  from the active step, so opening a step auto-expands the categories
   *  the operator needs to see (and leaves the rest collapsed). */
  itemsById: Map<number, MenuItem>;
  /** The step the operator is currently composing. Item rows show a ✓ when the
   *  item is already in this step's items[]. Null still allows clicks
   *  (CompositionTab will create a fresh step). */
  activeStep: ComboStepDraft | null;
  /** Items reachable through any non-hidden, channel-enabled group on any
   *  carte. Items outside this set are tagged "hors carte" — combo will
   *  surface them only via the force-include toggle on the step row. */
  anyCarteItemIds: Set<number>;
  onAddItem: (menuItemId: number) => void;
  onRemoveItem: (menuItemId: number) => void;
  onSetCategory: (categoryId: number) => void;
}

export default function CarteCatalog({
  menus,
  categories,
  itemsById,
  activeStep,
  anyCarteItemIds,
  onAddItem,
  onRemoveItem,
  onSetCategory,
}: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  // Carte selector — defaults to the first menu, persists across sessions so
  // operators don't reselect on every composer open.
  const [carteId, setCarteId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return menus[0]?.id ?? null;
    try {
      const raw = localStorage.getItem(CARTE_FILTER_STORAGE_KEY);
      if (raw === '') return null;
      const id = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(id) && menus.some((m) => m.id === id)) return id;
    } catch { /* storage may be disabled */ }
    return menus[0]?.id ?? null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(CARTE_FILTER_STORAGE_KEY, carteId == null ? '' : String(carteId)); } catch { /* */ }
  }, [carteId]);

  // Set of menu_item.id reachable through the selected carte's groups (new
  // model) or legacy categories field. Null = no scope (show full library).
  const allowedItemIds = useMemo<Set<number> | null>(() => {
    if (carteId == null) return null;
    const carte = menus.find((m) => m.id === carteId);
    if (!carte) return null;
    const ids = new Set<number>();
    for (const g of carte.groups ?? []) {
      for (const it of g.items ?? []) ids.add(it.id);
    }
    for (const c of carte.categories ?? []) {
      for (const it of c.items ?? []) ids.add(it.id);
    }
    return ids;
  }, [carteId, menus]);

  // Item-categories filtered down to the items reachable through the selected
  // carte. Empty categories are dropped so the tree only shows useful nodes.
  const visibleCategories = useMemo<MenuCategory[]>(() => {
    if (allowedItemIds == null) return categories;
    return categories
      .map((c) => ({ ...c, items: (c.items ?? []).filter((i) => allowedItemIds.has(i.id)) }))
      .filter((c) => (c.items?.length ?? 0) > 0);
  }, [categories, allowedItemIds]);

  // Per-category expand state. Default: ALL collapsed so the operator sees
  // a tidy table-of-contents on open. Two paths to expansion:
  //   (a) operator clicks a category header chevron to toggle it manually
  //   (b) an active step's items live in this category — opening that step
  //       auto-expands the relevant categories (see effect below)
  // Search also forces expand of any matching category (computed in render).
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const toggleExpanded = (catId: number) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });

  // When the active step changes, expand the categories whose items appear
  // in that step (plus the bound category for dynamic-mode steps). Doesn't
  // collapse anything — the operator's manual expansions are preserved.
  const activeStepKey = activeStep?.key;
  useEffect(() => {
    if (!activeStep) return;
    const expand = new Set<number>();
    for (const di of activeStep.items) {
      const item = itemsById.get(di.menu_item_id);
      if (item) expand.add(item.category_id);
    }
    if (expand.size === 0) return;
    setExpandedCats((prev) => {
      const next = new Set(prev);
      expand.forEach((id) => next.add(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepKey]);

  // Search — filters the tree by name (item or category). Empty = show all.
  const [search, setSearch] = useState('');
  const filteredCategories = useMemo<MenuCategory[]>(() => {
    if (!search.trim()) return visibleCategories;
    const q = search.toLowerCase();
    return visibleCategories
      .map((c) => {
        const catMatch = c.name.toLowerCase().includes(q);
        const items = (c.items ?? []).filter((i) => catMatch || i.name.toLowerCase().includes(q));
        return { ...c, items };
      })
      .filter((c) => (c.items?.length ?? 0) > 0);
  }, [visibleCategories, search]);

  // Lookup: items already in the active step (explicit mode).
  const inActiveStep = useMemo(() => {
    if (!activeStep) return new Set<number>();
    return new Set(activeStep.items.map((it) => it.menu_item_id));
  }, [activeStep]);

  return (
    <div className="flex flex-col gap-[var(--s-3)] min-h-0">
      {/* Carte selector + search — both compact, both always visible. */}
      <div className="flex flex-col gap-[var(--s-2)]">
        <label className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)]">
          {t('catalogCarteLabel')}
        </label>
        <Select
          value={carteId ?? ''}
          onChange={(e) => setCarteId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('catalogAllCartes')}</option>
          {menus.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
        <InputGroup
          leading={<Search />}
          inputProps={{
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: t('catalogSearch'),
          }}
        />
      </div>

      {/* Tree */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {filteredCategories.length === 0 ? (
          <div className="text-fs-xs text-[var(--fg-subtle)] text-center py-[var(--s-6)]">
            {carteId != null && allowedItemIds && allowedItemIds.size === 0
              ? t('catalogCarteEmpty')
              : t('catalogNoResults')}
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--s-2)]">
            {filteredCategories.map((cat) => {
              // Search overrides manual collapse — when the operator is
              // hunting for an item by name, hiding matches behind a
              // chevron defeats the point.
              const expanded = expandedCats.has(cat.id) || search.trim().length > 0;
              return (
                <div
                  key={cat.id}
                  className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] overflow-hidden"
                >
                  {/* Category header — chevron toggles expansion, "tout
                      ajouter" bulk-adds this category's items to the active
                      step as explicit entries. The whole header is clickable
                      for the chevron; "tout ajouter" is a sibling button. */}
                  <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] border-b border-[var(--line)] bg-[var(--surface-2)]">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(cat.id)}
                      className="inline-flex items-center gap-1 flex-1 min-w-0 text-start"
                    >
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-muted)] shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--fg-muted)] shrink-0" />
                      )}
                      <span className="text-fs-xs font-bold uppercase tracking-[.06em] text-[var(--fg)] truncate">
                        {cat.name}
                      </span>
                      <span className="text-fs-xs text-[var(--fg-subtle)] font-normal ms-1">
                        · {(cat.items ?? []).length}
                      </span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onSetCategory(cat.id)}
                        className="inline-flex items-center gap-1 text-fs-xs font-medium px-1.5 py-0.5 rounded-r-sm shrink-0 transition-colors text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_10%,transparent)]"
                        title={t('catalogAddAllTooltip')}
                      >
                        <Plus className="w-3 h-3" /> {t('catalogAddAll')}
                      </button>
                    )}
                  </div>

                  {expanded && (
                    <div>
                      {(cat.items ?? []).map((it) => {
                        const isIn = inActiveStep.has(it.id);
                        const offCarte = !anyCarteItemIds.has(it.id);
                        return (
                          <button
                            key={it.id}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => {
                              if (!canEdit) return;
                              isIn ? onRemoveItem(it.id) : onAddItem(it.id);
                            }}
                            className={`w-full flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] border-t border-[var(--line)] text-start text-fs-sm transition-colors disabled:cursor-default ${
                              isIn
                                ? 'bg-[color-mix(in_oklab,var(--brand-500)_8%,transparent)] text-[var(--fg)]'
                                : 'hover:bg-[var(--surface-2)] text-[var(--fg)]'
                            }`}
                          >
                            <div
                              className={`w-[16px] h-[16px] rounded-r-xs flex items-center justify-center shrink-0 ${
                                isIn
                                  ? 'bg-[var(--brand-500)] text-white'
                                  : 'bg-[var(--surface)] border border-[var(--line-strong)]'
                              }`}
                              aria-hidden
                            >
                              {isIn && <span className="text-[10px] leading-none font-bold">✓</span>}
                            </div>
                            <span className="flex-1 min-w-0 truncate">{it.name}</span>
                            {offCarte && (
                              <span
                                className="text-fs-xs px-1.5 py-0.5 rounded-r-sm shrink-0"
                                style={{
                                  background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
                                  color: 'var(--warning-500)',
                                }}
                                title={t('catalogOffCarteTooltip')}
                              >
                                {t('catalogOffCarteShort')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
