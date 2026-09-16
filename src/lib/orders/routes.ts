/** Canonical list URL for a restaurant's orders. */
export function ordersListPath(restaurantId: number): string {
  return `/${restaurantId}/orders/all`;
}

export const PAYMENT_ATTENTION_FILTER = 'unpaid,pending';

export interface OrdersPaymentAttentionScope {
  from: string;
  to: string;
  dateField: 'created' | 'serie';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

/** Deep link to the active orders whose payment still needs staff attention. */
export function ordersPaymentAttentionPath(
  restaurantId: number,
  scope: OrdersPaymentAttentionScope,
): string {
  const query = new URLSearchParams({
    view: 'payment_attention',
    from: scope.from,
    to: scope.to,
    date_field: scope.dateField,
  });
  return `${ordersListPath(restaurantId)}?${query.toString()}`;
}

/** Reads a valid payment-attention deep link; malformed dates fall back safely. */
export function parseOrdersPaymentAttentionQuery(
  query: Pick<URLSearchParams, 'get'>,
): OrdersPaymentAttentionScope | null {
  if (query.get('view') !== 'payment_attention') return null;
  const from = query.get('from');
  const to = query.get('to');
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return null;
  return {
    from,
    to,
    dateField: query.get('date_field') === 'serie' ? 'serie' : 'created',
  };
}

/** Canonical, shareable URL for one order in a restaurant. */
export function orderDetailPath(restaurantId: number, orderId: number): string {
  return `/${restaurantId}/orders/${orderId}`;
}

/** Absolute canonical URL used when an order is shared outside the app. */
export function orderDetailUrl(origin: string, restaurantId: number, orderId: number): string {
  return new URL(orderDetailPath(restaurantId, orderId), origin).toString();
}

/** Parses the dynamic order route while rejecting malformed or unsafe IDs. */
export function parseOrderIdParam(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const orderId = Number(value);
  return Number.isSafeInteger(orderId) ? orderId : null;
}
