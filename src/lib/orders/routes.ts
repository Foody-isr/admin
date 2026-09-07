/** Canonical list URL for a restaurant's orders. */
export function ordersListPath(restaurantId: number): string {
  return `/${restaurantId}/orders/all`;
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
