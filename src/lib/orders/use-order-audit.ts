'use client';

import { useEffect, useState } from 'react';
import { ApiError, getOrderAudit, type AuditEvent } from '@/lib/api';

// The activity timeline's audit fetch, lifted out of the component.
//
// It lives above the reference tabs so the activity count remains visible when
// another tab is active and opening the timeline never issues a new request.
// With events arriving as props, the drawing component remains pure.
//
// The old code did `.catch(() => setAuditEvents([]))`, which made a
// server error indistinguishable from "this order has no history". A 403 IS
// legitimately silent — the endpoint requires orders.manage, and a staff member
// without it should simply see the lifecycle events the order itself carries.
// Anything else is a real failure and deserves a line saying so.

export type OrderAuditState =
  | { status: 'loading'; events: AuditEvent[] }
  /** Loaded, possibly empty. */
  | { status: 'ready'; events: AuditEvent[] }
  /** Caller lacks orders.manage. Render the timeline without audit rows. */
  | { status: 'forbidden'; events: AuditEvent[] }
  /** A real failure. Worth one muted line in the timeline. */
  | { status: 'error'; events: AuditEvent[] };

const EMPTY: AuditEvent[] = [];

/**
 * Audit events for one order.
 *
 * Keyed on the primitive ids, never on the order object: the orders board hands
 * down a new object reference on every WebSocket event.
 */
export function useOrderAudit(
  restaurantId: number | undefined,
  orderId: number | undefined,
): OrderAuditState {
  const [state, setState] = useState<OrderAuditState>({ status: 'loading', events: EMPTY });

  useEffect(() => {
    if (!restaurantId || !orderId) {
      setState({ status: 'ready', events: EMPTY });
      return;
    }

    let alive = true;
    setState({ status: 'loading', events: EMPTY });

    getOrderAudit(restaurantId, orderId)
      .then((events) => {
        if (alive) setState({ status: 'ready', events: events ?? EMPTY });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const forbidden = err instanceof ApiError && (err.status === 403 || err.status === 401);
        setState({ status: forbidden ? 'forbidden' : 'error', events: EMPTY });
      });

    return () => {
      alive = false;
    };
  }, [restaurantId, orderId]);

  return state;
}
