'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductionSheetResponse, ProductionSheetCategory } from '@/lib/api';

// Persisted, per-restaurant column layout for the production sheet. Categories
// are ordered as whole blocks; items are ordered within their category. Both
// orders are stored as *partial* preferences (only ids the user has moved) so a
// newly-added category or item always still appears — see orderBy().
interface ColumnOrderState {
  /** Preferred category-id order (category bands, left to right). */
  categories: number[];
  /** Preferred item-id order within each category id. */
  items: Record<number, number[]>;
}

const EMPTY: ColumnOrderState = { categories: [], items: {} };

// Mirrors the stock-level convention (foody.stock.level.<rid>.<itemId>).
function storageKey(restaurantId: number): string {
  return `foody.production.colorder.${restaurantId}`;
}

function load(restaurantId: number): ColumnOrderState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ColumnOrderState>;
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Order `ids` by the saved preference `pref`, appending any id not covered by
 * `pref` in its original relative position. This keeps the layout stable while
 * ensuring brand-new categories/items are never hidden by a stale saved order.
 */
export function orderBy(ids: number[], pref: number[]): number[] {
  if (!pref.length) return ids;
  const present = new Set(ids);
  const ordered = pref.filter((id) => present.has(id));
  const placed = new Set(ordered);
  for (const id of ids) if (!placed.has(id)) ordered.push(id);
  return ordered;
}

/** Move `fromId` to just before `toId` within `ids` (drop-before semantics). */
export function reorder(ids: number[], fromId: number, toId: number): number[] {
  if (fromId === toId) return ids;
  const out = ids.filter((id) => id !== fromId);
  const idx = out.indexOf(toId);
  if (idx < 0) return ids;
  out.splice(idx, 0, fromId);
  return out;
}

export interface ProductionColumnOrder {
  /** Reorder a sheet's categories + items per the saved preference. */
  applyOrder: (sheet: ProductionSheetResponse) => ProductionSheetResponse;
  /** Persist a new full category-id order (from a drag drop). */
  setCategoryOrder: (categoryIds: number[]) => void;
  /** Persist a new full item-id order within a category (from a drag drop). */
  setItemOrder: (categoryId: number, itemIds: number[]) => void;
  /** Clear all saved ordering, restoring the server's natural order. */
  reset: () => void;
  /** Whether any custom order is saved (drives the "reset" action's visibility). */
  hasCustomOrder: boolean;
}

/**
 * Owns the production sheet's column layout: loads the saved order for the
 * restaurant, applies it to a sheet before render, and persists drag reorders
 * to localStorage. Client-only; a no-op for restaurants with no saved order.
 */
export function useProductionColumnOrder(restaurantId: number): ProductionColumnOrder {
  const [state, setState] = useState<ColumnOrderState>(EMPTY);
  // Latest state for the event-handler mutators, so they compute from current
  // order without adding it to their dependency lists.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(load(restaurantId));
  }, [restaurantId]);

  // Writes happen only from user drag actions (event handlers), always scoped to
  // the current restaurant — so we never risk writing one restaurant's order to
  // another's key on a restaurant switch.
  const commit = useCallback(
    (next: ColumnOrderState) => {
      stateRef.current = next;
      setState(next);
      try {
        window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode errors — ordering is a convenience */
      }
    },
    [restaurantId],
  );

  const setCategoryOrder = useCallback(
    (categoryIds: number[]) => commit({ ...stateRef.current, categories: categoryIds }),
    [commit],
  );

  const setItemOrder = useCallback(
    (categoryId: number, itemIds: number[]) =>
      commit({
        ...stateRef.current,
        items: { ...stateRef.current.items, [categoryId]: itemIds },
      }),
    [commit],
  );

  const reset = useCallback(() => commit(EMPTY), [commit]);

  const applyOrder = useCallback(
    (sheet: ProductionSheetResponse): ProductionSheetResponse => {
      const byId = new Map(sheet.categories.map((c) => [c.id, c] as const));
      const categories = orderBy(
        sheet.categories.map((c) => c.id),
        state.categories,
      )
        .map((id) => byId.get(id))
        .filter((c): c is ProductionSheetCategory => !!c)
        .map((cat) => ({ ...cat, item_ids: orderBy(cat.item_ids, state.items[cat.id] ?? []) }));
      return { ...sheet, categories };
    },
    [state],
  );

  return {
    applyOrder,
    setCategoryOrder,
    setItemOrder,
    reset,
    hasCustomOrder: state.categories.length > 0 || Object.keys(state.items).length > 0,
  };
}
