/** Persisted Header component contract. Kept identical in Admin, Web and the server validator. */
export type WebsiteHeader = {
  version: 1;
  layout: "left" | "center" | "right" | "stacked" | "compact" | "centered" | "restaurant";
  scroll: "sticky" | "reveal" | "none";
  color_style: "default" | "light" | "dark" | "accent" | "surface" | "soft" | "style-1" | "style-2" | "style-3" | "style-4" | "style-5" | "style-6";
  background: {
    mode: "transparent" | "style" | "color" | "gradient" | "image";
    color: string;
    end: string;
    angle: number;
    image: string;
    overlay: number;
  };
  navigation: {
    enabled: boolean;
    mode: "dropdown" | "mega";
    uppercase: boolean;
    color: string;
    links: HeaderLink[];
  };
  logo: {
    type: "image" | "text";
    image: string;
    text: string;
    size: number;
    background: string;
    custom_background: boolean;
    link: HeaderTarget;
  };
  button: {
    enabled: boolean;
    text: string;
    style: "filled" | "outline";
    color: string;
    link: HeaderTarget;
  };
  icons: { cart: boolean; search: boolean; color: string };
  fulfillment: { enabled: boolean; background: string };
  restaurant: {
    height: "small" | "medium" | "large";
    show_name: boolean;
    info_enabled: boolean;
    info_layout?: "modern" | "classic";
    info_color_style: "default" | "style-1" | "style-2" | "style-3" | "style-4" | "style-5" | "style-6";
    show_status: boolean;
    show_minimum: boolean;
    show_social: boolean;
  };
};
export type HeaderTarget = {
  kind: "home" | "page" | "order" | "url" | "phone" | "email" | "file";
  value: string;
  anchor?: string;
  new_tab?: boolean;
};
export type HeaderLink = {
  id: string;
  label: string;
  target: HeaderTarget;
  children?: HeaderLink[];
};
export const HEADER_LAYOUTS = [
  "left",
  "center",
  "right",
  "stacked",
  "compact",
  "centered",
  "restaurant",
] as const;
export const HEADER_COLOR_STYLES = [
  "default",
  "light",
  "dark",
  "accent",
  "surface",
  "soft",
  "style-1", "style-2", "style-3", "style-4", "style-5", "style-6",
] as const;
export const HEADER_ELEMENTS = [
  "logo",
  "navigation",
  "button",
  "icons",
  "fulfillment",
  "restaurant",
] as const;
export type HeaderElement = (typeof HEADER_ELEMENTS)[number];

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, fallback = "") =>
  typeof v === "string" ? v : fallback;
const bool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;
const color = (v: unknown) =>
  typeof v === "string" && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(v) ? v : "";
const choice = <T extends string>(
  v: unknown,
  values: readonly T[],
  fallback: T,
): T => (values.includes(v as T) ? (v as T) : fallback);
const range = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(min, Math.min(max, v))
    : fallback;

/** Accepts only safe authored links; relative destinations are resolved within the current restaurant. */
export function headerSafeUrl(value: unknown, media = false): string {
  const v = text(value).trim();
  if (!v || /[\\\u0000-\u0020]/.test(v) || v.startsWith("//")) return "";
  if (/^https?:\/\//i.test(v) || (!media && /^(mailto:|tel:|#)/i.test(v)))
    return v;
  if (!/^[a-z][a-z\d+.-]*:/i.test(v)) return v;
  return "";
}

/** Normalizes an authored target without accepting script or cross-protocol URLs. */
export function normalizeHeaderTarget(
  value: unknown,
  fallback: HeaderTarget["kind"] = "home",
): HeaderTarget {
  const v = record(value);
  const kind = choice(
    v.kind,
    ["home", "page", "order", "url", "phone", "email", "file"] as const,
    fallback,
  );
  return {
    kind,
    value:
      kind === "url" || kind === "file"
        ? headerSafeUrl(v.value, kind === "file")
        : text(v.value),
    anchor: text(v.anchor),
    new_tab: bool(v.new_tab, false),
  };
}

/** Normalizes the component independently from retired navbar composition fields. */
export function normalizeWebsiteHeader(value: unknown): WebsiteHeader {
  const v = record(value),
    bg = record(v.background),
    nav = record(v.navigation),
    logo = record(v.logo),
    button = record(v.button),
    icons = record(v.icons),
    fulfillment = record(v.fulfillment),
    restaurant = record(v.restaurant);
  const links = (value: unknown, depth = 0): HeaderLink[] =>
    !Array.isArray(value) || depth > 1
      ? []
      : value.slice(0, 30).map((link, index) => {
          const l = record(link);
          return {
            id: text(l.id, `link-${index}`),
            label: text(l.label),
            target: normalizeHeaderTarget(l.target),
            children: links(l.children, depth + 1),
          };
        });
  return {
    version: 1,
    layout: choice(v.layout, HEADER_LAYOUTS, "left"),
    scroll: choice(v.scroll, ["sticky", "reveal", "none"] as const, "reveal"),
    color_style: choice(v.color_style, HEADER_COLOR_STYLES, "default"),
    background: {
      mode: choice(
        bg.mode,
        ["transparent", "style", "color", "gradient", "image"] as const,
        "style",
      ),
      color: color(bg.color),
      end: color(bg.end) || "#ffffff",
      angle: range(bg.angle, 0, 360, 90),
      image: headerSafeUrl(bg.image, true),
      overlay: range(bg.overlay, 0, 100, 0),
    },
    navigation: {
      enabled: bool(nav.enabled, true),
      mode: choice(nav.mode, ["dropdown", "mega"] as const, "dropdown"),
      uppercase: bool(nav.uppercase, false),
      color: color(nav.color),
      links: links(nav.links),
    },
    logo: {
      type: choice(logo.type, ["image", "text"] as const, "image"),
      image: headerSafeUrl(logo.image, true),
      text: text(logo.text),
      size: range(logo.size, 24, 160, 64),
      background: color(logo.background) || "#ffffff",
      custom_background: bool(logo.custom_background, false),
      link: normalizeHeaderTarget(logo.link),
    },
    button: {
      enabled: bool(button.enabled, true),
      text: text(button.text),
      style: choice(button.style, ["filled", "outline"] as const, "filled"),
      color: color(button.color),
      link: normalizeHeaderTarget(button.link, "order"),
    },
    icons: {
      cart: bool(icons.cart, true),
      search: bool(icons.search, true),
      color: color(icons.color),
    },
    restaurant: {
      height: choice(restaurant.height, ["small", "medium", "large"] as const, "medium"),
      show_name: bool(restaurant.show_name, true),
      info_enabled: bool(restaurant.info_enabled, true),
      ...(["modern", "classic"].includes(restaurant.info_layout as string)
        ? {info_layout: restaurant.info_layout as "modern" | "classic"} : {}),
      info_color_style: choice(restaurant.info_color_style, ["default", "style-1", "style-2", "style-3", "style-4", "style-5", "style-6"] as const, "default"),
      show_status: bool(restaurant.show_status, true),
      show_minimum: bool(restaurant.show_minimum, true),
      show_social: bool(restaurant.show_social, true),
    },
    fulfillment: {
      enabled: bool(fulfillment.enabled, false),
      // Keep the legacy wire field empty: fulfillment inherits the Header style.
      background: "",
    },
  };
}

/** One-way boundary for previously saved sites; the Header never writes retired navbar options. */
export function headerFromLegacy(
  config: Record<string, unknown>,
  pages: Array<{
    slug: string;
    title: string;
    nav_visible: boolean;
    sort_order: number;
  }>,
  logoUrl = "",
): WebsiteHeader {
  const nav = record(config.nav_layout);
  if (record(nav.header).version === 1)
    return normalizeWebsiteHeader(nav.header);
  const cta = record(config.navbar_cta);
  const links: HeaderLink[] = Array.isArray(nav.links)
    ? nav.links
        .map((entry, index): HeaderLink => {
          const link = record(entry);
          return {
            id: text(link.id, `link-${index}`),
            label: text(link.label),
            target: link.page_slug
              ? {
                  kind: "page",
                  value: text(link.page_slug),
                  anchor: text(link.anchor),
                }
              : { kind: "url", value: text(link.url) },
          };
        })
        .filter((link) => link.label.trim())
    : pages
        .filter((p) => p.nav_visible)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((p) => ({
          id: `page-${p.slug}`,
          label: p.title,
          target: { kind: "page", value: p.slug },
        }));
  return normalizeWebsiteHeader({
    layout: config.navbar_logo_position === "center" ? "stacked" : "left",
    background: {
      mode:
        config.navbar_style === "transparent" ||
        config.navbar_style === "overlay"
          ? "transparent"
          : "style",
    },
    navigation: { enabled: config.navbar_show_links !== false, links },
    logo: {
      type: logoUrl ? "image" : "text",
      image: logoUrl,
      size: Number(config.logo_size) || 64,
    },
    button: {
      enabled: cta.enabled !== false,
      text: text(cta.text),
      style: cta.variant === "outline" ? "outline" : "filled",
      link:
        cta.link && cta.link !== "order" && cta.link !== "/order"
          ? { kind: "url", value: text(cta.link) }
          : { kind: "order", value: "" },
    },
  });
}

/** Only presentation is page-owned; logo content, navigation and service rules stay shared. */
export type OrderHeaderPresentation = Pick<WebsiteHeader,
  "version" | "layout" | "scroll" | "color_style" | "background" | "restaurant"
> & { logo_size: number };

/** Captures the current presentation when opting out of the shared site header. */
export function orderHeaderPresentation(header: WebsiteHeader): OrderHeaderPresentation {
  const h = normalizeWebsiteHeader(header);
  return { version: 1, layout: h.layout, scroll: h.scroll, color_style: h.color_style,
    background: h.background, restaurant: h.restaurant, logo_size: h.logo.size };
}

/** Resolves the order-only override while always retaining current shared content. */
export function resolvePageHeader(
  shared: WebsiteHeader,
  pageType?: string,
  appearance?: Record<string, unknown> | null,
): WebsiteHeader {
  const local = record(appearance?.order_header);
  if (pageType !== "order" || local.version !== 1) return shared;
  const presentation = normalizeWebsiteHeader({ ...shared,
    layout: local.layout, scroll: local.scroll, color_style: local.color_style,
    background: local.background, restaurant: local.restaurant,
    logo: { ...shared.logo, size: local.logo_size },
  });
  return { ...shared, layout: presentation.layout, scroll: presentation.scroll,
    color_style: presentation.color_style, background: presentation.background,
    restaurant: presentation.restaurant,
    logo: { ...shared.logo, size: presentation.logo.size } };
}

/** Retains the previous display for unsaved layouts; explicit choices never depend on ordering rules. */
export function restaurantInfoLayout(settings: WebsiteHeader["restaurant"], canChoose: boolean): "modern" | "classic" {
  return settings.info_layout ?? (canChoose ? "modern" : "classic");
}

/** Standard service bars inherit the header until an independent information style is selected. */
export function headerInformationColorStyle(header: WebsiteHeader): WebsiteHeader["color_style"] {
  return header.layout === "restaurant" || header.restaurant.info_color_style !== "default"
    ? header.restaurant.info_color_style : header.color_style;
}
