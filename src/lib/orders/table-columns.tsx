'use client';

import React, { type ReactNode } from 'react';
import { Badge } from '@/components/ds';
import { CashTag } from '@/components/orders/CashTag';
import {
  displayedPaymentStatus,
  localizePaymentStatus,
  localizeStatus,
  localizeOrderType,
  localizeSource,
} from '@/lib/orders/status-presentation';
import type { Order, OrdersTableConfig } from '@/lib/api';
import type { MoneyFormatter } from '@/lib/currency';
import {
  resolveColumns,
  visibleColumns,
  type ColumnSpec,
  type Resolved,
  type Rendered,
} from '@/lib/orders/column-layout';

export { hasCustomLayout } from '@/lib/orders/column-layout';

type Translate = (key: string) => string;

export interface OrderColumn extends ColumnSpec {
  /** Stable identifier persisted in the restaurant's saved layout. Never reuse
   *  a key for different content: a saved layout would silently apply to it. */
  key: string;
  /** i18n key for both the header and the mobile card label. */
  labelKey: string;
  align?: 'left' | 'right';
  cellClassName?: string;
  /**
   * Whether the column is shown to a restaurant that has not customised its
   * table. Optional delivery fields remain hidden until explicitly enabled.
   */
  defaultVisible: boolean;
  /** Eligible to be the card heading when the table collapses to cards on
   *  mobile: rendered larger and without a leading label. */
  mobilePrimary?: boolean;
  render: (order: Order, t: Translate, money: MoneyFormatter, locale?: string) => ReactNode;
}

/**
 * Every column the admin orders table can show, in its natural order.
 *
 * This list is the whole universe of columns and is identical for every
 * restaurant on the platform. What differs per restaurant is only which of them
 * are shown and in what order (see `Restaurant.orders_table_config`). Hiding a
 * column is a display preference — nothing is ever removed from here because
 * one restaurant does not want it.
 */
export const ORDER_COLUMNS: OrderColumn[] = [
  {
    key: 'customer',
    labelKey: 'name',
    defaultVisible: true,
    mobilePrimary: true,
    render: (order, t) => (
      <span title={order.customer_name || t('guestCustomer')} className="block w-[184px] max-w-full truncate font-medium">
        {order.customer_name || t('guestCustomer')}
      </span>
    ),
  },
  {
    key: 'source',
    labelKey: 'source',
    defaultVisible: true,
    cellClassName: 'md:min-w-[120px]',
    render: (order, t) => localizeSource(order.order_source, t),
  },
  {
    key: 'type',
    labelKey: 'type',
    defaultVisible: true,
    cellClassName: 'md:min-w-[120px]',
    render: (order, t) => localizeOrderType(order.order_type, t),
  },
  {
    key: 'items',
    labelKey: 'items',
    defaultVisible: true,
    cellClassName: 'md:min-w-[172px]',
    render: (order) => (
      <span role="group" className="flex items-center gap-2" aria-label={(order.items ?? []).map(item => `${item.quantity} × ${item.name}`).join(', ')}>
        {(order.items ?? []).slice(0, 2).map(item => (
          <span key={item.id} title={`${item.quantity} × ${item.name}`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--line)] text-sm font-medium text-[var(--fg-muted)]" aria-hidden="true">
            {Array.from(item.name).slice(0, 2).join('')}
          </span>
        ))}
        {(order.items?.length ?? 0) > 2 && <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--line-strong)] text-sm font-medium text-[var(--fg)]">+{order.items.length - 2}</span>}
      </span>
    ),
  },
  {
    key: 'created_at',
    labelKey: 'orderDate',
    defaultVisible: true,
    cellClassName: 'md:min-w-[200px]',
    render: (order, _t, _money, locale) => (
      <span className="whitespace-nowrap">{new Date(order.created_at).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    ),
  },
  {
    key: 'date',
    labelKey: 'dateBasisSerieOption',
    defaultVisible: true,
    cellClassName: 'md:min-w-[200px]',
    render: (order, _t, _money, locale) => {
      const scheduled = !!order.is_scheduled && !!order.scheduled_for;
      const date = scheduled ? order.scheduled_for! : order.created_at;
      const window = scheduled && order.scheduled_pickup_window_start && order.scheduled_pickup_window_end
        ? `${order.scheduled_pickup_window_start}–${order.scheduled_pickup_window_end}`
        : null;
      return <span className="whitespace-nowrap">{window
        ? `${new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}, ${window}`
        : new Date(date).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
    },
  },
  {
    key: 'status',
    labelKey: 'status',
    defaultVisible: true,
    render: (order, t) => {
      return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          {localizeStatus(order.status, t)}
          {order.external_metadata?.stock_oversold === true && <Badge tone="warning" dot>{t('stockOversoldBadge')}</Badge>}
        </span>
      );
    },
  },
  {
    key: 'payment',
    labelKey: 'payment',
    defaultVisible: true,
    render: (order, t, money) => {
      const paymentStatus = displayedPaymentStatus(order);
      const balanceDue = order.balance_due ?? 0;
      return (
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span>{localizePaymentStatus(paymentStatus, t)}</span>
            <CashTag order={order} />
          </div>
          {paymentStatus === 'partially_paid' && balanceDue > 0.01 && (
            <span className="text-fs-xs font-medium text-[var(--warning-600)] tabular-nums">
              {t('balanceRemainingShort').replace('{amount}', money(balanceDue))}
            </span>
          )}
        </div>
      );
    },
  },
  {
    key: 'total',
    labelKey: 'total',
    defaultVisible: true,
    align: 'right',
    cellClassName: 'font-medium text-fg-primary',
    render: (order, _t, money) => (
      <>{money(order.total_amount ?? 0, { decimals: 0, grouped: true }).replace(/,/g, '\u202f')}</>
    ),
  },
  {
    key: 'order_no',
    labelKey: 'orderNoColumn',
    defaultVisible: false,
    cellClassName: 'text-fg-secondary tabular-nums',
    render: (order) => <>#{order.id}</>,
  },
  // Delivery columns. Hidden by default: a restaurant that does not deliver
  // would otherwise inherit four permanently empty columns.
  {
    key: 'city',
    labelKey: 'cityColumn',
    defaultVisible: false,
    cellClassName: 'text-fg-secondary',
    render: (order) => order.delivery_city || null,
  },
  {
    key: 'address',
    labelKey: 'addressColumn',
    defaultVisible: false,
    cellClassName: 'text-fg-secondary',
    render: (order) => order.delivery_address || null,
  },
  {
    key: 'courier',
    labelKey: 'courierColumn',
    defaultVisible: false,
    cellClassName: 'text-fg-secondary',
    render: (order) => order.courier_name || null,
  },
  {
    key: 'tour',
    labelKey: 'tourColumn',
    defaultVisible: false,
    cellClassName: 'text-fg-secondary',
    render: (order) => order.tour?.name || null,
  },
];

export type ResolvedOrderColumn = Resolved<OrderColumn>;
export type RenderedOrderColumn = Rendered<OrderColumn>;

/** Every column, arranged and visibility-resolved. Feeds the picker, which
 *  needs the hidden ones too. */
export function resolveOrderColumns(config?: OrdersTableConfig | null): ResolvedOrderColumn[] {
  return resolveColumns(ORDER_COLUMNS, config);
}

/** The columns the table renders, one of them flagged as the mobile card heading. */
export function visibleOrderColumns(config?: OrdersTableConfig | null): RenderedOrderColumn[] {
  return visibleColumns(ORDER_COLUMNS, config);
}
