'use client';

import { Badge } from '@/components/ds';
import { Skeleton } from '@/components/ds';
import { useCustomerHistory } from '@/lib/orders/use-customer-history';
import { formatMoney } from '@/lib/format-money';

/**
 * What else this phone number has ordered here.
 *
 * The platform has no customer table — identity is derived from the order's
 * phone — but the counts exist and were reachable the whole time; the detail
 * view simply never asked. An anonymous number becomes "12 commandes · ₪2 340",
 * which is the difference between serving a stranger and serving a regular.
 *
 * Ambient context, not a task: it loads after first paint, never blocks, and
 * any failure (403 for a cashier without customer read included) renders
 * nothing at all rather than an error the reader cannot act on.
 */
export function CustomerHistoryStrip({
  restaurantId,
  phone,
  t,
}: {
  restaurantId: number;
  phone: string | undefined | null;
  t: (k: string) => string;
}) {
  const state = useCustomerHistory(restaurantId, phone);

  if (state.status === 'idle' || state.status === 'unavailable') return null;

  if (state.status === 'loading') {
    // Same height as the loaded strip, so nothing shifts underneath it.
    return (
      <div className="mt-[var(--s-2)] flex items-center gap-[var(--s-3)] rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] px-[var(--s-3)] py-[var(--s-2)]">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  const { orderCount, totalSpent, lastOrderAt } = state.history;

  // A first-timer's "1 commande" says nothing. That they are new says a lot.
  if (orderCount <= 1) {
    return (
      <div className="mt-[var(--s-2)] rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] px-[var(--s-3)] py-[var(--s-2)]">
        <Badge tone="brand">{t('customerNew')}</Badge>
      </div>
    );
  }

  const lastOrder = lastOrderAt
    ? (() => {
        try {
          return new Date(lastOrderAt).toLocaleDateString([], { day: '2-digit', month: 'short' });
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="mt-[var(--s-2)] flex flex-wrap items-baseline gap-x-[var(--s-3)] gap-y-1 rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] px-[var(--s-3)] py-[var(--s-2)] text-fs-xs text-[var(--fg-muted)]">
      <span>
        <span className="num text-[var(--fg)] font-medium">{orderCount}</span>{' '}
        {t('customerOrdersCount')}
      </span>

      {/* Optional until the server ships total_spent on customers/search. The
          strip renders two cells today and three the moment it lands. */}
      {typeof totalSpent === 'number' && totalSpent > 0 && (
        <>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span>
            <span dir="ltr" className="num text-[var(--fg)] font-medium">
              {formatMoney(totalSpent, { decimals: 0 })}
            </span>{' '}
            {t('customerLifetimeSpend')}
          </span>
        </>
      )}

      {lastOrder && (
        <>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span>
            {t('customerLastOrder')} <span className="num">{lastOrder}</span>
          </span>
        </>
      )}
    </div>
  );
}
