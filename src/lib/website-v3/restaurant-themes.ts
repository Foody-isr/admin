import type {
  DraftStatePayload,
  DraftSectionPayload,
  DraftAppearanceOverrides,
} from "./types";
import {
  squareDefaultContent,
  squareDefaultSettings,
} from "./square-components";
import { sectionBelongs } from "./section-operations";
import { addNavigationPage } from "./navigation-links";
import { makeHomepagePage } from "./state";
import { pageKey } from "./types";
import { isReservedPublicWebsiteSlug } from "./public-route-segments";

export type RestaurantTheme = {
  id: string;
  name: string;
  thumbnail: string;
  bg: string;
  surface: string;
  ink: string;
  accent: string;
  heading: string;
  body: string;
  mode: "light" | "dark";
  hero: "centered" | "left_aligned" | "split" | "inset";
  shape: "pill" | "rounded" | "square";
  sections: readonly string[];
  ordering: boolean;
  pages: readonly string[];
};

/** Restaurant compositions, kept independent of account plans and commerce data. */
export const RESTAURANT_THEMES: readonly RestaurantTheme[] = [
  {
    id: "mediterranean",
    name: "Mediterranean",
    thumbnail: "Olympio",
    bg: "#f3f2ef",
    surface: "#ffffff",
    ink: "#1c3529",
    accent: "#1c3529",
    heading: "Recoleta",
    body: "Larsseit",
    mode: "light",
    hero: "inset",
    shape: "pill",
    ordering: true,
    sections: [
      "hero_banner",
      "scrolling_text",
      "featured_menu",
      "text",
      "testimonials",
      "location_hours",
      "footer",
    ],
    pages: ["catering", "about"],
  },
  {
    id: "leaf-lemon",
    name: "Leaf & Lemon",
    thumbnail: "LeafLemon",
    bg: "#efe8d4",
    surface: "#ffffff",
    ink: "#382922",
    accent: "#9b3d22",
    heading: "Chivo",
    body: "Chivo",
    mode: "light",
    hero: "centered",
    shape: "pill",
    ordering: true,
    sections: [
      "hero_banner",
      "featured_categories",
      "text_and_image",
      "text_and_image",
      "footer",
    ],
    pages: ["about", "locations", "contact", "menu"],
  },
  {
    id: "youngs-place",
    name: "Young’s Place",
    thumbnail: "YoungsPlace",
    bg: "#ffffff",
    surface: "#f5f5f5",
    ink: "#000000",
    accent: "#e77a40",
    heading: "Dela Gothic One",
    body: "Inter",
    mode: "light",
    hero: "centered",
    shape: "pill",
    ordering: true,
    sections: [
      "hero_banner",
      "scrolling_text",
      "text_and_image",
      "scrolling_text",
      "text_and_image",
      "scrolling_text",
      "text_and_image",
      "location_hours",
      "footer",
    ],
    pages: ["about", "locations", "menu"],
  },
  {
    id: "kale-things",
    name: "Citrus and Green",
    thumbnail: "KaleThings",
    bg: "#141c0e",
    surface: "#25301d",
    ink: "#ffffff",
    accent: "#ffffff",
    heading: "DynaPuff",
    body: "Inter",
    mode: "dark",
    hero: "split",
    shape: "pill",
    ordering: false,
    sections: [
      "hero_banner",
      "featured_categories",
      "featured_menu",
      "text_and_image",
      "location_hours",
      "footer",
    ],
    pages: ["catering", "about"],
  },
  {
    id: "brass-wolf",
    name: "The Brass Wolf",
    thumbnail: "BrassWolf",
    bg: "#a4cee5",
    surface: "#ffffff",
    ink: "#071b5e",
    accent: "#071b5e",
    heading: "Rubik",
    body: "Karla",
    mode: "light",
    hero: "centered",
    shape: "rounded",
    ordering: false,
    sections: [
      "hero_banner",
      "menu_highlights",
      "scrolling_text",
      "text_and_image",
      "location_hours",
      "footer",
    ],
    pages: ["menu", "about", "events", "locations"],
  },
  {
    id: "joy-bakery",
    name: "Joy Bakery",
    thumbnail: "JoyBakeshop",
    bg: "#efeff5",
    surface: "#ffffff",
    ink: "#0000ff",
    accent: "#0000ff",
    heading: "IBM Plex Serif",
    body: "Sen",
    mode: "light",
    hero: "centered",
    shape: "square",
    ordering: false,
    sections: [
      "hero_banner",
      "menu_highlights",
      "testimonials",
      "location_hours",
      "text_and_image",
      "footer",
    ],
    pages: ["locations", "about"],
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
  "navbar_logo_position",
  "navbar_style",
  "navigation_mode",
  "navigation_mode_mobile",
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
      navbar_style: "solid",
      navbar_logo_position: theme.id === "youngs-place" ? "center" : "left",
      navbar_font: theme.body,
      navbar_type: { weight: 700, size: 14 },
      navbar_link_style: "text",
      nav_layout: {
        ...record(state.config.nav_layout),
        content: { desktop: "full", mobile: "compact" },
      },
      navbar_cta: {
        ...cta,
        shape: theme.shape,
        variant: theme.id === "mediterranean" ? "outline" : "filled",
        bg: theme.accent,
        text_color: theme.mode === "dark" ? theme.bg : "#ffffff",
        solid: {
          variant: theme.id === "mediterranean" ? "outline" : "filled",
          bg: theme.id === "mediterranean" ? "transparent" : theme.accent,
          text_color:
            theme.id === "mediterranean"
              ? theme.ink
              : theme.mode === "dark"
                ? theme.bg
                : "#ffffff",
          border_color:
            theme.id === "mediterranean" ? theme.ink : "transparent",
        },
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
  const navLayout = record(next.config.nav_layout);
  const order =
    next.pages.find((page) => page.type === "order" && page.is_default) ??
    next.pages.find((page) => page.type === "order");
  if (options.orderingOnly) {
    if (!order) return next;
    next = makeHomepagePage(next, pageKey(order));
    return {
      ...next,
      config: {
        ...next.config,
        nav_layout: { ...navLayout, site_mode: "single_order" },
        typography: {
          ...record(next.config.typography),
          site: {
            ...record(record(next.config.typography).site),
            template: `ordering-${theme.id}`,
          },
        },
      },
      pages: next.pages.map((page) =>
        pageKey(page) === pageKey(order)
          ? {
              ...page,
              appearance_overrides: {
                ...inheritSiteDesign(page.appearance_overrides),
                cover_url: options.image,
                hero_cover_layout: "card",
                layout_default: "compact",
                layout_default_mobile: "compact",
                category_navigation: { mode: "sidebar", side: "start" },
              },
            }
          : page,
      ),
    };
  }
  if (!options.compose) return next;
  let home =
    next.pages.find(
      (page) =>
        page.is_homepage &&
        (page.type === "landing" || page.type === "content"),
    ) ?? next.pages.find((page) => page.type === "landing");
  if (!home) {
    const slug = uniqueSlug(next, "home");
    home = {
      tmp_id: options.createId(),
      type: "content",
      title: options.title,
      slug,
      sort_order: 0,
      nav_visible: true,
      is_homepage: false,
      is_default: false,
      seo: {},
      appearance_overrides: {},
      settings: {},
    };
    next = { ...next, pages: [home, ...next.pages] };
  }
  next = makeHomepagePage(next, pageKey(home));
  next = {
    ...next,
    config: {
      ...next.config,
      nav_layout: { ...navLayout, site_mode: "multi_page" },
    },
  };
  const pageSections: Record<string, string[]> = {
    about: ["hero_banner", "text_and_image", "text"],
    locations: ["location_hours"],
    contact: ["forms"],
    menu: ["featured_menu"],
    catering: ["text_and_image", "forms"],
    events: ["events"],
  };
  // Footer belongs to the whole site, including pages created by this theme.
  const footer =
    next.sections.find(
      (section) =>
        section.section_type === "footer" && section.page === "_site",
    ) ??
    next.sections.find(
      (section) =>
        section.section_type === "footer" && sectionBelongs(section, home!),
    );
  const sharedFooter: DraftSectionPayload = {
    ...footer,
    ...(!footer ? { tmp_id: options.createId() } : {}),
    section_type: "footer",
    page: "_site",
    page_id: undefined,
    page_tmp_id: undefined,
    sort_order: 9999,
    is_visible: footer?.is_visible ?? true,
    layout: footer?.layout ?? "columns",
    content: footer?.content ?? squareDefaultContent("footer"),
    settings: {
      ...squareDefaultSettings(),
      ...inheritSectionDesign(footer?.settings ?? {}),
    },
  };
  next = {
    ...next,
    sections: [
      ...next.sections.filter((section) => section !== footer),
      sharedFooter,
    ],
  };
  const themePages = { ...record(navLayout.theme_pages) };
  const targets = [{ page: home, types: theme.sections }];
  for (const slug of theme.pages) {
    let page = next.pages.find(
      (page) =>
        page.slug === (themePages[slug] ?? slug) && page.type === "content",
    );
    if (!page) {
      page = {
        tmp_id: options.createId(),
        type: "content",
        title: slug.charAt(0).toUpperCase() + slug.slice(1),
        slug: uniqueSlug(next, slug),
        sort_order: next.pages.length,
        nav_visible: true,
        is_homepage: false,
        is_default: false,
        seo: {},
        appearance_overrides: {},
        settings: {},
      };
      next = { ...next, pages: [...next.pages, page] };
    }
    next = addNavigationPage(next, page);
    themePages[slug] = page.slug;
    targets.push({ page, types: pageSections[slug] ?? [] });
  }
  next = {
    ...next,
    config: {
      ...next.config,
      nav_layout: {
        ...record(next.config.nav_layout),
        theme_pages: { ...themePages },
      },
    },
  };
  for (const { page, types } of targets) {
    const existing = next.sections.filter((section) =>
      sectionBelongs(section, page),
    );
    const used = new Set<DraftSectionPayload>();
    const composed = types
      .filter(
        (type) =>
          type !== "footer" ||
          !next.sections.some(
            (section) =>
              section.section_type === "footer" && section.page === "_site",
          ),
      )
      .map((type, index) => {
        const slot = `${page.slug}:${index}:${type}`;
        const previous =
          existing.find((section) => section.settings.theme_slot === slot) ??
          existing.find(
            (section) => section.section_type === type && !used.has(section),
          ) ??
          (["featured_menu", "menu_highlights"].includes(type)
            ? existing.find(
                (section) =>
                  ["featured_menu", "menu_highlights"].includes(
                    section.section_type,
                  ) && !used.has(section),
              )
            : undefined);
        if (previous) used.add(previous);
        const content = previous?.content ?? {
          ...squareDefaultContent(type),
          ...(type === "hero_banner"
            ? {
                headline: options.title,
                subheadline: options.description,
                image_url: options.image,
                cta_text: options.cta,
                cta_link: order ? "/order" : "",
              }
            : {}),
          ...(type === "text_and_image"
            ? {
                title: options.title,
                body: options.description,
                image_url: options.image,
              }
            : {}),
          ...(type === "scrolling_text" ? { text: options.title } : {}),
          ...(type === "text"
            ? { title: options.title, body: options.description }
            : {}),
        };
        return {
          ...previous,
          ...(!previous ? { tmp_id: options.createId() } : {}),
          section_type: type,
          page: page.slug,
          page_id: page.id,
          page_tmp_id: page.tmp_id,
          sort_order: index,
          is_visible: previous?.settings.theme_retired
            ? true
            : (previous?.is_visible ?? true),
          layout:
            type === "hero_banner"
              ? theme.hero
              : (previous?.layout ??
                (type === "footer"
                  ? "columns"
                  : type === "location_hours"
                    ? "map_right"
                    : type === "text"
                      ? "split"
                      : "default")),
          content,
          settings: {
            ...squareDefaultSettings(),
            ...inheritSectionDesign(previous?.settings ?? {}),
            theme_slot: slot,
            theme_layout: theme.id,
            theme_retired: false,
            anchor:
              previous?.settings.anchor ??
              `section-${previous?.id ?? options.createId()}`,
            ...(type === "hero_banner"
              ? {
                  height: "tall",
                  bg_overlay: false,
                  text_alignment: "center",
                  inset_bg: theme.bg,
                  inset_ink: theme.ink,
                }
              : {}),
            ...(theme.id === "joy-bakery" &&
            ["testimonials", "location_hours"].includes(type)
              ? {
                  color_style: "custom",
                  custom_bg: theme.accent,
                  custom_text: theme.bg,
                }
              : {}),
            ...(theme.id === "youngs-place" && type === "text_and_image"
              ? { image_only: true }
              : {}),
          },
        } satisfies DraftSectionPayload;
      });
    const remaining = existing
      .filter((section) => !used.has(section))
      .map((section, index) => ({
        ...section,
        sort_order: composed.length + index,
        // Preserve old content for undo/reuse, while the selected composition owns the visible layout.
        is_visible: false,
        settings: { ...section.settings, theme_retired: true },
      }));
    next = {
      ...next,
      sections: [
        ...next.sections.filter((section) => !sectionBelongs(section, page)),
        ...composed,
        ...remaining,
      ],
    };
  }
  return next;
}

function uniqueSlug(state: DraftStatePayload, base: string): string {
  let slug = base,
    index = 2;
  while (
    isReservedPublicWebsiteSlug(slug) ||
    state.pages.some((page) => page.slug === slug)
  )
    slug = `${base}-${index++}`;
  return slug;
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
