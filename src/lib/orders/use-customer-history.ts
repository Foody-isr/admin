'use client';

import { useEffect, useState } from 'react';
import { searchCustomers, type CustomerSearchResult } from '@/lib/api';

// "This customer's 12th order" turns an anonymous phone number into a known
// regular. The platform has no customer table — identity is derived from
// Order.customer_phone — so this is a lookup by phone through the customer
// search endpoint.
//
// This is ambient context, not a task. Three consequences:
//   - it fetches AFTER first paint and never blocks the order detail;
//   - any failure, 403 included, renders nothing at all rather than an error;
//   - results are cached briefly, because a busy board opens many orders from
//     the same customer in a row.

export interface CustomerHistory {
  orderCount: number;
  /** Lifetime spend. Undefined until the server ships total_spent. */
  totalSpent?: number;
  lastOrderAt?: string;
}

export type CustomerHistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; history: CustomerHistory }
  /** Fetch failed, or the phone matched nothing. Render nothing. */
  | { status: 'unavailable' };

const TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; value: CustomerHistory | null };
const cache = new Map<string, CacheEntry>();

const keyFor = (restaurantId: number, phone: string) => `${restaurantId}:${phone}`;

function toHistory(hit: CustomerSearchResult | undefined): CustomerHistory | null {
  if (!hit) return null;
  return {
    orderCount: hit.order_count ?? 0,
    totalSpent: hit.total_spent,
    lastOrderAt: hit.last_order_at || undefined,
  };
}

/**
 * Look up what else this phone number has ordered here.
 *
 * The effect keys on the PRIMITIVE phone and restaurant id, never on the order
 * object: the orders board hands the detail view a fresh object reference on
 * every WebSocket event, so keying on the object would refetch continuously.
 */
export function useCustomerHistory(
  restaurantId: number | undefined,
  phone: string | undefined | null,
): CustomerHistoryState {
  const [state, setState] = useState<CustomerHistoryState>({ status: 'idle' });

  useEffect(() => {
    const trimmed = (phone ?? '').trim();
    if (!restaurantId || !trimmed) {
      setState({ status: 'idle' });
      return;
    }

    const key = keyFor(restaurantId, trimmed);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) {
      setState(cached.value ? { status: 'ready', history: cached.value } : { status: 'unavailable' });
      return;
    }

    let alive = true;
    setState({ status: 'loading' });

    searchCustomers(restaurantId, trimmed, 1)
      .then((results) => {
        // The endpoint is a search, so confirm the hit is actually this phone
        // rather than a fuzzy neighbour.
        const hit = results.find(
          (r) => r.phone === trimmed || (r.phones ?? []).includes(trimmed),
        );
        const history = toHistory(hit);
        cache.set(key, { at: Date.now(), value: history });
        if (!alive) return;
        setState(history ? { status: 'ready', history } : { status: 'unavailable' });
      })
      .catch(() => {
        // Cache the failure too, so a 403 for a cashier does not retry on
        // every order they open.
        cache.set(key, { at: Date.now(), value: null });
        if (alive) setState({ status: 'unavailable' });
      });

    return () => {
      alive = false;
    };
  }, [restaurantId, phone]);

  return state;
}

/** Drop a cached lookup, e.g. after editing the customer's details. */
export function invalidateCustomerHistory(restaurantId: number, phone: string): void {
  cache.delete(keyFor(restaurantId, phone.trim()));
}
