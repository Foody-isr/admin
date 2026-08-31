'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import { localizeStatus, localizeOrderType } from '@/lib/orders/status-presentation';
import { elapsedMinutes } from '@/lib/orders/order-time';
import { Money } from './primitives/Money';

/**
 * The takeover's head: close, order number, and the one-line answer to "what is
 * this order and where is it".
 *
 * The order number uses the same compact sans-serif as the rest of this
 * operational surface. Weight and tabular figures provide hierarchy without
 * introducing an editorial display face into a screen staff scan at speed.
 *
 * No primary action here: the order's next step lives in the command bar at the
 * bottom, and a competing top-right CTA would split the answer to "what do I do
 * now" across two corners.
 */
export function OrderDetailHead({
  order,
  tone,
  displayedLineCount,
  totalUnits,
  total,
}: {
  order: Order;
  /** Semantic tone for the status word and dot. */
  tone: 'warning' | 'success' | 'info' | 'danger';
  displayedLineCount: number;
  totalUnits: number;
  total: number;
}) {
  const { t } = useI18n();

  const isTerminal = ['served', 'received', 'picked_up', 'delivered', 'rejected'].includes(order.status);
  const isScheduled = order.status === 'scheduled';
  const mins = elapsedMinutes(order.created_at);

  return (
    <div className="h-[64px] px-[var(--s-3)] md:px-[var(--s-4)] flex items-center gap-[var(--s-3)]">
      <Dialog.Close asChild>
        <Button variant="ghost" size="md" icon aria-label={t('close') || 'Fermer'}>
          <X />
        </Button>
      </Dialog.Close>

      {/* Stacked on a phone: side by side, the meta line loses everything after
          the status to truncation ("Prête à livrer" became "P."). */}
      <div className="flex items-center gap-[var(--s-4)] min-w-0 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-[var(--s-3)] min-w-0">
          <span className="text-[24px] leading-[30px] font-bold tracking-[-0.02em] tabular-nums whitespace-nowrap">
            {t('orderNumber').replace('{id}', String(order.id))}
          </span>

          <span className="flex items-center gap-1.5 min-w-0 text-fs-xs text-[var(--fg-muted)]">
            <span
              className="relative inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: `var(--${tone}-500)` }}
            />
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
          </span>
        </div>

        <div className="ms-auto hidden lg:flex items-center gap-[var(--s-3)] shrink-0 text-fs-xs text-[var(--fg-muted)]">
          <span>
            <span className="font-semibold text-[var(--fg)] tabular-nums">{displayedLineCount}</span>{' '}
            {displayedLineCount === 1 ? t('item') : t('items')}
            <span className="mx-1.5 opacity-40">·</span>
            <span className="font-semibold text-[var(--fg)] tabular-nums">{totalUnits}</span>{' '}
            {totalUnits === 1 ? t('unit') : t('units')}
          </span>
          <span aria-hidden className="h-5 w-px bg-[var(--line)]" />
          <Money value={total} className="text-fs-lg font-semibold text-[var(--fg)]" />
        </div>
      </div>
    </div>
  );
}
