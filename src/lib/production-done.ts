'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setOrderPrepared, type ProductionSheetOrder } from '@/lib/api';
import { useWs } from '@/lib/ws-context';

export interface ProductionDone {
  /** Order ids marked done for the active restaurant + day. */
  doneIds: Set<number>;
  /** Whether a given order is marked done. */
  isDone: (orderId: number) => boolean;
  /** Flip one order's done state and persist. */
  toggle: (orderId: number) => void;
  /** Set one order's done state explicitly and persist. */
  setDone: (orderId: number, done: boolean) => void;
}

function seedFrom(orders: ProductionSheetOrder[] | undefined): Set<number> {
  const s = new Set<number>();
  for (const o of orders ?? []) if (o.prepared) s.add(o.order_id);
  return s;
}

/**
 * Owns the production sheet's shared "done" set for one restaurant. Seeds from
 * the `prepared` flags the server returned with the sheet, persists each toggle
 * to the server (optimistic — reverts on failure), and applies live
 * `production.done.updated` WebSocket events so other tablets stay in sync.
 * "Fresh each day" falls out naturally: a new day loads a new sheet with its own
 * prepared flags.
 */
export function useProductionDone(
  restaurantId: number,
  orders: ProductionSheetOrder[] | undefined,
): ProductionDone {
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  // Latest set for the event-handler mutators, so they compute from current
  // state without adding it to their dependency lists.
  const ref = useRef(doneIds);
  ref.current = doneIds;

  // Re-seed whenever the sheet's prepared flags change (new day / reload). Keyed
  // on the sorted set of prepared ids so an unrelated refetch is a no-op and
  // never clobbers a just-made local toggle.
  const seedKey = (orders ?? [])
    .filter((o) => o.prepared)
    .map((o) => o.order_id)
    .sort((a, b) => a - b)
    .join(',');
  useEffect(() => {
    const next = seedFrom(orders);
    ref.current = next;
    setDoneIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const apply = useCallback((orderId: number, done: boolean) => {
    const next = new Set(ref.current);
    if (done) next.add(orderId);
    else next.delete(orderId);
    ref.current = next;
    setDoneIds(next);
  }, []);

  // Apply live done-toggles from other tablets (and this tab's own echo, which
  // is idempotent with the optimistic update below).
  const { lastEvent } = useWs();
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'production.done.updated') return;
    const orderId = Number(lastEvent.payload?.order_id);
    if (!orderId) return;
    apply(orderId, !!lastEvent.payload?.prepared);
  }, [lastEvent, apply]);

  const setDone = useCallback(
    (orderId: number, done: boolean) => {
      const prev = ref.current.has(orderId);
      apply(orderId, done); // optimistic
      setOrderPrepared(restaurantId, orderId, done).catch((err) => {
        console.error('[production] failed to save done state', err);
        apply(orderId, prev); // revert on failure
      });
    },
    [apply, restaurantId],
  );

  const toggle = useCallback(
    (orderId: number) => setDone(orderId, !ref.current.has(orderId)),
    [setDone],
  );

  const isDone = useCallback((orderId: number) => doneIds.has(orderId), [doneIds]);

  return { doneIds, isDone, toggle, setDone };
}
