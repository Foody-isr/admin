import type { WebsitePageType } from "./types";

/** The public preview surface shown by the current editor. */
export type InspectorSurface = "branches" | "page" | "checkout";
const PAGE_ONLY = ["page"] as const;

/** Surfaces a page type can present. Only order pages have a checkout. */
export function surfacesForPageType(
  type: WebsitePageType,
  includeBranchSelector = false,
): readonly InspectorSurface[] {
  if (type !== "order") return PAGE_ONLY;
  return includeBranchSelector
    ? (["branches", "page", "checkout"] as const)
    : (["page", "checkout"] as const);
}

/** Clamps a requested surface to one the page type actually has.
 *
 *  This is the structural guarantee that a non-order page can never render a
 *  checkout-only field, not even for a single frame while a reset effect is
 *  still pending. `undefined` covers the builder's nullable active page. */
export function effectiveSurface(
  type: WebsitePageType | undefined,
  requested: InspectorSurface,
  includeBranchSelector = false,
): InspectorSurface {
  if (!type) return "page";
  return surfacesForPageType(type, includeBranchSelector).includes(requested)
    ? requested
    : "page";
}
