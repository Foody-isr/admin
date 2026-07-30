import type { WebsitePageType } from "./types";

const RESERVED_PUBLIC_SLUGS = new Set([
  "order",
  "catering",
  "checkout",
  "tracking",
  "account",
  "table",
  "api",
]);

/** Returns the stable public alias owned by a commerce page type. */
export function canonicalAliasForType(
  type: WebsitePageType,
): "/order" | "/catering" | null {
  if (type === "order") return "/order";
  if (type === "catering") return "/catering";
  return null;
}

/** Checks whether a slug belongs to Foody routing rather than a custom page. */
export function isReservedPublicSlug(slug: string): boolean {
  return RESERVED_PUBLIC_SLUGS.has(slug);
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
