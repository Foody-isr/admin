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
// of truth for the same decision.

import { TruckIcon } from 'lucide-react';
import { Badge } from '@/components/ds';
import type { Order } from '@/lib/api';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import type { CustomFieldAnswer } from '@/lib/orders/checkout-fields';
import { formatTime } from '@/lib/orders/order-time';
import { ContextRow } from '../primitives/ContextBlock';
import styles from '../order-detail.module.css';

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

/** Fulfillment facts retain address, custom answers, courier and tour details. */
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

  return (
    <div className={styles.facts}>
      {hasAddressBlock && <>
        {addr && <ContextRow label={t('deliveryAddress')}>
          <span className="block">{addr.line1}</span>
          {addr.line2 && <span className="block text-[var(--fg-muted)]">{addr.line2}</span>}
        </ContextRow>}
        {customFields.map(field => <ContextRow key={field.id} label={field.label}>{field.value}</ContextRow>)}
        {notes && <ContextRow label={t('deliveryNotes')}>{notes}</ContextRow>}
      </>}
      {(hasCourierInfo || !hasAddressBlock) && <>
        <ContextRow label={t('courier')}>
          {order.courier_name ? <>
            <span className="block">{order.courier_name}</span>
            {order.courier_phone && <a className={styles.factLink} href={`tel:${dialable}`} dir="ltr">{order.courier_phone}</a>}
          </> : t('courierNone')}
        </ContextRow>
        {order.courier_name && order.courier_assigned_at && <ContextRow label={t('courierAssignedAt')}>{formatTime(order.courier_assigned_at)}</ContextRow>}
        <TourBadge order={order} t={t} />
      </>}
    </div>
  );
}
