/**
 * Static segments owned by foodyweb below `/r/<restaurant>`.
 * Keep this mirror aligned with `restaurants.PublicWebsiteRouteSegments`.
 */
export const PUBLIC_WEBSITE_ROUTE_SEGMENTS = [
  "catering",
  "delivery",
  "order",
  "orders",
  "payment",
  "pickup",
  "stories",
  "t",
  "table",
  "tournee",
] as const;

const PUBLIC_WEBSITE_ROUTE_SEGMENT_SET = new Set<string>(
  PUBLIC_WEBSITE_ROUTE_SEGMENTS,
);

/** Reports whether a page slug is owned by a static customer route. */
export function isReservedPublicWebsiteSlug(slug: string): boolean {
  return PUBLIC_WEBSITE_ROUTE_SEGMENT_SET.has(slug);
}
