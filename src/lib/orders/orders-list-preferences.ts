import type { DateBasis } from '@/lib/api';

/**
 * Chooses the status scope that makes each date basis useful by default.
 *
 * Creation-date mode is an operational view, so it starts on the live queue.
 * Série mode represents a fulfillment batch and must include every order in
 * that batch, including orders still holding the `scheduled` status.
 */
export function defaultOrdersTabForBasis(basis: DateBasis): 'active' | 'all' {
  return basis === 'serie' ? 'all' : 'active';
}
