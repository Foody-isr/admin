import type {
  DraftStatePayload,
  DraftSectionPayload,
  DraftAppearanceOverrides,
} from "./types";
import { makeHomepagePage } from "./state";
import { pageKey } from "./types";

export type RestaurantTheme = {
  id: string;
  name: string;
  bg: string;
  surface: string;
  ink: string;
  accent: string;
  heading: string;
  body: string;
  mode: "light" | "dark";
  hero: "centered" | "left_aligned" | "split";
  shape: "pill" | "rounded" | "square";
  sections: readonly string[];
  ordering: boolean;
};

/** Restaurant compositions, kept independent of account plans and commerce data. */
export const RESTAURANT_THEMES: readonly RestaurantTheme[] = [
  {
    id: "mediterranean",
    name: "Mediterranean",
    bg: "#f4f1e8",
    surface: "#ffffff",
    ink: "#213a2e",
    accent: "#294c3b",
    heading: "DM Serif Display",
    body: "Manrope",
    mode: "light",
    hero: "centered",
    shape: "pill",
    sections: [
      "hero_banner",
      "menu_highlights",
      "text_and_image",
      "testimonials",
      "about",
      "footer",
    ],
    ordering: true,
  },
  {
    id: "leaf-lemon",
    name: "Leaf & Lemon",
    bg: "#f4efdf",
    surface: "#fffaf0",
    ink: "#24231e",
    accent: "#cf592a",
    heading: "Dela Gothic One",
    body: "Manrope",
    mode: "light",
    hero: "split",
    shape: "pill",
    sections: [
      "hero_banner",
      "text_and_image",
      "menu_highlights",
      "gallery",
      "about",
      "footer",
    ],
    ordering: true,
  },
  {
    id: "youngs-place",
    name: "Young’s Place",
    bg: "#ffffff",
    surface: "#f5f5f5",
    ink: "#101010",
    accent: "#ed7a3b",
    heading: "Dela Gothic One",
    body: "Manrope",
    mode: "light",
    hero: "centered",
    shape: "pill",
    sections: [
      "hero_banner",
      "scrolling_text",
      "text_and_image",
      "menu_highlights",
      "testimonials",
      "footer",
    ],
    ordering: true,
  },
  {
    id: "kale-things",
    name: "Kale & Things",
    bg: "#16200e",
    surface: "#25301d",
    ink: "#ffffff",
    accent: "#ffffff",
    heading: "Bagel Fat One",
    body: "Manrope",
    mode: "dark",
    hero: "split",
    shape: "pill",
    sections: [
      "hero_banner",
      "feature_cards",
      "menu_highlights",
      "text_and_image",
      "footer",
    ],
    ordering: false,
  },
  {
    id: "brass-wolf",
    name: "The Brass Wolf",
    bg: "#e7e7e7",
    surface: "#d2dfeb",
    ink: "#101010",
    accent: "#142863",
    heading: "DM Serif Display",
    body: "Manrope",
    mode: "light",
    hero: "left_aligned",
    shape: "rounded",
    sections: [
      "hero_banner",
      "menu_highlights",
      "text_and_image",
      "gallery",
      "about",
      "footer",
    ],
    ordering: false,
  },
  {
    id: "joy-bakery",
    name: "Joy Bakery",
    bg: "#f0efff",
    surface: "#ffffff",
    ink: "#1815aa",
    accent: "#1710e8",
    heading: "DM Serif Display",
    body: "Manrope",
    mode: "light",
    hero: "centered",
    shape: "square",
    sections: [
      "hero_banner",
      "menu_highlights",
      "text_and_image",
      "gallery",
      "footer",
    ],
    ordering: false,
  },
];

const VISUAL_KEYS: readonly (keyof DraftAppearanceOverrides)[] = [
  "theme_id",
  "pairing_id",
  "brand_color",
  "custom_palette",
  "section_colors",
  "bg",
  "ink",
  "accent",
  "headingFont",
  "bodyFont",
  "hero_name_font",
  "typography",
  "navbar_color",
  "navbar_text_color",
  "navbar_overlay_text_color",
];

/** Removes only visual overrides; routing, visibility and checkout settings survive. */
export function inheritSiteDesign(
  appearance: DraftAppearanceOverrides,
): DraftAppearanceOverrides {
  const next = { ...appearance };
  for (const key of VISUAL_KEYS) delete next[key];
  return next;
}

/** Applies global styling atomically, preserving content, identity and commerce links. */
export function applyRestaurantTheme(
  state: DraftStatePayload,
  theme: RestaurantTheme,
  options: {
    allPages: boolean;
    compose: boolean;
    orderingOnly: boolean;
    title: string;
    description: string;
    image: string;
    cta: string;
    createId: () => string;
  },
): DraftStatePayload {
  const typography = record(state.config.typography);
  const cta = record(state.config.navbar_cta);
  let next: DraftStatePayload = {
    ...state,
    config: {
      ...state.config,
      theme_id: "custom",
      custom_palette: {
        mode: theme.mode,
        bg: theme.bg,
        surface: theme.surface,
        ink: theme.ink,
        accent: theme.accent,
      },
      brand_color: null,
      hero_name_font: theme.heading,
      typography: {
        ...typography,
        site: {
          ...record(typography.site),
          template: theme.id,
          headingFont: theme.heading,
          bodyFont: theme.body,
          buttonShape: theme.shape,
        },
      },
      navbar_color: theme.bg,
      navbar_text_color: theme.ink,
      navbar_cta: {
        ...cta,
        shape: theme.shape,
        bg: theme.accent,
        text_color: theme.mode === "dark" ? theme.bg : "#ffffff",
      },
    },
    pages: options.allPages
      ? state.pages.map((p) => ({
          ...p,
          appearance_overrides: inheritSiteDesign(p.appearance_overrides),
        }))
      : state.pages,
  };
  if (options.allPages)
    next = {
      ...next,
      sections: next.sections.map((section) => ({
        ...section,
        settings: inheritSectionDesign(section.settings),
      })),
    };
  if (options.orderingOnly) {
    const order =
      next.pages.find((p) => p.type === "order" && p.is_default) ??
      next.pages.find((p) => p.type === "order");
    if (order) next = makeHomepagePage(next, pageKey(order));
    return next;
  }
  const home =
    next.pages.find(
      (p) => p.is_homepage && (p.type === "landing" || p.type === "content"),
    ) ?? next.pages.find((p) => p.type === "landing");
  if (!home || !options.compose) return next;
  const belongs = (s: DraftSectionPayload) =>
    s.page_id !== undefined
      ? s.page_id === home.id
      : s.page_tmp_id
        ? s.page_tmp_id === home.tmp_id
        : s.page === home.slug;
  const existing = next.sections.filter(belongs);
  const types = new Set(existing.map((s) => s.section_type));
  if (
    next.sections.some(
      (section) =>
        section.section_type === "footer" && section.page === "_site",
    )
  )
    types.add("footer");
  const order =
    next.pages.find((p) => p.type === "order" && p.is_default) ??
    next.pages.find((p) => p.type === "order");
  const orderLink = order ? "/order" : "";
  const added: DraftSectionPayload[] = theme.sections
    .filter((type) => !types.has(type))
    .map((type, index) => ({
      tmp_id: options.createId(),
      section_type: type,
      page: home.slug,
      page_id: home.id,
      page_tmp_id: home.tmp_id,
      sort_order: existing.length + index,
      is_visible: true,
      layout:
        type === "hero_banner"
          ? theme.hero
          : type === "footer"
            ? "columns"
            : "default",
      content:
        type === "hero_banner"
          ? {
              headline: options.title,
              subheadline: options.description,
              image_url: options.image,
              cta_text: options.cta,
              cta_link: orderLink,
            }
          : type === "text_and_image"
            ? {
                title: options.title,
                body: options.description,
                image_url: options.image,
                image_position: "right",
              }
            : type === "scrolling_text"
              ? { text: options.title }
              : type === "menu_highlights"
                ? { title: options.cta, item_ids: [] }
                : type === "about"
                  ? {
                      blocks: [
                        { title: options.title, body: options.description },
                      ],
                    }
                  : type === "gallery"
                    ? { images: [] }
                    : type === "testimonials"
                      ? { reviews: [] }
                      : type === "footer"
                        ? {
                            show_logo: true,
                            show_address: true,
                            show_hours: true,
                            show_phone: true,
                          }
                        : { cards: [] },
      settings: {
        color_style: "custom",
        custom_bg: theme.bg,
        custom_text: theme.ink,
        headline_font: theme.heading,
        title_font: theme.heading,
        body_font: theme.body,
        subheadline_font: theme.body,
        cta_bg_color: theme.accent,
        cta_color: theme.mode === "dark" ? theme.bg : "#ffffff",
        height: "tall",
        bg_overlay: theme.hero !== "split",
      },
    }));
  const composed = [...next.sections.filter(belongs), ...added]
    .map((section) => ({
      ...section,
      layout:
        section.section_type === "hero_banner" ? theme.hero : section.layout,
      settings: {
        ...inheritSectionDesign(section.settings),
        theme_layout: theme.id,
        ...(section.section_type === "hero_banner"
          ? {
              height: "tall",
              heading_size: "xl",
              text_alignment: theme.hero === "split" ? "left" : "center",
              bg_overlay: theme.hero !== "split",
              ...(theme.hero !== "split" &&
              (section.content.image_url ||
                section.content.video_url ||
                section.settings.bg_image)
                ? { headline_color: "#ffffff", subheadline_color: "#ffffff" }
                : {}),
            }
          : {}),
      },
    }))
    .sort((a, b) => {
      const rank = (section: DraftSectionPayload) => {
        const index = theme.sections.indexOf(section.section_type);
        return index < 0 ? theme.sections.length - 1 : index;
      };
      return rank(a) - rank(b) || a.sort_order - b.sort_order;
    })
    .map((section, index) => ({ ...section, sort_order: index }));
  next = {
    ...next,
    sections: [
      ...next.sections.filter((section) => !belongs(section)),
      ...composed,
    ],
  };
  return next;
}

/** Narrow an optional saved JSON object without changing its keys. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Resets visual section overrides without changing copy, media, links or visibility. */
export function inheritSectionDesign(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...settings };
  for (const key of Object.keys(next)) {
    if (
      /_(font|color|weight)$/.test(key) ||
      ["custom_bg", "custom_text", "color_style", "theme_layout"].includes(key)
    )
      delete next[key];
  }
  next.color_style = "site";
  return next;
}
