'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Per-restaurant display preference for the production sheet's weighed
// columns: portion grams (500) or ordered container counts (2). One page-wide
// default plus per-article overrides, persisted in localStorage. Mirrors the
// storage-key convention of production-done.ts (foody.production.done.<rid>).

export type ProductionDisplayMode = 'portions' | 'units';

interface StoredDisplay {
  mode: ProductionDisplayMode;
  byItem: Record<number, ProductionDisplayMode>;
}

const DEFAULT_STATE: StoredDisplay = { mode: 'portions', byItem: {} };

function storageKey(restaurantId: number): string {
  return `foody.production.display.${restaurantId}`;
}

function load(restaurantId: number): StoredDisplay {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId));
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    const mode: ProductionDisplayMode = parsed?.mode === 'units' ? 'units' : 'portions';
    const byItem: Record<number, ProductionDisplayMode> = {};
    if (parsed?.byItem && typeof parsed.byItem === 'object') {
      for (const [k, v] of Object.entries(parsed.byItem)) {
        const id = Number(k);
        if (Number.isFinite(id) && (v === 'units' || v === 'portions')) byItem[id] = v;
      }
    }
    return { mode, byItem };
  } catch {
    return DEFAULT_STATE;
  }
}

export interface ProductionDisplay {
  /** Page-wide default mode for weighed columns. */
  mode: ProductionDisplayMode;
  /** Effective mode for one article (its override, else the page default). */
  effectiveMode: (itemId: number) => ProductionDisplayMode;
  /** True when the article deviates from the page default. */
  isOverridden: (itemId: number) => boolean;
  /** Change the page-wide default (keeps existing per-article overrides). */
  setMode: (mode: ProductionDisplayMode) => void;
  /** Flip one article's display; an override equal to the page default is
   *  dropped so the article follows the default again. */
  toggleItem: (itemId: number) => void;
}

/**
 * Owns the production sheet's portions/units display preference for one
 * restaurant: loads it on mount and persists changes to localStorage.
 * Failures (quota, private mode) degrade to in-memory only and never throw.
 */
export function useProductionDisplay(restaurantId: number): ProductionDisplay {
  const [state, setState] = useState<StoredDisplay>(DEFAULT_STATE);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    setState(load(restaurantId));
  }, [restaurantId]);

  const commit = useCallback(
    (next: StoredDisplay) => {
      ref.current = next;
      setState(next);
      try {
        window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
      } catch {
        // in-memory only
      }
    },
    [restaurantId],
  );

  const setMode = useCallback(
    (mode: ProductionDisplayMode) => {
      const cur = ref.current;
      // Overrides that match the new default become redundant — drop them.
      const byItem: Record<number, ProductionDisplayMode> = {};
      for (const [k, v] of Object.entries(cur.byItem)) {
        if (v !== mode) byItem[Number(k)] = v;
      }
      commit({ mode, byItem });
    },
    [commit],
  );

  const toggleItem = useCallback(
    (itemId: number) => {
      const cur = ref.current;
      const effective = cur.byItem[itemId] ?? cur.mode;
      const next: ProductionDisplayMode = effective === 'units' ? 'portions' : 'units';
      const byItem = { ...cur.byItem };
      if (next === cur.mode) delete byItem[itemId];
      else byItem[itemId] = next;
      commit({ ...cur, byItem });
    },
    [commit],
  );

  const effectiveMode = useCallback(
    (itemId: number) => state.byItem[itemId] ?? state.mode,
    [state],
  );
  const isOverridden = useCallback(
    (itemId: number) => (state.byItem[itemId] ?? state.mode) !== state.mode,
    [state],
  );

  return { mode: state.mode, effectiveMode, isOverridden, setMode, toggleItem };
}
