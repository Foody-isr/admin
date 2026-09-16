import type { AnalyticsScope, DateBasis, ListOrdersParams } from '@/lib/api';

type LiveOrderScope = Pick<ListOrdersParams, 'from' | 'to' | 'date_field'>;

/** Keeps dashboard operational counts aligned with the selected analytics window. */
export function dashboardLiveOrderScope(
  scope: Exclude<AnalyticsScope, string>,
  basis: DateBasis,
): LiveOrderScope {
  return {
    from: scope.from,
    to: scope.to,
    ...(basis === 'serie' ? { date_field: 'serie' as const } : {}),
  };
}
