'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Per-restaurant, per-day set of orders a cook has marked prepared on the
// production sheet. Client-only, stored in localStorage; keyed by date so each
// day naturally starts with a clean sheet. Mirrors the storage-key convention
// used by production-column-order.ts (foody.production.colorder.<rid>).
function storageKey(restaurantId: number, date: string): string {
  return `foody.production.done.${restaurantId}.${date}`;
}

function load(restaurantId: number, date: string): Set<number> {
  if (typeof window === 'undefined' || !date) return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId, date));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((n): n is number => typeof n === 'number'))
      : new Set();
  } catch {
    return new Set();
  }
}

export interface ProductionDone {
  /** Order ids marked done for the active restaurant + date. */
  doneIds: Set<number>;
  /** Whether a given order is marked done. */
  isDone: (orderId: number) => boolean;
  /** Flip one order's done state and persist. */
  toggle: (orderId: number) => void;
  /** Set one order's done state explicitly and persist. */
  setDone: (orderId: number, done: boolean) => void;
}

/**
 * Owns the production sheet's per-day "done" set for one restaurant: loads it on
 * mount / date change, and persists toggles to localStorage. Failures (quota,
 * private mode) degrade to in-memory only and never throw.
 */
export function useProductionDone(restaurantId: number, date: string): ProductionDone {
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  // Latest set for the event-handler mutators, so they compute from current
  // state without adding it to their dependency lists.
  const ref = useRef(doneIds);
  ref.current = doneIds;

  useEffect(() => {
    setDoneIds(load(restaurantId, date));
  }, [restaurantId, date]);

  const commit = useCallback(
    (next: Set<number>) => {
      ref.current = next;
      setDoneIds(next);
      if (!date) return;
      try {
        window.localStorage.setItem(
          storageKey(restaurantId, date),
          JSON.stringify(Array.from(next)),
        );
      } catch {
        /* ignore quota / private-mode errors — done state is a convenience */
      }
    },
    [restaurantId, date],
  );

  const setDone = useCallback(
    (orderId: number, done: boolean) => {
      const next = new Set(ref.current);
      if (done) next.add(orderId);
      else next.delete(orderId);
      commit(next);
    },
    [commit],
  );

  const toggle = useCallback(
    (orderId: number) => setDone(orderId, !ref.current.has(orderId)),
    [setDone],
  );

  const isDone = useCallback((orderId: number) => doneIds.has(orderId), [doneIds]);

  return { doneIds, isDone, toggle, setDone };
}
