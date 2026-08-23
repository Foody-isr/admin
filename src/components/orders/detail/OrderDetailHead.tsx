'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import { localizeStatus, localizeOrderType } from '@/lib/orders/status-presentation';
import { elapsedMinutes } from '@/lib/orders/order-time';

/**
 * The takeover's head: close, order number, and the one-line answer to "what is
 * this order and where is it".
 *
 * The order number is the only place besides the customer's name where the
 * display serif appears. Two proper nouns, nothing else — scarcity is what
 * keeps it reading as deliberate rather than decorative.
 *
 * No primary action here: the order's next step lives in the command bar at the
 * bottom, and a competing top-right CTA would split the answer to "what do I do
 * now" across two corners.
 */
export function OrderDetailHead({
  order,
  tone,
  isActive,
}: {
  order: Order;
  /** Semantic tone for the status word and dot. */
  tone: 'warning' | 'success' | 'info' | 'danger';
  /** The order is mid-production, so the dot pulses. */
  isActive: boolean;
}) {
  const { t } = useI18n();

  const isTerminal = ['served', 'received', 'picked_up', 'delivered', 'rejected'].includes(order.status);
  const isScheduled = order.status === 'scheduled';
  const mins = elapsedMinutes(order.created_at);

  return (
    <div className="h-[60px] px-[var(--s-3)] md:px-[var(--s-4)] flex items-center gap-[var(--s-3)]">
      <Dialog.Close asChild>
        <Button variant="ghost" size="md" icon aria-label={t('close') || 'Fermer'}>
          <X />
        </Button>
      </Dialog.Close>

      {/* Stacked on a phone: side by side, the meta line loses everything after
          the status to truncation ("Prête à livrer" became "P."). */}
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-[var(--s-3)] min-w-0">
        <span className="font-display text-fs-xl sm:text-fs-2xl leading-none tabular-nums whitespace-nowrap">
          {t('orderNumber').replace('{id}', String(order.id))}
        </span>

        <span className="flex items-center gap-1.5 min-w-0 text-fs-xs text-[var(--fg-muted)]">
          <span
            className="relative inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: `var(--${tone}-500)` }}
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full opacity-70 motion-safe:animate-ping"
                style={{ background: 'var(--warning-500)' }}
              />
            )}
          </span>
          <span
            className="text-fs-sm font-semibold tracking-[-0.005em] truncate"
            style={{ color: `var(--${tone}-500)` }}
          >
            {localizeStatus(order.status, t)}
          </span>

          {!isScheduled && !isTerminal && (
            <>
              <span className="opacity-40">·</span>
              <span className="num shrink-0">
                {mins} {t('minShort') || 'min'}
              </span>
            </>
          )}

          <span className="opacity-40">·</span>
          <span className="shrink-0">{localizeOrderType(order.order_type, t)}</span>

          {order.table_number && (
            <>
              <span className="opacity-40">·</span>
              <span className="shrink-0">Table {order.table_number}</span>
            </>
          )}
          {/* The scheduled date is deliberately not here: it gets the dedicated
              ScheduledBanner at the head of the ticket, where it cannot
              truncate. */}
        </span>
      </div>
    </div>
  );
}
