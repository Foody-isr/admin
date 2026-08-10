import { normalizeSlug } from "./state";
import type { DraftPagePayload, WebsitePageType } from "./types";
import { isReservedPublicWebsiteSlug } from "./public-route-segments";

type PublicAddressPage = Pick<
  DraftPagePayload,
  "type" | "slug" | "is_default"
> &
  Partial<Pick<DraftPagePayload, "is_homepage">>;

/** Returns the stable public alias owned by a commerce page type. */
export function canonicalAliasForType(
  type: WebsitePageType,
): "/order" | "/catering" | null {
  if (type === "order") return "/order";
  if (type === "catering") return "/catering";
  return null;
}

/** Returns the single public address presented for a website page. */
export function publicAddressForPage(
  page: PublicAddressPage,
): string {
  if (page.type === "landing" && page.is_homepage !== false) return "/";
  const canonical = canonicalAliasForType(page.type);
  return page.is_default && canonical ? canonical : `/${normalizeSlug(page.slug)}`;
}

/** Builds the absolute customer URL shown by the Website V3 toolbar. */
export function publicURLForPage({
  webOrigin,
  restaurantSlug,
  page,
}: {
  webOrigin: string;
  restaurantSlug: string;
  page: PublicAddressPage;
}): string {
  const address = publicAddressForPage(page);
  const restaurantPath = `/r/${encodeURIComponent(restaurantSlug)}`;
  return `${new URL(webOrigin).origin}${restaurantPath}${
    address === "/" ? "" : address
  }`;
}

/** Checks whether a slug belongs to Foody routing rather than a custom page. */
export function isReservedPublicSlug(slug: string): boolean {
  return isReservedPublicWebsiteSlug(normalizeSlug(slug));
}

/** Suggests a unique editable slug while preserving the canonical commerce alias. */
export function suggestSpecificSlug(
  type: WebsitePageType,
  pages: Array<Pick<{ slug: string }, "slug">>,
): string {
  const base =
    type === "order"
      ? "commander"
      : type === "catering"
        ? "traiteur"
        : "nouvelle-page";
  const taken = new Set(pages.map((page) => page.slug));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
