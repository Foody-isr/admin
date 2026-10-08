import { headerFromLegacy, resolvePageHeader } from "./header";
import { normalizeSiteColors, sectionSiteColorId } from "./site-colors";
import { sectionBelongs } from "./section-operations";
import { pageKey, type DraftConfigPayload, type DraftPagePayload, type DraftSectionPayload } from "./types";

export type ColorUsagePart = "header" | "info" | "menu" | "sections";

/** Lists actual style assignments, including shared chrome and order-page overrides. */
export function siteColorUsage(
  config: DraftConfigPayload,
  pages: DraftPagePayload[],
  sections: DraftSectionPayload[],
  palette: Record<string, unknown>,
  styleId: string,
) {
  const colors = normalizeSiteColors(palette);
  const matches = (value: unknown) => {
    const id = sectionSiteColorId({color_styles: colors}, String(value ?? "default"));
    return (colors.styles.some(style => style.id === id) ? id : colors.default) === styleId;
  };
  const shared = headerFromLegacy(config, pages);
  return pages.map(page => {
    const parts = new Set<ColorUsagePart>();
    const header = resolvePageHeader(shared, page.type, page.appearance_overrides);
    if (matches(header.color_style)) parts.add("header");
    if (header.layout === "restaurant" && header.restaurant.info_enabled && matches(header.restaurant.info_color_style)) parts.add("info");
    if (page.type === "order" && matches(page.appearance_overrides.website_order?.color_style)) parts.add("menu");
    if (sections.some(section => section.is_visible &&
      (sectionBelongs(section, page) || section.page === "_site") &&
      matches(section.settings.color_style ?? "light"))) parts.add("sections");
    return { key: pageKey(page), title: page.title, parts: Array.from(parts) };
  }).filter(usage => usage.parts.length > 0);
}
