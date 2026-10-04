import type { ChainOverview, RangeSummary, Restaurant } from '@/lib/api';
import { DEFAULT_CURRENCY } from '@/lib/currency';

/** Rejects incomplete analytics instead of presenting missing figures as zero. */
export function isChainReportSummary(value: unknown): value is RangeSummary {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<RangeSummary>;
  return [row.total_revenue, row.total_orders, row.avg_ticket, row.items_sold]
    .every(number => typeof number === 'number' && Number.isFinite(number));
}

/** Checks chain and branch identities before issuing restaurant requests. */
export function isChainReportOverview(value: unknown, chainId: number | null): value is ChainOverview {
  if (!value || typeof value !== 'object') return false;
  const overview = value as Partial<ChainOverview>;
  if (overview.chain_id !== chainId || !Array.isArray(overview.branches)) return false;
  const ids = new Set<number>();
  return overview.branches.every(branch => {
    if (!branch || !Number.isSafeInteger(branch.id) || branch.id <= 0 || typeof branch.name !== 'string' || ids.has(branch.id)) return false;
    ids.add(branch.id);
    return true;
  });
}

/** Resolves restaurant currency without inheriting another page's context. */
export function chainReportCurrency(restaurant: Restaurant | undefined, id: number): string | null {
  if (!restaurant || restaurant.id !== id) return null;
  // The restaurant contract applies ILS when no currency has been configured.
  const code = restaurant.currency == null || restaurant.currency === '' ? DEFAULT_CURRENCY : restaurant.currency;
  return typeof code === 'string' && /^[a-z]{3}$/i.test(code) ? code.toUpperCase() : null;
}
