'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrderNotes, addOrderNote, deleteOrderNote, type OrderNote } from '@/lib/api';

// Internal staff notes for one order, lifted out of OrderNotesSection.
//
// This is a PREREQUISITE of the collapsible appendix, not tidying that happened
// to travel with it. The notes block is now collapsed by default and its body
// UNMOUNTS when closed — a hidden-but-mounted <textarea> is still reachable by
// Tab and by find-in-page, which is the same class of failure as scrolling past
// something. With the fetch inside the component, unmounting would mean the
// heading could never say how many notes there are, and a count is the only
// thing that makes collapsing safe.
//
// So: the fetch lives up here, above the collapse, and the panel is driven by
// props. If you ever move it back down, the count dies silently.
//
// Two further differences from the effect it replaces:
//
//   * `t` is not a dependency. It used to be, so switching language refetched
//     the notes for nothing. The hook returns a status; the component owns the
//     strings.
//   * The delete rollback goes through a ref. A useCallback keyed on the ids
//     cannot capture fresh state, and capturing `prev` inside the updater
//     misbehaves under StrictMode's double invocation.

export type OrderNotesState = {
  notes: OrderNote[];
  status: 'loading' | 'ready' | 'error';
  /** Adds a note. Resolves false on failure; the caller shows the message. */
  add: (body: string) => Promise<boolean>;
  /** Optimistic delete with rollback. Resolves false on failure. */
  remove: (noteId: number) => Promise<boolean>;
};

const EMPTY: OrderNote[] = [];

/**
 * Keyed on the primitive ids, never on the order object: the orders board hands
 * down a new object reference on every WebSocket event.
 *
 * The `!restaurantId || !orderId` guard is required, not defensive — the
 * production page renders the detail with `order={null}` while it fetches, and
 * hooks sit above that early return.
 */
export function useOrderNotes(
  restaurantId: number | undefined,
  orderId: number | undefined,
): OrderNotesState {
  const [notes, setNotes] = useState<OrderNote[]>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Mirror of `notes`, so remove() can roll back to what was on screen without
  // taking a dependency on the state it is about to change.
  const latest = useRef<OrderNote[]>(EMPTY);
  latest.current = notes;

  useEffect(() => {
    if (!restaurantId || !orderId) {
      setNotes(EMPTY);
      setStatus('ready');
      return;
    }

    let alive = true;
    setNotes(EMPTY);
    setStatus('loading');

    getOrderNotes(restaurantId, orderId)
      .then((rows) => {
        if (!alive) return;
        setNotes(rows ?? EMPTY);
        setStatus('ready');
      })
      .catch(() => {
        if (!alive) return;
        // Stays EMPTY, but the status is what the caller must read: an empty
        // list under 'error' is "we don't know", not "there are none".
        setStatus('error');
      });

    return () => {
      alive = false;
    };
  }, [restaurantId, orderId]);

  // Not optimistic, deliberately: the server owns the id, the author name and
  // the timestamp, so there is nothing honest to render ahead of the response.
  const add = useCallback(
    async (body: string): Promise<boolean> => {
      if (!restaurantId || !orderId) return false;
      try {
        const note = await addOrderNote(restaurantId, orderId, body);
        setNotes((prev) => [note, ...prev]);
        return true;
      } catch {
        return false;
      }
    },
    [restaurantId, orderId],
  );

  const remove = useCallback(
    async (noteId: number): Promise<boolean> => {
      if (!restaurantId || !orderId) return false;
      const before = latest.current;
      setNotes((rows) => rows.filter((n) => n.id !== noteId));
      try {
        await deleteOrderNote(restaurantId, orderId, noteId);
        return true;
      } catch {
        setNotes(before);
        return false;
      }
    },
    [restaurantId, orderId],
  );

  return { notes, status, add, remove };
}
