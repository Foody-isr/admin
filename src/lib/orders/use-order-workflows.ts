'use client';

import { useEffect, useState } from 'react';
import { getOrderWorkflows, type OrderWorkflow } from '@/lib/api';

// The order detail's stepper reads the restaurant's configured pipeline. Two
// constraints shape this hook:
//
//   1. A restaurant's pipeline changes roughly never, but the drawer re-renders
//      constantly — the orders board recomputes the selected order from a
//      WebSocket-mutated array on every event. A naive fetch-per-open would put
//      a spinner on the single most important element on the screen, repeatedly.
//   2. Failure must be invisible. No workflow means "draw the default steps",
//      not "show an error" — a cashier without settings access gets a 403 here
//      and must still see a progression.
//
// So: one in-flight request per restaurant, memoized for the session, and the
// initial state reads the cache synchronously so reopening an order never
// flashes.

type CacheEntry = {
  promise: Promise<OrderWorkflow[] | null>;
  /** Settled value, once known. Lets a remount render without a tick of null. */
  value?: OrderWorkflow[] | null;
};

const cache = new Map<number, CacheEntry>();

/** Drop a restaurant's memoized pipeline. Call after saving the builder. */
export function invalidateOrderWorkflows(restaurantId: number): void {
  cache.delete(restaurantId);
}

function load(restaurantId: number): CacheEntry {
  const existing = cache.get(restaurantId);
  if (existing) return existing;

  const entry: CacheEntry = {
    promise: getOrderWorkflows(restaurantId)
      .then((workflows) => {
        entry.value = workflows;
        return workflows;
      })
      .catch(() => {
        // Any failure — 403, network, malformed — resolves to null so callers
        // fall back to the default template. Deliberately not rethrown: the
        // stepper has a correct answer without this data.
        entry.value = null;
        return null;
      }),
  };
  cache.set(restaurantId, entry);
  return entry;
}

/**
 * The restaurant's configured pipelines, or null while loading and on failure.
 *
 * Callers must treat null as "use the fallback", never as an error state.
 */
export function useOrderWorkflows(restaurantId: number | undefined): OrderWorkflow[] | null {
  const [workflows, setWorkflows] = useState<OrderWorkflow[] | null>(() =>
    restaurantId ? (cache.get(restaurantId)?.value ?? null) : null,
  );

  useEffect(() => {
    if (!restaurantId) {
      setWorkflows(null);
      return;
    }
    const entry = load(restaurantId);
    if (entry.value !== undefined) {
      setWorkflows(entry.value);
      return;
    }
    let alive = true;
    entry.promise.then((v) => {
      if (alive) setWorkflows(v);
    });
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  return workflows;
}

/** The pipeline for one order type, or null when there is none to use. */
export function pickWorkflow(
  workflows: OrderWorkflow[] | null,
  orderType: string,
): OrderWorkflow | null {
  if (!workflows) return null;
  return workflows.find((w) => w.order_type === orderType) ?? null;
}
