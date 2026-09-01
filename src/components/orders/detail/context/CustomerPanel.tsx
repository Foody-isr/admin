'use client';

// Who ordered.
//
// Two additions over the drawer version: the phone is a tel: link (staff could
// not call the customer from the order, only read the number), and the history
// strip turns a bare number into a known regular.

import { EditIcon, GlobeIcon, PhoneIcon, ShoppingBagIcon, UserRoundIcon } from 'lucide-react';
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
    <ContextBlock
      label={(
        <span className="inline-flex items-center gap-1.5">
          <UserRoundIcon className="size-3.5" />
          {t('customer')}
        </span>
      )}
      aside={canManage && onEditCustomer ? (
        <button
          type="button"
          onClick={onEditCustomer}
          title={t('editCustomer')}
          aria-label={t('editCustomer')}
          className="inline-flex size-7 items-center justify-center rounded-r-sm border border-[var(--line)] text-[var(--fg-muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-ring"
        >
          <EditIcon className="size-3.5" />
        </button>
      ) : undefined}
    >
      <div className="flex items-center gap-[var(--s-3)]">
        <div
          className="size-12 rounded-r-lg grid place-items-center text-white font-semibold tracking-tight shrink-0 shadow-1 ring-1 ring-inset ring-white/20"
          style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}
        >
          {customerInitials}
        </div>
        <div className="min-w-0">
          <div className="text-[20px] leading-[26px] font-bold tracking-[-0.015em] truncate">
            {order.customer_name || t('guestCustomer') || 'Client'}
          </div>

          {order.customer_phone && (
            // dir="ltr": a phone number is not text and must not mirror.
            // Without it Hebrew renders "053 708 55 13" as "13 55 708 053",
            // which staff cannot dial.
            <a
              href={`tel:${dialable}`}
              dir="ltr"
              className="mt-1 -ms-1.5 inline-flex min-h-7 items-center gap-1.5 rounded-r-sm px-1.5 num text-fs-xs text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--brand-500)] focus-visible:outline-none focus-visible:shadow-ring text-start"
            >
              <PhoneIcon className="w-3 h-3 shrink-0" />
              {order.customer_phone}
            </a>
          )}
        </div>
      </div>

      <CustomerHistoryStrip restaurantId={order.restaurant_id} phone={order.customer_phone} t={t} />

      <div className="mt-[var(--s-3)] grid grid-cols-2 gap-x-[var(--s-5)] gap-y-[var(--s-3)] border-t border-[var(--line)] pt-[var(--s-3)]">
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)]">
            {t('type')}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-fs-sm font-medium">
            <ShoppingBagIcon className="size-3.5 shrink-0 text-[var(--brand-500)]" />
            <span className="truncate">{localizeOrderType(order.order_type, t)}</span>
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)]">
            {t('source')}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-fs-sm font-medium">
            <GlobeIcon className="size-3.5 shrink-0 text-[var(--brand-500)]" />
            <span className="truncate">{localizeSource(order.order_source, t)}</span>
          </span>
        </div>
        {order.table_number && (
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)]">Table</span>
            <span className="mt-1 block text-fs-sm font-medium num">{order.table_number}</span>
          </div>
        )}
      </div>

      {customFields.length > 0 && (
        <div className="flex flex-col gap-[6px] mt-[var(--s-3)] border-t border-[var(--line)] pt-[var(--s-3)]">
        {/* Answers to the owner's custom checkout fields, minus the ones that
            describe the address — a hand-rolled "Code immeuble" used to render
            here, four rows above the address it belongs to. */}
        {customFields.map((f) => (
          <ContextRow key={f.id} label={f.label}>{f.value}</ContextRow>
        ))}
        </div>
      )}
    </ContextBlock>
  );
}
