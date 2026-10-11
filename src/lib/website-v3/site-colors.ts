/** Reusable website color styles. Keep this contract identical in Admin and Web. */
export const SITE_COLOR_IDS = [
  "style-1",
  "style-2",
  "style-3",
  "style-4",
  "style-5",
  "style-6",
] as const;
export type SiteColorId = (typeof SITE_COLOR_IDS)[number];
export const SITE_MENU_COLOR_ROLES = [
  "background",
  "heading",
  "bar_background",
  "category_text",
  "pill_background",
  "active_background",
  "active_text",
  "card_background",
  "card_title",
  "card_price",
  "card_description",
  "card_border",
] as const;
export type SiteMenuColorRole = (typeof SITE_MENU_COLOR_ROLES)[number];
export type SiteMenuColors = Record<SiteMenuColorRole, string>;
export const SITE_ITEM_COLOR_ROLES = [
  "background", "title", "description", "price",
  "options_background", "options_text", "selection_background", "selection_text", "selection_accent",
  "footer_background", "button_background", "button_text",
] as const;
export type SiteItemColorRole = (typeof SITE_ITEM_COLOR_ROLES)[number];
export type SiteItemColors = Record<SiteItemColorRole, string>;
export type SiteColorStyle = {
  id: SiteColorId;
  background: string;
  title: string;
  paragraph: string;
  solid_button: string;
  outline_button: string;
  menu?: Partial<SiteMenuColors>;
  item_detail?: Partial<SiteItemColors>;
};
export type SiteColors = {
  version: 1;
  default: SiteColorId;
  styles: SiteColorStyle[];
};
type Palette = Record<string, unknown>;
const record = (v: unknown): Palette =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Palette) : {};
/** Accepts authored hex colors without allowing CSS expressions. */
export function siteHex(value: unknown, fallback = "#000000"): string {
  if (typeof value !== "string" || !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value))
    return fallback;
  return (
    value.length === 4
      ? "#" +
        value
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : value
  ).toLowerCase();
}
/** Computes contrast only to seed defaults for colors the owner has not chosen. */
export function colorContrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const hex = siteHex(color).slice(1);
    return [0, 2, 4].reduce((sum, offset, i) => {
      const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return (
        sum +
        (channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4) *
          [0.2126, 0.7152, 0.0722][i]
      );
    }, 0);
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Chooses the more legible neutral foreground for a filled surface. */
export function siteContrastInk(background: string): string {
  return colorContrast(background, "#111111") >
    colorContrast(background, "#ffffff")
    ? "#111111"
    : "#ffffff";
}
/** Seeds six styles from the current theme, without changing legacy sites until they opt in. */
export function normalizeSiteColors(value: unknown): SiteColors {
  const p = record(value),
    saved = record(p.color_styles);
  const bg = siteHex(p.bg, "#ffffff"),
    ink = siteHex(p.ink, "#111111"),
    main = siteHex(p.accent, "#111111");
  const secondary = Array.isArray(p.secondary_colors)
    ? p.secondary_colors.map((v) => siteHex(v, "")).filter(Boolean)
    : [];
  const backgrounds = [
    bg,
    main,
    "#ffffff",
    secondary[0] || siteHex(p.surface, "#f0f0f0"),
    secondary[1] || "#111111",
    secondary[2] || "#eee9df",
  ];
  const authored = Array.isArray(saved.styles) ? saved.styles : [];
  return {
    version: 1,
    default: SITE_COLOR_IDS.includes(saved.default as SiteColorId)
      ? (saved.default as SiteColorId)
      : "style-1",
    styles: SITE_COLOR_IDS.map((id, i) => {
      const s = record(authored.find((v) => record(v).id === id));
      const background = siteHex(s.background, backgrounds[i]);
      const defaultInk = colorContrast(ink, background) >= 3 ? ink : siteContrastInk(background);
      const menu = normalizeSiteMenuColors(s.menu);
      const item = normalizeSiteItemColors(s.item_detail);
      return {
        id,
        background,
        title: siteHex(s.title, defaultInk),
        paragraph: siteHex(s.paragraph, defaultInk),
        solid_button: siteHex(
          s.solid_button,
          colorContrast(main, background) >= 3
            ? main
            : siteContrastInk(background),
        ),
        outline_button: siteHex(s.outline_button, defaultInk),
        ...(Object.keys(menu).length ? { menu } : {}),
        ...(Object.keys(item).length ? { item_detail: item } : {}),
      };
    }),
  };
}

/** Keeps item detail roles sparse and rejects CSS expressions at the rendering boundary. */
export function normalizeSiteItemColors(value: unknown): Partial<SiteItemColors> {
  const source = record(value);
  return Object.fromEntries(SITE_ITEM_COLOR_ROLES.flatMap(role => {
    const color = siteHex(source[role], "");
    return color ? [[role, color]] : [];
  }));
}

/** Inherits card identity and global buttons, with optional detail-only roles in the shared style. */
export function resolveSiteItemColors(style: SiteColorStyle): SiteItemColors {
  const item = normalizeSiteItemColors(style.item_detail);
  const menu = resolveSiteMenuColors(style);
  const background = item.background ?? (menu.card_background === "transparent" ? menu.background : menu.card_background);
  const title = item.title ?? menu.card_title;
  const description = item.description ?? menu.card_description;
  const options = item.options_background ?? background;
  const optionsText = item.options_text ?? title;
  const accent = item.selection_accent ?? menu.card_price;
  const mix = (a: string, b: string, ratio: number) => "#" + [1, 3, 5].map(offset =>
    Math.round(parseInt(a.slice(offset, offset + 2), 16) * ratio + parseInt(b.slice(offset, offset + 2), 16) * (1 - ratio)).toString(16).padStart(2, "0")
  ).join("");
  const selection = item.selection_background ?? mix(accent, options, .08);
  const button = item.button_background ?? style.solid_button;
  return {
    background, title, description,
    price: item.price ?? menu.card_price,
    options_background: options, options_text: optionsText,
    selection_background: selection,
    selection_text: item.selection_text ?? optionsText,
    selection_accent: accent,
    footer_background: item.footer_background ?? background,
    button_background: button,
    button_text: item.button_text ?? siteContrastInk(button),
  };
}

/** Only surface roles support transparency; text roles always use authored hex colors. */
export function menuColorAllowsTransparency(role: SiteMenuColorRole): boolean {
  return ["pill_background", "active_background", "card_background"].includes(
    role,
  );
}

/** Keeps sparse menu overrides so automatic roles continue following their source colors. */
export function normalizeSiteMenuColors(
  value: unknown,
): Partial<SiteMenuColors> {
  const source = record(value);
  return Object.fromEntries(
    SITE_MENU_COLOR_ROLES.flatMap((role) => {
      const color =
        source[role] === "transparent" && menuColorAllowsTransparency(role)
          ? "transparent"
          : siteHex(source[role], "");
      return color ? [[role, color]] : [];
    }),
  );
}

/** Inherits authored menu colors exactly, without contrast-based replacements. */
export function resolveSiteMenuColors(style: SiteColorStyle): SiteMenuColors {
  const menu = normalizeSiteMenuColors(style.menu);
  const background = menu.background ?? style.background;
  const bar = menu.bar_background ?? background;
  const pill = menu.pill_background ?? "transparent";
  const active = menu.active_background ?? style.solid_button;
  const card = menu.card_background ?? background;
  const title = menu.card_title ?? style.title;
  return {
    background,
    heading: menu.heading ?? style.title,
    bar_background: bar,
    category_text:
      menu.category_text ??
      style.paragraph,
    pill_background: pill,
    active_background: active,
    active_text:
      menu.active_text ??
      siteContrastInk(active === "transparent" ? bar : active),
    card_background: card,
    card_title: title,
    card_price: menu.card_price ?? title,
    card_description:
      menu.card_description ?? style.paragraph,
    card_border:
      menu.card_border ?? style.outline_button,
  };
}

/** Exposes menu roles separately from generic section, header and checkout colors. */
export function siteMenuColorVariables(
  style: SiteColorStyle,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(resolveSiteMenuColors(style)).map(([role, color]) => [
      `--site-menu-${role.replaceAll("_", "-")}`,
      color,
    ]),
  );
}

/** Binds every menu element to one shared style, including the live site default. */
export function siteMenuColorReference(id: string): Record<string, string> {
  const prefix = /^style-[1-6]$/.test(id) ? `--${id}` : "--site-default";
  return Object.fromEntries(
    SITE_MENU_COLOR_ROLES.map((role) => {
      const suffix = `menu-${role.replaceAll("_", "-")}`;
      return [`--site-${suffix}`, `var(${prefix}-${suffix})`];
    }),
  );
}
/** Resolves a stable style reference, or the site's default, only on opted-in sites. */
export function resolveSiteColorStyle(
  palette: unknown,
  id: string = "default",
): SiteColorStyle | undefined {
  if (!record(palette).color_styles && !/^style-[1-6]$/.test(id))
    return undefined;
  const colors = normalizeSiteColors(palette);
  const mapped = sectionSiteColorId(palette, id);
  const key =
    mapped === "site" || mapped === "default" ? colors.default : mapped;
  return colors.styles.find((style) => style.id === key);
}
/** Exposes semantic colors for a section and its existing theme-aware descendants. */
export function siteColorVariables(
  style: SiteColorStyle,
): Record<string, string> {
  return {
    "--site-background": style.background,
    "--site-title": style.title,
    "--site-paragraph": style.paragraph,
    "--site-solid": style.solid_button,
    "--site-solid-ink": siteContrastInk(style.solid_button),
    "--site-outline": style.outline_button,
    "--bg-page": style.background,
    "--text": style.paragraph,
    "--text-muted": style.paragraph,
    "--text-soft": style.paragraph,
    "--brand": style.solid_button,
    "--ink-on-accent": siteContrastInk(style.solid_button),
    "--on-brand": siteContrastInk(style.solid_button),
  };
}
/** Maps a section reference to inherited CSS variables without requiring a theme hook. */
export function siteColorReference(id: string): Record<string, string> {
  const prefix = /^style-[1-6]$/.test(id) ? `--${id}` : "--site-default";
  return Object.fromEntries(
    Object.entries(
      siteColorVariables({
        id: "style-1",
        background: "",
        title: "",
        paragraph: "",
        solid_button: "",
        outline_button: "",
      }),
    ).map(([key]) => {
      const role =
        key === "--bg-page"
          ? "background"
          : ["--text", "--text-muted", "--text-soft"].includes(key)
            ? "paragraph"
            : key === "--brand"
              ? "solid"
              : ["--ink-on-accent", "--on-brand"].includes(key)
                ? "solid-ink"
                : key.replace("--site-", "");
      return [key, `var(${prefix}-${role})`];
    }),
  );
}

/** Maps legacy section choices to stable styles only after shared styles are enabled. */
export function sectionSiteColorId(palette: unknown, value: unknown): string {
  const id = typeof value === "string" ? value : "default";
  if (!record(palette).color_styles) return id;
  return (
    (
      {
        site: "default",
        light: "style-3",
        dark: "style-5",
        brand: "style-2",
        accent: "style-2",
        surface: "style-4",
        soft: "style-6",
      } as Record<string, string>
    )[id] || id
  );
}
