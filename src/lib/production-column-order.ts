'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  saveProductionColumnOrder,
  type ProductionSheetResponse,
  type ProductionSheetCategory,
  type ProductionColumnOrderConfig,
} from '@/lib/api';

// Restaurant-wide column layout for the production sheet, shared across all
// staff and devices (server-persisted on the Restaurant). Categories are
// ordered as whole blocks; items are ordered within their category. Both orders
// are stored as *partial* preferences (only ids the user has moved) so a
// newly-added category or item always still appears — see orderBy().
type ColumnOrderState = ProductionColumnOrderConfig;

const EMPTY: ColumnOrderState = { categories: [], items: {} };

// Coerce whatever the server returned (possibly null / partial) into a full state.
function normalize(cfg: ProductionColumnOrderConfig | null | undefined): ColumnOrderState {
  if (!cfg) return EMPTY;
  return {
    categories: Array.isArray(cfg.categories) ? cfg.categories : [],
    items: cfg.items && typeof cfg.items === 'object' ? cfg.items : {},
  };
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
 * Owns the production sheet's shared column layout: seeds from the layout the
 * server returned with the sheet (`serverOrder`), applies it to a sheet before
 * render, and persists drag reorders back to the server so every device sees
 * the same arrangement. Optimistic: a failed save reverts the local change.
 */
export function useProductionColumnOrder(
  restaurantId: number,
  serverOrder: ProductionColumnOrderConfig | null | undefined,
): ProductionColumnOrder {
  const [state, setState] = useState<ColumnOrderState>(EMPTY);
  // Latest state for the event-handler mutators, so they compute from current
  // order without adding it to their dependency lists.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Seed from the server's saved layout whenever it arrives / changes. Keyed on
  // a stable serialisation so a refetch returning the same value is a no-op and
  // never clobbers a just-made local reorder.
  const serverKey = serverOrder ? JSON.stringify(serverOrder) : '';
  useEffect(() => {
    setState(normalize(serverOrder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  // Optimistically apply `next`, then persist. On failure, revert to `prev` so
  // the UI never shows a layout that didn't save. Best-effort like the old
  // localStorage code — ordering is a convenience, never blocks the sheet.
  const commit = useCallback(
    (next: ColumnOrderState) => {
      const prev = stateRef.current;
      stateRef.current = next;
      setState(next);
      saveProductionColumnOrder(restaurantId, next).catch((err) => {
        console.error('[production] failed to save column order', err);
        stateRef.current = prev;
        setState(prev);
      });
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
