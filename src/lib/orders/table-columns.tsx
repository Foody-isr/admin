'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ds';
import { CashTag } from '@/components/orders/CashTag';
import {
  STATUS_TONE,
  PAYMENT_TONE,
  localizeStatus,
  localizeOrderType,
} from '@/components/orders/OrderDetailDrawer';
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
   * table. Every column added after launch ships `false`, so no restaurant's
   * table changes shape under them when we release a new one.
   */
  defaultVisible: boolean;
  /** Eligible to be the card heading when the table collapses to cards on
   *  mobile: rendered larger and without a leading label. */
  mobilePrimary?: boolean;
  render: (order: Order, t: Translate, money: MoneyFormatter) => ReactNode;
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
    key: 'order_no',
    labelKey: 'orderNoColumn',
    defaultVisible: true,
    cellClassName: 'text-fg-secondary tabular-nums',
    render: (order) => <>#{order.id}</>,
  },
  {
    key: 'customer',
    labelKey: 'name',
    defaultVisible: true,
    mobilePrimary: true,
    render: (order, t) => (
      <span className="font-semibold text-fg-primary">
        {order.customer_name || t('guestCustomer')}
      </span>
    ),
  },
  {
    key: 'type',
    labelKey: 'type',
    defaultVisible: true,
    cellClassName: 'text-fg-secondary',
    render: (order, t) => localizeOrderType(order.order_type, t),
  },
  {
    key: 'date',
    labelKey: 'date',
    defaultVisible: true,
    cellClassName: 'text-fg-secondary',
    render: (order) => (
      <div className="flex md:flex-col items-baseline md:items-stretch gap-1.5 md:gap-0">
        <span className="tabular-nums">
          {new Date(order.created_at).toLocaleDateString([], {
            day: '2-digit',
            month: 'short',
          })}
        </span>
        <span className="text-fs-xs text-[var(--fg-subtle)] tabular-nums">
          {new Date(order.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    ),
  },
  {
    key: 'status',
    labelKey: 'status',
    defaultVisible: true,
    render: (order, t) => (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} dot>
          {localizeStatus(order.status, t)}
        </Badge>
        {order.external_metadata?.stock_oversold === true && (
          <Badge tone="warning" dot>
            {t('stockOversoldBadge')}
          </Badge>
        )}
      </div>
    ),
  },
  {
    key: 'payment',
    labelKey: 'payment',
    defaultVisible: true,
    render: (order, t) => (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'}>
          {(() => {
            const tv = t(order.payment_status);
            return tv === order.payment_status ? order.payment_status : tv;
          })()}
        </Badge>
        <CashTag order={order} />
      </div>
    ),
  },
  {
    key: 'total',
    labelKey: 'total',
    defaultVisible: true,
    align: 'right',
    cellClassName: 'font-medium text-fg-primary',
    render: (order, _t, money) => <>{money(order.total_amount ?? 0, { decimals: 0 })}</>,
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
