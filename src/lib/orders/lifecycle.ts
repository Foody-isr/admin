// Mirror of foodyserver/internal/common/order_lifecycle.go. Read-only facts,
// never payment authorization or a replacement for an Order/FinancialCheck ID.

export type LifecycleEvidence = { source: string; state: string; at?: string };
export type LifecycleAxis<State extends string> = { state: State; evidence: LifecycleEvidence[] };
export interface OrderLifecycle {
  schema_version: 1;
  scope: { kind: 'order'; id: string };
  identities: { order_ids: number[] };
  commercial: LifecycleAxis<'open' | 'closed' | 'cancelled' | 'mixed' | 'unknown'>;
  payment: LifecycleAxis<'unpaid' | 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'refunded' | 'mixed' | 'unknown'>;
  preparation: LifecycleAxis<'not_sent' | 'held' | 'in_progress' | 'partially_ready' | 'ready' | 'mixed' | 'unknown'> & {
    quantities: { total: number; not_sent: number; held: number; in_progress: number; ready: number; unknown: number };
  };
  handoff: LifecycleAxis<'complete' | 'in_transit' | 'mixed' | 'unknown'> & {
    tracking: 'tracked' | 'not_tracked' | 'unknown';
  };
}
export type OrderLifecycleRead =
  | { kind: 'legacy' }
  | { kind: 'unavailable' }
  | { kind: 'available'; value: OrderLifecycle };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function evidence(value: unknown): value is LifecycleEvidence[] {
  return Array.isArray(value) && value.every(item => record(item) &&
    typeof item.source === 'string' && typeof item.state === 'string' &&
    (item.at === undefined || typeof item.at === 'string' && Number.isFinite(Date.parse(item.at))));
}
function axis(value: unknown, states: readonly string[]): boolean {
  return record(value) && typeof value.state === 'string' && states.includes(value.state) && evidence(value.evidence);
}

/** Validate v1 for exactly this order. Advertised but invalid facts never use legacy fallback. */
export function readOrderLifecycle(value: unknown, orderId: string | number, publicView = false): OrderLifecycleRead {
  if (value === undefined) return { kind: 'legacy' };
  const unavailable: OrderLifecycleRead = { kind: 'unavailable' };
  if (!record(value) || value.schema_version !== 1 || !record(value.scope) ||
    value.scope.kind !== 'order' || value.scope.id !== String(orderId) || !record(value.identities)) return unavailable;
  const ids = value.identities.order_ids;
  if (!Array.isArray(ids) || ids.length !== 1 || !Number.isSafeInteger(ids[0]) || ids[0] <= 0 || String(ids[0]) !== String(orderId)) return unavailable;
  // A public order never discloses parent checks, visits, or sibling QR orders.
  if (publicView && Object.keys(value.identities).some(key => key !== 'order_ids')) return unavailable;
  if (!axis(value.commercial, ['open', 'closed', 'cancelled', 'mixed', 'unknown']) ||
    !axis(value.payment, ['unpaid', 'pending', 'authorized', 'partially_paid', 'paid', 'refunded', 'mixed', 'unknown']) ||
    !axis(value.preparation, ['not_sent', 'held', 'in_progress', 'partially_ready', 'ready', 'mixed', 'unknown']) ||
    !axis(value.handoff, ['complete', 'in_transit', 'mixed', 'unknown'])) return unavailable;
  const prep = value.preparation as Record<string, unknown>;
  const handoff = value.handoff as Record<string, unknown>;
  if (!record(prep.quantities) || !['tracked', 'not_tracked', 'unknown'].includes(String(handoff.tracking))) return unavailable;
  for (const key of ['total', 'not_sent', 'held', 'in_progress', 'ready', 'unknown']) {
    const quantity = prep.quantities[key];
    if (!Number.isSafeInteger(quantity) || (quantity as number) < 0) return unavailable;
  }
  return { kind: 'available', value: value as unknown as OrderLifecycle };
}
