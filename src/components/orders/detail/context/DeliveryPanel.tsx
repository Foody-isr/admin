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

import { MapPinIcon, PhoneIcon, TruckIcon } from 'lucide-react';
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

  return (
    <>
      {hasAddressBlock && (
        <ContextBlock label={t('deliveryAddress')}>
          <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-[var(--s-3)] text-fs-sm">
            {addr && (
              <div className="flex items-start gap-[var(--s-3)]">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-r-sm text-[var(--brand-500)]"
                  style={{ background: 'color-mix(in oklab, var(--brand-500) 10%, transparent)' }}
                >
                  <MapPinIcon className="size-3.5" />
                </span>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="font-medium leading-snug">{addr.line1}</span>
                  {addr.line2 && <span className="mt-1 text-[var(--fg-muted)]">{addr.line2}</span>}
                </div>
              </div>
            )}
            {(customFields.length > 0 || notes) && (
              <div className={`${addr ? 'mt-[var(--s-3)] border-t border-[var(--line)] pt-[var(--s-3)]' : ''} flex flex-col gap-[var(--s-2)]`}>
                {customFields.map((f) => (
                  <ContextRow key={f.id} label={f.label}>{f.value}</ContextRow>
                ))}
                {notes && <ContextRow label={t('deliveryNotes')}>{notes}</ContextRow>}
              </div>
            )}
          </div>
        </ContextBlock>
      )}

      {/* Rendered when it has something to say — or when the address block did
          not render, so a delivery order always keeps one fulfillment heading. */}
      {(hasCourierInfo || !hasAddressBlock) && (
        <ContextBlock
          label={(
            <span className="inline-flex items-center gap-1.5">
              <TruckIcon className="size-3.5" />
              {t('courier')}
            </span>
          )}
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
