import type { DraftStatePayload } from "./types";
import { record, type RestaurantTheme } from "./restaurant-themes";

/** A visual preset has no pages, sections, navigation or layout instructions. */
export type SiteStyle = Pick<
  RestaurantTheme,
  | "id"
  | "name"
  | "bg"
  | "surface"
  | "ink"
  | "accent"
  | "heading"
  | "body"
  | "mode"
  | "shape"
>;

/** Site-style remixes are shared by all restaurant compositions. */
export const SITE_STYLES: readonly SiteStyle[] = [
  {
    id: "classic",
    name: "Classic",
    bg: "#ffffff",
    surface: "#f0f0f0",
    ink: "#000000",
    accent: "#000000",
    heading: "Inter",
    body: "Inter",
    mode: "light",
    shape: "pill",
  },
  {
    id: "ochre",
    name: "Ochre",
    bg: "#f3f2ef",
    surface: "#ffffff",
    ink: "#171717",
    accent: "#956600",
    heading: "Dela Gothic One",
    body: "Inter",
    mode: "light",
    shape: "rounded",
  },
  {
    id: "electric",
    name: "Electric",
    bg: "#ffffff",
    surface: "#efefff",
    ink: "#000000",
    accent: "#0000ff",
    heading: "Inter",
    body: "Inter",
    mode: "light",
    shape: "pill",
  },
  {
    id: "botanical",
    name: "Botanical",
    bg: "#f3f2ef",
    surface: "#ffffff",
    ink: "#1c3529",
    accent: "#264a3c",
    heading: "Recoleta",
    body: "Larsseit",
    mode: "light",
    shape: "pill",
  },
  {
    id: "editorial",
    name: "Editorial",
    bg: "#ffffff",
    surface: "#f0f0f0",
    ink: "#171717",
    accent: "#eeeeee",
    heading: "Cormorant Garamond",
    body: "Inter",
    mode: "light",
    shape: "square",
  },
  {
    id: "handwritten",
    name: "Handwritten",
    bg: "#f8f3e7",
    surface: "#ffffff",
    ink: "#062331",
    accent: "#062331",
    heading: "Caveat",
    body: "Inter",
    mode: "light",
    shape: "pill",
  },
  {
    id: "warm",
    name: "Warm",
    bg: "#696158",
    surface: "#7d746b",
    ink: "#ffffdd",
    accent: "#ffffdd",
    heading: "Inter",
    body: "Inter",
    mode: "dark",
    shape: "pill",
  },
];

/** Extracts only the original visual style from a theme; its composition stays independent. */
export function defaultThemeStyle(theme: RestaurantTheme): SiteStyle {
  const { id, name, bg, surface, ink, accent, heading, body, mode, shape } =
    theme;
  return {
    id: `original-${id}`,
    name,
    bg,
    surface,
    ink,
    accent,
    heading,
    body,
    mode,
    shape,
  };
}

/** Applies a remix while preserving every page, section, content value and navigation destination. */
export function applySiteStyle(
  state: DraftStatePayload,
  style: SiteStyle,
): DraftStatePayload {
  const palette = record(state.config.custom_palette);
  const remap = (value: unknown): unknown => {
    for (const token of ["bg", "surface", "ink", "accent"] as const) {
      if (
        typeof value === "string" &&
        value.toLowerCase() === String(palette[token] ?? "").toLowerCase()
      )
        return style[token];
    }
    return value;
  };
  const recolor = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /color$|^(bg|ink|accent|surface|custom_bg|custom_text|inset_bg|inset_ink)$/.test(
          key,
        )
          ? remap(item)
          : item,
      ]),
    );
  const rgb = style.accent.replace("#", "");
  const luminance = [0, 2, 4].reduce(
    (sum, offset, index) =>
      sum +
      parseInt(rgb.slice(offset, offset + 2), 16) *
        [0.299, 0.587, 0.114][index],
    0,
  );
  const buttonText = luminance > 160 ? "#111111" : "#ffffff";
  const restyleButton = (button: Record<string, unknown>) => ({
    ...recolor(button),
    bg:
      button.variant === "outline" || button.bg === "transparent"
        ? "transparent"
        : style.accent,
    ...(button.variant === "outline" ? { border_color: style.ink } : {}),
    text_color:
      button.variant === "outline" || button.bg === "transparent"
        ? style.ink
        : buttonText,
  });
  const typography = record(state.config.typography);
  const cta = record(state.config.navbar_cta);
  const restyleAppearance = (appearance: Record<string, unknown>) => {
    const next = recolor(appearance);
    for (const key of [
      "theme_id",
      "pairing_id",
      "custom_palette",
      "brand_color",
      "headingFont",
      "bodyFont",
      "hero_name_font",
    ])
      delete next[key];
    if (next.typography) {
      const type = record(next.typography);
      const {
        headingFont: _heading,
        bodyFont: _body,
        buttonShape: _shape,
        ...site
      } = record(type.site);
      next.typography = { ...type, site };
    }
    return next;
  };
  return {
    ...state,
    config: {
      ...state.config,
      theme_id: "custom",
      brand_color: null,
      custom_palette: {
        mode: style.mode,
        bg: style.bg,
        surface: style.surface,
        ink: style.ink,
        accent: style.accent,
      },
      hero_name_font: style.heading,
      navbar_font: style.body,
      navbar_color: String(remap(state.config.navbar_color) ?? style.bg),
      navbar_text_color: String(
        remap(state.config.navbar_text_color) ?? style.ink,
      ),
      navbar_overlay_text_color: String(
        remap(state.config.navbar_overlay_text_color) ?? style.ink,
      ),
      typography: {
        ...typography,
        site: {
          ...record(typography.site),
          headingFont: style.heading,
          bodyFont: style.body,
          buttonShape: style.shape,
          style: style.id,
        },
      },
      navbar_cta: {
        ...cta,
        shape: style.shape,
        solid: restyleButton(record(cta.solid)),
        ...(cta.transparent
          ? { transparent: restyleButton(record(cta.transparent)) }
          : {}),
      },
    },
    pages: state.pages.map((page) => ({
      ...page,
      appearance_overrides: restyleAppearance(page.appearance_overrides),
    })),
    sections: state.sections.map((section) => {
      const settings = recolor(section.settings);
      for (const key of Object.keys(settings))
        if (/_font$/.test(key)) delete settings[key];
      return { ...section, settings };
    }),
  };
}
