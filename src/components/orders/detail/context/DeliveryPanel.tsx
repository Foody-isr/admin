'use client';

// Where the order goes and who takes it.
//
// `courier_phone`, `courier_assigned_at` and `tour` have always been on the
// payload and were rendered nowhere: the drawer showed a bare courier name, so
// staff chasing a late delivery could not call the driver from the order and
// could not see which tour it belonged to. Zero new fetches — this is all data
// the screen already had.
//
// Deliberately read-only. Assignment stays on the deliveries dispatcher, which
// assigns whole tours; a per-order assign here would be a second, weaker source
// of truth for the same decision. There is a link instead.

import Link from 'next/link';
import { MapPinIcon, PhoneIcon, TruckIcon, ArrowUpRightIcon } from 'lucide-react';
import { Badge } from '@/components/ds';
import type { Order } from '@/lib/api';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import type { CustomFieldAnswer } from '@/lib/orders/checkout-fields';
import { formatTime } from '@/lib/orders/order-time';
import { ContextBlock, ContextRow } from '../primitives/ContextBlock';

function TourBadge({ order, t }: { order: Order; t: (k: string) => string }) {
  if (!order.tour?.name) return null;
  let date: string | null = null;
  try {
    date = order.tour.delivery_date
      ? new Date(order.tour.delivery_date).toLocaleDateString([], { day: '2-digit', month: 'short' })
      : null;
  } catch {
    date = null;
  }
  return (
    <ContextRow label={t('deliveryTour')}>
      <Badge tone="info">
        <TruckIcon className="w-3 h-3" />
        {order.tour.name}
        {date && <span className="num opacity-70">{date}</span>}
      </Badge>
    </ContextRow>
  );
}

export function DeliveryPanel({
  order,
  customFields,
  t,
}: {
  order: Order;
  /** Custom checkout answers that describe WHERE the order goes, e.g. a
   *  hand-rolled "Code immeuble" the owner built instead of using the built-in
   *  delivery_entry_code. The built-in equivalents are already inside
   *  formatDeliveryAddress's line2; these render beneath it, labelled, because
   *  they are the same kind of fact and staff read them off in one glance.
   *  Chosen by splitCustomFieldAnswers, which decides once for both panels. */
  customFields: CustomFieldAnswer[];
  t: (k: string) => string;
}) {
  if (order.order_type !== 'delivery') return null;

  const addr = formatDeliveryAddress(
    {
      address: order.delivery_address,
      city: order.delivery_city,
      floor: order.delivery_floor,
      apt: order.delivery_apt,
      entryCode: order.delivery_entry_code,
    },
    t,
  );
  const notes = order.delivery_notes?.trim();
  const dialable = (order.courier_phone || '').replace(/[^\d+]/g, '');
  // Most delivery orders have neither, and the block then spent ~80px of a
  // screen staff should not have to scroll on the word "Aucun coursier".
  // Nothing here is actionable — assignment happens on the dispatcher — so an
  // empty courier block was pure furniture.
  const hasCourierInfo = Boolean(order.courier_name || order.tour?.name);
  // customFields is in the gate, not just the body: an order whose building
  // code is the ONLY address detail typed would otherwise lose it entirely.
  const hasAddressBlock = Boolean(addr || notes || customFields.length > 0);

  // The shortcut to the dispatcher used to hang off the courier block's
  // heading, so closing that block would have quietly removed it from every
  // order without a driver — precisely the orders you open it to fix. It moves
  // to the address heading, which always renders on a delivery, for 0px.
  const openDeliveries = (
    <Link
      href={`/${order.restaurant_id}/orders/deliveries`}
      className="inline-flex items-center gap-1 text-fs-xs text-[var(--fg-subtle)] hover:text-[var(--brand-500)] transition-colors"
    >
      {t('openDeliveries')}
      <ArrowUpRightIcon className="w-3 h-3" />
    </Link>
  );

  return (
    <>
      {hasAddressBlock && (
        <ContextBlock label={t('deliveryAddress')} aside={openDeliveries}>
          <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
            {addr && (
              <div className="flex items-start gap-1.5">
                <MapPinIcon className="w-3.5 h-3.5 text-[var(--fg-muted)] mt-0.5 shrink-0" />
                <div className="flex flex-col leading-tight min-w-0">
                  <span>{addr.line1}</span>
                  {addr.line2 && <span className="text-[var(--fg-subtle)]">{addr.line2}</span>}
                </div>
              </div>
            )}
            {/* Sits directly under the street/floor/apartment lines, which is
                where the same fact would appear had the owner used the
                built-in field: same block, same glance. */}
            {customFields.map((f) => (
              <ContextRow key={f.id} label={f.label}>{f.value}</ContextRow>
            ))}
            {notes && <ContextRow label={t('deliveryNotes')}>{notes}</ContextRow>}
          </div>
        </ContextBlock>
      )}

      {/* Rendered when it has something to say — or when the address block did
          not render, so a delivery order always keeps one heading, and with it
          the link to the dispatcher. */}
      {(hasCourierInfo || !hasAddressBlock) && (
      <ContextBlock
        label={t('courier')}
        aside={hasAddressBlock ? undefined : openDeliveries}
      >
        {order.courier_name ? (
          <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
            <div className="font-medium">{order.courier_name}</div>
            {order.courier_phone && (
              <a
                href={`tel:${dialable}`}
                dir="ltr"
                className="inline-flex items-center gap-1.5 num text-fs-xs text-[var(--fg-subtle)] hover:text-[var(--brand-500)] transition-colors text-start w-fit"
              >
                <PhoneIcon className="w-3 h-3 shrink-0" />
                {order.courier_phone}
              </a>
            )}
            {order.courier_assigned_at && (
              <ContextRow label={t('courierAssignedAt')}>
                <span className="num">{formatTime(order.courier_assigned_at)}</span>
              </ContextRow>
            )}
            <TourBadge order={order} t={t} />
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--s-2)]">
            {/* Still reached: an order already on a tour but with no driver
                assigned needs "Aucun coursier" beside its tour badge. */}
            <div className="text-fs-sm text-[var(--fg-subtle)]">{t('courierNone')}</div>
            <TourBadge order={order} t={t} />
          </div>
        )}
      </ContextBlock>
      )}
    </>
  );
}
