const COURIER_ROLE_NAME = 'courier';

/** Returns true for the built-in per-restaurant Courier role. */
export function isCourierRoleName(roleName: string): boolean {
  return roleName.trim().toLowerCase() === COURIER_ROLE_NAME;
}

/** Couriers only use their dedicated delivery itinerary inside the admin app. */
export function isCourierDeliveryPath(pathname: string, restaurantId: number): boolean {
  const deliveryPath = `/${restaurantId}/orders/deliveries`;
  return pathname === deliveryPath || pathname.startsWith(`${deliveryPath}/`);
}

/** Landing page for a restaurant account, keeping couriers out of the admin dashboard. */
export function restaurantHomePath(restaurantId: number, roleName: string): string {
  return isCourierRoleName(roleName)
    ? `/${restaurantId}/orders/deliveries`
    : `/${restaurantId}/dashboard`;
}
