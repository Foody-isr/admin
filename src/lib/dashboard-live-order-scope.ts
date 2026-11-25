import type { AnalyticsScope, DateBasis, ListOrdersParams } from '@/lib/api';

type LiveOrderScope = Pick<ListOrdersParams, 'from' | 'to' | 'date_field' | 'series_key'>;

/** Scopes the dashboard's recent orders to the selected analytics window. */
export function dashboardLiveOrderScope(
  scope: Exclude<AnalyticsScope, string>,
  basis: DateBasis,
): LiveOrderScope {
  return {
    from: scope.from,
    to: scope.to,
    ...(scope.seriesKey ? { series_key: scope.seriesKey } : {}),
    ...(basis !== 'created' ? { date_field: basis } : {}),
  };
}
