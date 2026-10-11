import type { Restaurant } from "@/lib/api";

/** Matches the storefront's permitted menu choices without letting design change service rules. */
export function websiteOrderChoicesAvailable(
  restaurant: Pick<Restaurant, "pickup_enabled" | "delivery_enabled" | "scheduling_enabled" | "batch_fulfillment_enabled">,
  checkout: unknown,
): boolean {
  const locked = checkout && typeof checkout === "object" && "lock_order_type" in checkout && checkout.lock_order_type;
  return !locked && Boolean(
    (restaurant.pickup_enabled && restaurant.delivery_enabled) ||
    ((restaurant.pickup_enabled || restaurant.delivery_enabled) && restaurant.scheduling_enabled && !restaurant.batch_fulfillment_enabled)
  );
}
