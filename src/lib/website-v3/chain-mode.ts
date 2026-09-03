import type { ChainOverview } from "@/lib/api";

export type WebsiteManagementMode =
  | { kind: "global" }
  | { kind: "local"; primaryRestaurantId: number };

/** Resolves which editing surface a restaurant receives. */
export function websiteManagementMode(
  restaurantId: number,
  overview: ChainOverview | null,
): WebsiteManagementMode {
  const primaryRestaurantId = overview?.primary_restaurant_id;
  if (
    overview?.chain_id != null &&
    primaryRestaurantId != null &&
    primaryRestaurantId !== restaurantId
  ) {
    return { kind: "local", primaryRestaurantId };
  }
  return { kind: "global" };
}
