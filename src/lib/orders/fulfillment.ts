import type { BatchFulfillmentConfigResponse } from '@/lib/api';

export type FulfillmentTiming = 'immediate' | 'scheduled';

/** The chosen fulfillment for an order (what the create/edit flows submit). */
export interface FulfillmentValue {
  timing: FulfillmentTiming;
  seriesKey?: string;
  scheduledFor?: string; // "YYYY-MM-DD"
  windowStart?: string;  // "HH:MM"
  windowEnd?: string;    // "HH:MM"
}

/** One selectable batch fulfillment day, resolved for a specific order type. */
export interface FulfillmentTarget {
  id: string;            // stable key = date
  seriesKey?: string;
  date: string;          // "YYYY-MM-DD"
  dayName: string;       // e.g. "Friday"
  windowStart?: string;  // "HH:MM"
  windowEnd?: string;    // "HH:MM"
  /** True when this target is the current in-production série whose ordering
   *  window has already closed — offered only to staff, who force an order into
   *  it. Surfaced by getStaffBatchFulfillmentConfig; always false on the public
   *  config. */
  orderingClosed?: boolean;
}

/** Lists every scheduled opening for this handover method. */
export function buildFulfillmentTargets(
  batchConfig: BatchFulfillmentConfigResponse | null | undefined,
  orderType: 'pickup' | 'delivery',
): FulfillmentTarget[] {
  if (!batchConfig?.enabled) return [];
  const targets: FulfillmentTarget[] = [];
  const seen = new Set<string>();
  for (const cycle of batchConfig.upcoming_cycles ?? []) {
    for (const day of cycle.fulfillment_days ?? []) {
      const win = orderType === 'delivery' ? day.delivery_window : day.pickup_window;
      if (!win) continue;
      if (seen.has(day.date)) continue;
      seen.add(day.date);
      targets.push({
        id: day.date,
        seriesKey: cycle.series_key,
        date: day.date,
        dayName: day.day_name,
        windowStart: win.start,
        windowEnd: win.end,
        orderingClosed: cycle.ordering_closed,
      });
    }
  }
  return targets;
}

/** Default fulfillment for a freshly-opened create form. Batch restaurants
 *  default to Programmée on the first target; everyone else to Immédiate. */
export function defaultFulfillment(targets: FulfillmentTarget[]): FulfillmentValue {
  if (targets.length > 0) {
    const first = targets[0];
    return {
      timing: 'scheduled',
      scheduledFor: first.date,
      windowStart: first.windowStart,
      windowEnd: first.windowEnd,
    };
  }
  return { timing: 'immediate' };
}
