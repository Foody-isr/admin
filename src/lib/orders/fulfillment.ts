import type { BatchFulfillmentConfigResponse } from '@/lib/api';

export type FulfillmentTiming = 'immediate' | 'scheduled';

/** The chosen fulfillment for an order (what the create/edit flows submit). */
export interface FulfillmentValue {
  timing: FulfillmentTiming;
  scheduledFor?: string; // "YYYY-MM-DD"
  windowStart?: string;  // "HH:MM"
  windowEnd?: string;    // "HH:MM"
}

/** One selectable batch fulfillment day, resolved for a specific order type. */
export interface FulfillmentTarget {
  id: string;            // stable key = date
  date: string;          // "YYYY-MM-DD"
  dayName: string;       // e.g. "Friday"
  windowStart?: string;  // "HH:MM"
  windowEnd?: string;    // "HH:MM"
}

/**
 * Resolve the selectable scheduled targets from the batch config for a given
 * order type. For each upcoming cycle we pick the FIRST fulfillment day whose
 * window for that order type is set — the same rule the server's
 * ComputeBatchFulfillmentForOrder uses. Cycles with no matching day are skipped.
 * Returns [] when batch mode is off or no config is loaded (callers then fall
 * back to a plain date picker).
 */
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
      if (seen.has(day.date)) break; // one target per cycle (first matching day)
      seen.add(day.date);
      targets.push({
        id: day.date,
        date: day.date,
        dayName: day.day_name,
        windowStart: win.start,
        windowEnd: win.end,
      });
      break; // move to next cycle after the first matching day
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
