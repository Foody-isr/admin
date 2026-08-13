'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveOrdersTableConfig, type OrdersTableConfig } from '@/lib/api';
import { reorder } from '@/lib/partial-order';
import { hasCustomLayout } from '@/lib/orders/column-layout';
import {
  resolveOrderColumns,
  visibleOrderColumns,
  type ResolvedOrderColumn,
  type RenderedOrderColumn,
} from '@/lib/orders/table-columns';

const EMPTY: OrdersTableConfig = { order: [], visible: {} };

/** Coerce whatever the server returned (possibly null / partial) into a full state. */
function normalize(cfg: OrdersTableConfig | null | undefined): OrdersTableConfig {
  if (!cfg) return EMPTY;
  return {
    order: Array.isArray(cfg.order) ? cfg.order : [],
    visible: cfg.visible && typeof cfg.visible === 'object' ? cfg.visible : {},
  };
}

export interface OrdersTableColumns {
  /** Every column, arranged and visibility-resolved. For the picker. */
  columns: ResolvedOrderColumn[];
  /** The columns the table renders, one flagged as the mobile card heading. */
  visible: RenderedOrderColumn[];
  /** Show or hide one column. */
  toggle: (key: string, visible: boolean) => void;
  /** Move `fromKey` to just before `toKey` (drop-before semantics). */
  move: (fromKey: string, toKey: string) => void;
  /** Clear all customisation, restoring the built-in default layout. */
  reset: () => void;
  /** Whether anything is customised (drives the reset action's visibility). */
  hasCustom: boolean;
}

/**
 * Owns the restaurant-wide column layout of the admin orders table: seeds from
 * the layout that came back on the restaurant record, and persists every
 * toggle/drag so all staff and devices see the same table.
 *
 * Optimistic: a failed save reverts the local change. Layout is a convenience,
 * so it never blocks the orders list.
 *
 * Saving requires `settings.edit`; pass `canEdit` so a member without it reads
 * the shared layout without being offered controls that the server would reject.
 */
export function useOrdersTableConfig(
  restaurantId: number,
  serverConfig: OrdersTableConfig | null | undefined,
  canEdit: boolean,
): OrdersTableColumns {
  const [state, setState] = useState<OrdersTableConfig>(EMPTY);
  // Latest state for the event-handler mutators, so they compute from the
  // current layout without joining their dependency lists.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Seed from the saved layout whenever it arrives / changes. Keyed on a stable
  // serialisation so a refetch returning the same value is a no-op and never
  // clobbers a reorder the user just made.
  const serverKey = serverConfig ? JSON.stringify(serverConfig) : '';
  useEffect(() => {
    setState(normalize(serverConfig));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const commit = useCallback(
    (next: OrdersTableConfig) => {
      if (!canEdit) return;
      const prev = stateRef.current;
      stateRef.current = next;
      setState(next);
      saveOrdersTableConfig(restaurantId, next).catch((err) => {
        console.error('[orders] failed to save table layout', err);
        stateRef.current = prev;
        setState(prev);
      });
    },
    [restaurantId, canEdit],
  );

  const toggle = useCallback(
    (key: string, visible: boolean) =>
      commit({ ...stateRef.current, visible: { ...stateRef.current.visible, [key]: visible } }),
    [commit],
  );

  // Persist the full resolved arrangement, not just the moved key: order is
  // relative, so a partial list could not express "b now sits before a".
  // `orderBy` still absorbs any column this list predates.
  const move = useCallback(
    (fromKey: string, toKey: string) => {
      const current = resolveOrderColumns(stateRef.current).map((c) => c.key);
      commit({ ...stateRef.current, order: reorder(current, fromKey, toKey) });
    },
    [commit],
  );

  const reset = useCallback(() => commit(EMPTY), [commit]);

  const columns = useMemo(() => resolveOrderColumns(state), [state]);
  const visible = useMemo(() => visibleOrderColumns(state), [state]);

  return {
    columns,
    visible,
    toggle,
    move,
    reset,
    hasCustom: hasCustomLayout(state),
  };
}
