import type {
  DraftStatePayload,
  DraftSectionPayload,
  DraftAppearanceOverrides,
} from "./types";
import { headerFromLegacy } from "./header";
import { sectionBelongs } from "./section-operations";
import { publicAddressForPage } from "./url-model";
import { DEFAULT_THEME_COPY, restaurantThemeMedia, restaurantThemeSection, type ThemeCopy } from "./restaurant-theme-blueprints";
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

export type ApplyRestaurantThemeOptions = {
  allPages: boolean;
  compose: boolean;
  orderingOnly: boolean;
  title: string;
  description: string;
  image: string;
  cta: string;
  copy?: ThemeCopy;
  createId: () => string;
};

/** Builds the complete candidate once; preview and application must use this same snapshot. */
export function applyRestaurantTheme(
  state: DraftStatePayload,
  theme: RestaurantTheme,
  options: ApplyRestaurantThemeOptions,
): DraftStatePayload {
  const complete = options.compose || options.orderingOnly;
  const allPages = complete || options.allPages;
  const copy = options.copy ?? DEFAULT_THEME_COPY;
  const typography = record(state.config.typography);
  let next: DraftStatePayload = {
    ...state,
    config: {
      ...state.config,
      theme_id: "custom",
      custom_palette: { mode: theme.mode, bg: theme.bg, surface: theme.surface, ink: theme.ink, accent: theme.accent },
      brand_color: null,
      section_colors: null,
      hero_name_font: theme.heading,
      typography: {
        ...typography,
        site: { headingFont: theme.heading, bodyFont: theme.body, buttonShape: theme.shape, template: theme.id },
      },
      navbar_color: theme.id === "joy-bakery" ? theme.accent : theme.bg,
      navbar_text_color: theme.id === "joy-bakery" ? "#ffffff" : theme.ink,
      navbar_style: "solid",
      navbar_logo_position: ["youngs-place", "joy-bakery"].includes(theme.id) ? "center" : "left",
      navbar_font: theme.body,
      navbar_type: { weight: 700, size: 14 },
      navbar_link_style: "text",
    },
    pages: allPages ? state.pages.map(page => ({
      ...page, appearance_overrides: inheritSiteDesign(page.appearance_overrides),
    })) : state.pages,
    sections: allPages && !options.orderingOnly ? state.sections.map(section => ({
      ...section, settings: inheritSectionDesign(section.settings),
    })) : state.sections,
  };
  if (!complete) return next;

  const order = next.pages.find(page => page.type === "order" && page.is_default) ?? next.pages.find(page => page.type === "order");
  next.config = {
    ...next.config,
    hide_navbar_name: false,
    navbar_show_links: true,
    navbar_hamburger: "mobile",
    navbar_overlay_text_color: theme.ink,
    navbar_scrolled_logo_url: "",
    logo_size: 40,
    nav_layout: {
      content: { desktop: "full", mobile: "compact" },
      shopping: { desktop: "full", mobile: "compact" },
      site_mode: options.orderingOnly ? "single_order" : "multi_page",
      theme_pages: record(record(state.config.nav_layout).theme_pages),
    },
    navbar_cta: {
      enabled: Boolean(order), text: options.cta,
      link: order ? (options.orderingOnly ? "/" : order.is_default ? "/order" : `/${order.slug}`) : "",
      shape: theme.shape, size: "md",
      variant: ["mediterranean", "joy-bakery"].includes(theme.id) ? "outline" : "filled",
      solid: {
        variant: ["mediterranean", "joy-bakery"].includes(theme.id) ? "outline" : "filled",
        bg: ["mediterranean", "joy-bakery"].includes(theme.id) ? "transparent" : theme.accent,
        text_color: theme.id === "joy-bakery" ? "#ffffff" : theme.id === "mediterranean" ? theme.ink : theme.mode === "dark" ? theme.bg : "#ffffff",
        border_color: theme.id === "joy-bakery" ? "#ffffff" : theme.id === "mediterranean" ? theme.ink : "transparent",
      },
    },
  };
  if (options.orderingOnly) {
    if (!order) return state;
    next = makeHomepagePage(next, pageKey(order));
    next = applyThemeHeader({...next, config:{...next.config, nav_layout:{...record(next.config.nav_layout),links:[]}}}, theme);
    next = composeThemeFooter(next, order, theme, options, {
      ...options, copy, links: { home: "/", order: "/" },
    });
    return {
      ...next,
      config: { ...next.config, typography: { ...record(next.config.typography), site: {
        ...record(record(next.config.typography).site), template: `ordering-${theme.id}`,
      }}},
      pages: next.pages.map(page => ({
        ...page, nav_visible: pageKey(page) === pageKey(order),
        ...(pageKey(page) === pageKey(order) ? { appearance_overrides: {
          ...completePageAppearance(page.appearance_overrides),
          cover_url: restaurantThemeMedia(theme).hero || options.image,
          hero_cover_layout: "card", layout_default: "compact", layout_default_mobile: "compact",
          category_navigation: { mode: "sidebar", side: "start" },
          navigation_mode: "inherit", navigation_mode_mobile: "inherit", footer_mode: "inherit",
        }} : {}),
      })),
    };
  }

  const previousRoles = record(record(state.config.nav_layout).theme_pages);
  let home = next.pages.find(page => page.is_homepage && (page.type === "landing" || page.type === "content"))
    ?? next.pages.find(page => page.type === "landing")
    ?? next.pages.find(page => page.type === "content" && page.slug === previousRoles.home);
  if (!home) {
    home = { tmp_id: options.createId(), type: "content", title: copy.home, slug: uniqueSlug(next, "home"),
      sort_order: 0, nav_visible: true, is_homepage: false, is_default: false, seo: {}, appearance_overrides: {}, settings: {} };
    next = { ...next, pages: [home, ...next.pages] };
  }
  next = makeHomepagePage(next, pageKey(home));
  next.config = { ...next.config, landing_enabled: true };
  const pageSections: Record<string, string[]> = {
    about: ["hero_banner", "text_and_image", "text"], locations: ["location_hours"],
    contact: ["forms"], menu: ["featured_menu"], catering: ["text_and_image", "forms"], events: ["events"],
  };
  const targets = [{ page: next.pages.find(page => pageKey(page) === pageKey(home!))!, role: "home", types: theme.sections }];
  for (const role of theme.pages) {
    let page = next.pages.find(page => page.type === "content" &&
      page.slug === (previousRoles[role] ?? role));
    if (!page) {
      page = { tmp_id: options.createId(), type: "content", title: copy[role as keyof ThemeCopy] || role,
        slug: uniqueSlug(next, role), sort_order: next.pages.length, nav_visible: true,
        is_homepage: false, is_default: false, seo: {}, appearance_overrides: {}, settings: {} };
      next = { ...next, pages: [...next.pages, page] };
    }
    targets.push({ page, role, types: pageSections[role] ?? [] });
  }
  const links = Object.fromEntries(targets.map(({role, page}) => [role, publicAddressForPage(page)]));
  const currentOrder = next.pages.find(page => pageKey(page) === (order && pageKey(order)));
  if (currentOrder) links.order = publicAddressForPage(currentOrder);
  const context = { ...options, copy, links };
  next = {
    ...next,
    config: { ...next.config, nav_layout: {
      ...record(next.config.nav_layout),
      theme_pages: { ...previousRoles, ...Object.fromEntries(targets.map(t => [t.role, t.page.slug])) },
      links: targets.map(({page, role}) => ({ id: `page-${page.id ?? page.tmp_id}`, page_slug: page.slug, label: copy[role as keyof ThemeCopy] || page.title })),
    }},
    pages: next.pages.map(page => {
      const target = targets.find(t => pageKey(t.page) === pageKey(page));
      return target ? { ...page, title: copy[target.role as keyof ThemeCopy] || page.title,
        nav_visible: true, sort_order: targets.indexOf(target),
        appearance_overrides: { ...completePageAppearance(page.appearance_overrides),
          navigation_mode: "inherit", navigation_mode_mobile: "inherit", footer_mode: "inherit" },
      } : page.type === "order" ? {
        ...page, nav_visible: false,
        appearance_overrides: {
          ...completePageAppearance(page.appearance_overrides),
          cover_url: restaurantThemeMedia(theme).hero || options.image,
          navigation_mode: "inherit", navigation_mode_mobile: "inherit", footer_mode: "inherit",
          website_order: { show_banner: true, show_fulfillment: true, prompt_on_entry: true, modal_cover: true, modal_logo: true },
        },
      } : { ...page, nav_visible: false };
    }),
  };

  next = applyThemeHeader(next, theme);
  next = composeThemeFooter(next, home, theme, options, context);
  for (const { page, role, types } of targets) {
    const existing = next.sections.filter(section => sectionBelongs(section, page));
    const used = new Set<DraftSectionPayload>();
    const occurrences = new Map<string, number>();
    const composed = types.filter(type => type !== "footer").map((type, index) => {
      const slot = `${page.slug}:${index}:${type}`;
      const previous = existing.find(section => section.section_type === type && section.settings.theme_slot === slot && !used.has(section))
        ?? existing.find(section => section.section_type === type && !used.has(section));
      if (previous) used.add(previous);
      const occurrence = occurrences.get(type) ?? 0;
      occurrences.set(type, occurrence + 1);
      const blueprint = restaurantThemeSection(theme, type, occurrence, role, context);
      return {
        ...previous, ...(!previous ? { tmp_id: options.createId() } : {}),
        section_type: type, page: page.slug, page_id: page.id, page_tmp_id: page.tmp_id,
        sort_order: index, is_visible: true, ...blueprint,
        settings: { ...blueprint.settings, theme_slot: slot, theme_retired: false,
          anchor: previous?.settings.anchor || `theme-${role}-${index}` },
      } satisfies DraftSectionPayload;
    });
    const remaining = existing.filter(section => !used.has(section)).map((section, index) => ({
      ...section, sort_order: composed.length + index, is_visible: false,
      settings: { ...section.settings, theme_retired: true },
    }));
    next = { ...next, sections: [
      ...next.sections.filter(section => !sectionBelongs(section, page)), ...composed, ...remaining,
    ] };
  }
  return next;
}

function applyThemeHeader(state: DraftStatePayload, theme: RestaurantTheme): DraftStatePayload {
  const nav = record(state.config.nav_layout);
  const previous = record(record(nav.header).logo);
  const header = headerFromLegacy({...state.config,nav_layout:{...nav,header:undefined}}, state.pages, String(state.config.restaurant_logo_url ?? previous.image ?? ""));
  header.layout = theme.id === "joy-bakery" ? "center" : theme.id === "youngs-place" ? "stacked" : "left";
  header.color_style = theme.id === "joy-bakery" ? "accent" : "default";
  return {...state, config: {...state.config, nav_layout: {...record(state.config.nav_layout), header}}};
}

function composeThemeFooter(
  state: DraftStatePayload,
  home: DraftStatePayload["pages"][number],
  theme: RestaurantTheme,
  options: ApplyRestaurantThemeOptions,
  context: Parameters<typeof restaurantThemeSection>[4],
): DraftStatePayload {
  const footer = state.sections.find(section => section.section_type === "footer" && section.page === "_site")
    ?? state.sections.find(section => section.section_type === "footer" && sectionBelongs(section, home));
  const sharedFooter: DraftSectionPayload = {
    ...footer, ...(!footer ? { tmp_id: options.createId() } : {}),
    section_type: "footer", page: "_site", page_id: undefined, page_tmp_id: undefined,
    sort_order: 9999, is_visible: true,
    ...restaurantThemeSection(theme, "footer", 0, "home", context),
  };
  return { ...state, sections: [...state.sections.filter(section => section !== footer), sharedFooter] };
}

function completePageAppearance(appearance: DraftAppearanceOverrides): DraftAppearanceOverrides {
  const next = inheritSiteDesign(appearance);
  delete next.navbar_cta;
  delete next.hide_navbar_name;
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
