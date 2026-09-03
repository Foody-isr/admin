'use client';

// Why an order was cancelled: a staff rejection with a typed reason, or the
// abandonment sweeper closing an unpaid order. Moved verbatim from
// OrderDetailDrawer.tsx (545-563).

import type { Order } from '@/lib/api';
import { cancellationInfo, CANCELLATION_REASON_KEY } from '@/lib/orders/cancellation';

export function CancellationCallout({ order, t }: { order: Order; t: (k: string) => string }) {
  if (!(['rejected', 'cancelled'] as string[]).includes(order.status)) return null;

  const { code, note } = cancellationInfo(order);
  if (!code && !note) return null;

  return (
    <div className="rounded-r-md border border-[var(--line)] bg-[var(--danger-50)] px-[var(--s-4)] py-[var(--s-3)]">
      <div className="text-fs-sm font-semibold text-[var(--danger-500)]">
        {t('cancellationReason')}
      </div>
      <div className="text-fs-sm text-[var(--fg)] mt-0.5">
        {code ? t(CANCELLATION_REASON_KEY[code]) : note}
      </div>
      {code && note && (
        <div className="text-fs-sm text-[var(--fg-muted)] mt-0.5">{note}</div>
      )}
    </div>
  );
}
