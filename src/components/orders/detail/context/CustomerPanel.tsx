'use client';

// Who ordered.
//
// Two additions over the drawer version: the phone is a tel: link (staff could
// not call the customer from the order, only read the number), and the history
// strip turns a bare number into a known regular.

import { EditIcon, GlobeIcon, PhoneIcon } from 'lucide-react';
import type { Order } from '@/lib/api';
import { localizeOrderType, localizeSource } from '@/lib/orders/status-presentation';
import type { CustomFieldAnswer } from '@/lib/orders/checkout-fields';
import { ContextBlock, ContextRow } from '../primitives/ContextBlock';
import { CustomerHistoryStrip } from './CustomerHistoryStrip';

export function CustomerPanel({
  order,
  canManage,
  onEditCustomer,
  customFields,
  customerInitials,
  t,
}: {
  order: Order;
  canManage: boolean;
  onEditCustomer?: () => void;
  /** The answers that describe the CUSTOMER. The ones that describe where the
   *  order goes are rendered by DeliveryPanel instead — see
   *  splitCustomFieldAnswers, which decides once for both panels. */
  customFields: CustomFieldAnswer[];
  customerInitials: string;
  t: (k: string) => string;
}) {
  const dialable = (order.customer_phone || '').replace(/[^\d+]/g, '');

  return (
    <ContextBlock>
      <div className="flex items-center gap-[var(--s-3)]">
        <div
          className="w-12 h-12 rounded-full grid place-items-center text-white font-semibold tracking-tight shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}
        >
          {customerInitials}
        </div>
        <div className="min-w-0">
          {canManage && onEditCustomer ? (
            <button
              type="button"
              onClick={onEditCustomer}
              title={t('editCustomer')}
              className="group flex items-center gap-1.5 font-display text-fs-xl truncate max-w-full text-start hover:text-[var(--brand-500)] transition-colors"
            >
              <span className="truncate">{order.customer_name || t('guestCustomer') || 'Client'}</span>
              <EditIcon className="w-3.5 h-3.5 shrink-0 text-[var(--fg-subtle)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <div className="font-display text-fs-xl truncate">
              {order.customer_name || t('guestCustomer') || 'Client'}
            </div>
          )}

          {order.customer_phone && (
            // dir="ltr": a phone number is not text and must not mirror.
            // Without it Hebrew renders "053 708 55 13" as "13 55 708 053",
            // which staff cannot dial.
            <a
              href={`tel:${dialable}`}
              dir="ltr"
              className="mt-0.5 inline-flex items-center gap-1.5 num text-fs-xs text-[var(--fg-subtle)] hover:text-[var(--brand-500)] transition-colors text-start"
            >
              <PhoneIcon className="w-3 h-3 shrink-0" />
              {order.customer_phone}
            </a>
          )}
        </div>
      </div>

      <CustomerHistoryStrip restaurantId={order.restaurant_id} phone={order.customer_phone} t={t} />

      <div className="flex flex-col gap-[var(--s-2)] mt-[var(--s-4)]">
        <ContextRow label={t('type')}>{localizeOrderType(order.order_type, t)}</ContextRow>
        <ContextRow label={t('source')}>
          <span className="inline-flex items-center gap-1.5">
            <GlobeIcon className="w-3 h-3 text-[var(--fg-muted)]" />
            {localizeSource(order.order_source, t)}
          </span>
        </ContextRow>
        {order.table_number && (
          <ContextRow label="Table">
            <span className="num">{order.table_number}</span>
          </ContextRow>
        )}

        {/* Answers to the owner's custom checkout fields, minus the ones that
            describe the address — a hand-rolled "Code immeuble" used to render
            here, four rows above the address it belongs to. */}
        {customFields.map((f) => (
          <ContextRow key={f.id} label={f.label}>{f.value}</ContextRow>
        ))}
      </div>
    </ContextBlock>
  );
}
