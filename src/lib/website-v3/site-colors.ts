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
export type SiteColorStyle = {
  id: SiteColorId;
  background: string;
  title: string;
  paragraph: string;
  solid_button: string;
  outline_button: string;
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
/** Computes relative luminance contrast for the editor's color choices. */
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
/** Preserves a readable authored foreground; repairs low contrast after background changes. */
export function readableSiteColor(color: string, background: string): string {
  return colorContrast(color, background) >= 3
    ? color
    : siteContrastInk(background);
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
      return {
        id,
        background,
        title: readableSiteColor(siteHex(s.title, ink), background),
        paragraph: readableSiteColor(siteHex(s.paragraph, ink), background),
        solid_button: siteHex(
          s.solid_button,
          colorContrast(main, background) >= 3
            ? main
            : siteContrastInk(background),
        ),
        outline_button: readableSiteColor(
          siteHex(s.outline_button, ink),
          background,
        ),
      };
    }),
  };
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
