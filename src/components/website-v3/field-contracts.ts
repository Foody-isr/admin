import type {
  PreviewDevice,
  WebsitePageType,
} from "@/lib/website-v3/types";

type Assertion = "text" | "attribute" | "css" | "visible" | "count";
type TestValue = string | number | boolean | number[];
type InspectorTab = "Contenu" | "Apparence" | "Réglages";

type RendererExpectation = {
  selector: string;
  assertion: Assertion;
  expected: string;
  name: string;
};

type FieldEditorContract = {
  kind: "field" | "action";
  scope: "site" | "page" | "section";
  tab: InspectorTab;
  pageTitle: string;
  sectionLabel?: string;
  publicSlug: string;
  commit: "change" | "blur";
  prerequisite?: { id: string; value: TestValue };
};

export type FieldContract = {
  id: string;
  scope: "site" | "page" | "section";
  statePath: readonly (string | number)[];
  pageTypes: readonly WebsitePageType[] | "all";
  devices: readonly PreviewDevice[];
  testValue: TestValue;
  editor: FieldEditorContract;
  preview: RendererExpectation;
  public: RendererExpectation;
};

const BOTH = ["desktop", "mobile"] as const;
const ALL_PAGES = "all" as const;

function site(
  id: string,
  path: readonly (string | number)[],
  _selector: string,
  _assertion: string = "style",
): FieldContract {
  return contract({
    id,
    scope: "site",
    statePath: ["config", ...path],
    pageTypes: ALL_PAGES,
  });
}

function page(
  id: string,
  path: readonly (string | number)[],
  _selector: string,
  _assertion: string,
  pageTypes: readonly WebsitePageType[] | "all" = ALL_PAGES,
): FieldContract {
  return contract({
    id,
    scope: "page",
    statePath: path,
    pageTypes,
  });
}

function pageMetadata(
  id: string,
  path: readonly (string | number)[],
  expectation: Omit<RendererExpectation, "expected">,
): FieldContract {
  const testValue = FIELD_TEST_VALUES[id] ?? true;
  const expected = expectedFor(id, testValue);
  return {
    id,
    scope: "page",
    statePath: path,
    pageTypes: ALL_PAGES,
    devices: BOTH,
    testValue,
    editor: editorFor(id, "page", false),
    preview: { ...expectation, expected },
    public: { ...expectation, expected },
  };
}

function section(
  id: string,
  path: readonly (string | number)[],
  _selector: string,
  _assertion: string,
): FieldContract {
  return contract({
    id,
    scope: "section",
    statePath: path,
    pageTypes: ["landing", "content"],
  });
}

function footer(
  id: string,
  path: readonly (string | number)[],
): FieldContract {
  return contract({
    id,
    scope: "site",
    statePath: path,
    pageTypes: ALL_PAGES,
  });
}

function sectionVisibility(): FieldContract {
  const base = contract({
    id: "section.is_visible",
    scope: "section",
    statePath: ["is_visible"],
    pageTypes: ["landing", "content"],
  });
  return {
    ...base,
    testValue: false,
    preview: {
      selector: '[data-section-type="text_and_image"]',
      assertion: "visible",
      expected: "false",
      name: "hidden",
    },
    public: {
      selector: '[data-section-type="text_and_image"]',
      assertion: "visible",
      expected: "false",
      name: "hidden",
    },
  };
}

function action(
  id: string,
  scope: "page" | "section",
  path: readonly (string | number)[],
): FieldContract {
  return contract({
    id,
    scope,
    statePath: path,
    pageTypes: ALL_PAGES,
  }, true);
}

function siteAction(
  id: string,
  path: readonly (string | number)[],
): FieldContract {
  return contract(
    {
      id,
      scope: "site",
      statePath: ["config", ...path],
      pageTypes: ALL_PAGES,
    },
    true,
  );
}

function liveSiteAction(id: string, path: readonly (string | number)[]): FieldContract {
  return contract(
    {
      id,
      scope: "site",
      statePath: ["live", ...path],
      pageTypes: ALL_PAGES,
    },
    true,
  );
}

function contract(
  base: Pick<FieldContract, "id" | "scope" | "statePath" | "pageTypes">,
  isAction = false,
): FieldContract {
  const actionContract =
    isAction ||
    ["page.sort_order", "section.sort_order", "section.page_id"].includes(base.id);
  const testValue = FIELD_TEST_VALUES[base.id] ?? true;
  const attribute = rendererAttribute(base.id);
  const expectation: RendererExpectation = actionContract
    ? {
        selector: "body",
        assertion: "count",
        expected: "1",
        name: "data-action",
      }
    : {
        selector: `[${attribute}]`,
        assertion: "attribute",
        expected: expectedFor(base.id, testValue),
        name: attribute,
      };
  return {
    ...base,
    devices: BOTH,
    testValue,
    editor: editorFor(base.id, base.scope, actionContract),
    preview: expectation,
    public: expectation,
  };
}

const FIELD_TEST_VALUES: Record<string, TestValue> = {
  "site.theme_id": "editorial-dark",
  "site.pairing_id": "modern-sans",
  "site.brand_color": "#1a2b3c",
  "site.tagline": "Website V3 connected tagline",
  "site.hero_name_font": "Georgia",
  "site.typography": `{"bodyFont":"Inter","headingFont":"Georgia"}`,
  "page.appearance_overrides.typography.roles.categoryTitle.color": "#7c2d12",
  "page.appearance_overrides.typography.roles.itemName.color": "#1e293b",
  "page.appearance_overrides.typography.roles.itemPrice.color": "#b45309",
  "page.appearance_overrides.typography.roles.itemDescription.color": "#64748b",
  "page.appearance_overrides.checkout_text_colors.heading": "#0f172a",
  "page.appearance_overrides.checkout_text_colors.primary": "#1e293b",
  "page.appearance_overrides.checkout_text_colors.secondary": "#64748b",
  "page.appearance_overrides.checkout_text_colors.input": "#111827",
  "page.appearance_overrides.checkout_text_colors.price": "#92400e",
  "page.appearance_overrides.checkout_text_colors.button": "#ffffff",
  "site.nav_layout": `{"logo":"left","links":"center","cta":"right"}`,
  "site.bottom-navigation.background": "#f1f5f9",
  "site.bottom-navigation.button-background": "#ffffff",
  "site.bottom-navigation.text": "#475569",
  "site.bottom-navigation.active-text": "#315fce",
  "site.compact-navigation.icon": "#111827",
  "site.compact-navigation.button-background": "#ffffff",
  "site.navbar_style": "overlay",
  "site.navbar_color": "#223344",
  "site.navbar_overlay_text_color": "#f8fafc",
  "site.navbar_text_color": "#111827",
  "site.logo_size": 58,
  "site.hide_navbar_name": true,
  "site.navbar_logo_position": "center",
  "site.navbar_scrolled_logo_url": "http://localhost:3000/logo-icon.svg",
  "site.hero_logo_size": 132,
  "site.hide_hero_logo": true,
  "site.navbar_show_links": false,
  "site.navbar_hamburger": "compact",
  "site.navbar_cta.enabled": true,
  "site.navbar_cta.text": "Réserver E2E",
  "site.navbar_cta.link": "/order",
  "site.navbar_cta.shape": "pill",
  "site.navbar_cta.size": "lg",
  "site.navbar_cta.transparent.variant": "outline",
  "site.navbar_cta.transparent.bg": "#102030",
  "site.navbar_cta.transparent.text_color": "#f8fafc",
  "site.navbar_cta.transparent.border_color": "#cbd5e1",
  "site.navbar_cta.solid.variant": "filled",
  "site.navbar_cta.solid.bg": "#315fce",
  "site.navbar_cta.solid.text_color": "#ffffff",
  "site.navbar_cta.solid.border_color": "#315fce",
  "site.footer.content.custom_text": "© Website V3 connected",
  "site.footer.content.show_logo": false,
  "site.footer.content.show_description": false,
  "site.footer.content.show_address": false,
  "site.footer.content.show_phone": false,
  "site.footer.content.show_hours": false,
  "site.footer.content.social_links.instagram": "https://instagram.com/foody-v3-e2e",
  "site.footer.content.social_links.facebook": "https://facebook.com/foody-v3-e2e",
  "site.footer.content.social_links.tiktok": "https://tiktok.com/@foody-v3-e2e",
  "site.footer.content.social_links.whatsapp": "https://wa.me/972500000000",
  "site.footer.layout": "centered",
  "site.footer.settings.color_style": "custom",
  "site.footer.settings.custom_bg": "#111827",
  "site.footer.settings.custom_text": "#f8fafc",
  "site.footer.settings.custom_muted": "#94a3b8",
  "site.footer.settings.custom_accent": "#d6ff3f",
  "site.footer.settings.custom_divider": "#334155",
  "site.favicon_url": "http://localhost:3000/logo-icon.svg",
  "site.checkout_config": `{"note":"connected checkout"}`,
  "site.order_page_info": `{"modal":["about"],"modal_text":"Connected order info"}`,
  "site.show_orders_link": false,
  "site.stories_enabled": true,
  "site.layout_default": "compact",
  "site.layout_default_mobile": "magazine",
  "site.category_banner_style": "text-block",
  "site.category_banner_overlay": 61,
  "site.category_banner_fit": "contain",
  "site.category_banner_fit_mobile": "natural",
  "page.title": "About connected E2E",
  "page.slug": "about-connected-e2e",
  "page.type": "content",
  "page.sort_order": 1,
  "page.nav_visible": false,
  "page.is_default": true,
  "page.appearance_overrides.hide_navbar_name": true,
  "page.seo.title": "Website V3 SEO title",
  "page.seo.description": "Website V3 SEO description",
  "page.seo.share_image_url": "http://localhost:3000/logo-icon.svg",
  "page.appearance_overrides.bg": "#f1e2d3",
  "page.appearance_overrides.ink": "#102030",
  "page.appearance_overrides.accent": "#b42318",
  "page.appearance_overrides.headingFont": "Georgia",
  "page.appearance_overrides.bodyFont": "Inter",
  "page.appearance_overrides.navbar_style": "overlay",
  "page.appearance_overrides.navbar_color": "#FAF1D2",
  "page.appearance_overrides.navbar_text_color": "#253265",
  "page.appearance_overrides.navbar_overlay_text_color": "#F8FAFC",
  "page.appearance_overrides.order_type_selector.shape": "pill",
  "page.appearance_overrides.order_type_selector.variant": "outline",
  "page.appearance_overrides.order_type_selector.size": "lg",
  "page.appearance_overrides.order_type_selector.bg": "#ffffff",
  "page.appearance_overrides.order_type_selector.text_color": "#315fce",
  "page.appearance_overrides.order_type_selector.border_color": "#315fce",
  "page.appearance_overrides.navbar_cta.transparent.variant": "ghost",
  "page.appearance_overrides.navbar_cta.transparent.bg": "#102030",
  "page.appearance_overrides.navbar_cta.transparent.text_color": "#ffffff",
  "page.appearance_overrides.navbar_cta.transparent.border_color": "#ffffff",
  "page.appearance_overrides.navbar_cta.solid.variant": "outline",
  "page.appearance_overrides.navbar_cta.solid.bg": "#f8fafc",
  "page.appearance_overrides.navbar_cta.solid.text_color": "#111827",
  "page.appearance_overrides.navbar_cta.solid.border_color": "#111827",
  "page.appearance_overrides.section_colors.categoryBar.bg": "#ffffff",
  "page.appearance_overrides.section_colors.categoryBar.text": "#111827",
  "page.appearance_overrides.section_colors.categoryBar.accent": "#315fce",
  "page.appearance_overrides.section_colors.categoryBar.divider": "#e5e7eb",
  "page.appearance_overrides.section_colors.categoryBarSticky.bg": "#111827",
  "page.appearance_overrides.section_colors.categoryBarSticky.text": "#ffffff",
  "page.appearance_overrides.section_colors.categoryBarSticky.accent": "#d6ff3f",
  "page.appearance_overrides.section_colors.categoryBarSticky.divider": "#334155",
  "page.settings.menu_ids": [0],
  "page.settings.service_ids": [0],
  "section.is_visible": true,
  "section.sort_order": 0,
  "section.layout": "image_left",
  "section.page_id": 0,
  "section.content.headline": "Connected hero headline",
  "section.content.subheadline": "Connected hero subheadline",
  "section.content.title": "Connected section title",
  "section.content.body": "Connected section body",
  "section.content.text": "Connected scrolling text",
  "section.content.cta_text": "Connected CTA",
  "section.content.cta_link": "/about",
  "section.content.image_url": "http://localhost:3000/logo-icon.svg",
  "section.content.video_url": "https://cdn.example.com/hero-cover.mp4",
  "section.content.custom_text": "© Website V3 connected",
  "section.content.show_address": false,
  "section.content.show_phone": false,
  "section.content.show_hours": false,
  "section.content.social_links": "https://instagram.com/foody-v3-e2e",
  "section.settings.color_style": "custom",
  "section.settings.custom_bg": "#213547",
  "section.settings.custom_text": "#f7f8fa",
  "section.settings.card_bg": "#f8fafc",
  "section.settings.card_text": "#111827",
  "section.settings.card_muted": "#64748b",
  "section.settings.price_color": "#b42318",
  "section.settings.accent_color": "#315fce",
  "section.settings.bg_image": "http://localhost:3000/logo-icon.svg",
  "section.settings.bg_overlay": true,
};

function editorFor(
  id: string,
  scope: FieldContract["scope"],
  isAction: boolean,
): FieldEditorContract {
  const action = isAction ? "action" : "field";
  if (id.startsWith("site.footer.")) {
    return {
      kind: action,
      scope: "site",
      tab: id.startsWith("site.footer.content.") ? "Contenu" : "Apparence",
      pageTitle: "Home",
      publicSlug: "",
      commit: "change",
    };
  }
  if (id.startsWith("site.") || id.startsWith("section.content.custom_") ||
      id.startsWith("section.content.show_") || id === "section.content.social_links") {
    const appearance = [
      "site.theme_id", "site.pairing_id", "site.brand_color",
      "site.hero_name_font", "site.typography", "site.layout_default",
      "site.layout_default_mobile", "site.category_banner_style",
      "site.category_banner_overlay", "site.category_banner_fit",
      "site.category_banner_fit_mobile",
    ].includes(id);
    return {
      kind: action,
      scope: "site",
      tab: appearance ? "Apparence" : id === "site.tagline" ? "Contenu" : "Réglages",
      pageTitle: "Home",
      publicSlug: "",
      commit: id === "site.typography" || id === "site.nav_layout" ||
        id === "site.checkout_config" || id === "site.order_page_info" ? "blur" : "change",
    };
  }

  if (scope === "page") {
    const order = id === "page.settings.menu_ids";
    const catering = id === "page.settings.service_ids";
    const defaultPage = id === "page.is_default";
    const categoryBar = id.includes(
      "page.appearance_overrides.section_colors.categoryBar",
    );
    const orderPage = order || categoryBar;
    const pageCtaState = id.startsWith(
      "page.appearance_overrides.navbar_cta.",
    );
    const stickyCategoryState = id.startsWith(
      "page.appearance_overrides.section_colors.categoryBarSticky.",
    );
    return {
      kind: action,
      scope,
      tab: id === "page.title" ? "Contenu" :
        id.startsWith("page.appearance_overrides.navbar_cta") ? "Réglages" :
        id === "page.appearance_overrides.hide_navbar_name" ? "Réglages" :
        id.startsWith("page.appearance_overrides.") ? "Apparence" : "Réglages",
      pageTitle: orderPage ? "Brunch Order" : catering ? "Office Catering" :
        defaultPage ? "Dinner Order" : "About",
      publicSlug: orderPage ? "brunch-order" : catering ? "office-catering" :
        defaultPage ? "dinner-order" :
        id === "page.slug" ? String(FIELD_TEST_VALUES[id]) : "about",
      commit: "change",
      prerequisite: pageCtaState
        ? { id: "page.appearance_overrides.navbar_cta", value: true }
        : stickyCategoryState
          ? {
              id: "page.appearance_overrides.section_colors.categoryBarSticky",
              value: true,
            }
          : undefined,
    };
  }

  const hero = [
    "section.content.headline", "section.content.subheadline",
    "section.content.cta_text", "section.content.cta_link",
    "section.content.video_url",
  ].includes(id);
  const scrolling = id === "section.content.text";
  const menuHighlights = [
    "section.settings.card_bg",
    "section.settings.card_text",
    "section.settings.card_muted",
    "section.settings.price_color",
    "section.settings.accent_color",
  ].includes(id);
  const appearance = id === "section.layout" || id.startsWith("section.settings.");
  return {
    kind: action,
    scope,
    tab: appearance ? "Apparence" : id === "section.is_visible" || id === "section.page_id" ? "Réglages" : "Contenu",
    pageTitle: hero || scrolling || menuHighlights ? "Home" : "About",
    sectionLabel: hero
      ? "Hero banner"
      : scrolling
        ? "Scrolling text"
        : menuHighlights
          ? "Menu highlights"
          : "Text and image",
    publicSlug: hero || scrolling || menuHighlights ? "" : "about",
    commit: "change",
    prerequisite: id === "section.settings.custom_bg" || id === "section.settings.custom_text"
      ? { id: "section.settings.color_style", value: "custom" }
      : undefined,
  };
}

function rendererAttribute(id: string): string {
  return `data-field-${id.replace(/[._]/g, "-").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function serialize(value: TestValue): string {
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function expectedFor(id: string, value: TestValue): string {
  if (
    ["site.typography", "site.nav_layout", "site.checkout_config"].includes(id) &&
    typeof value === "string"
  ) {
    return JSON.stringify(JSON.parse(value));
  }
  if (id === "site.order_page_info") {
    return JSON.stringify({
      bar: { pickup: [], delivery: [], dine_in: [] },
      modal: ["about"],
      modalText: "Connected order info",
    });
  }
  if (id === "site.navbar_hamburger" && value === "compact") {
    return "mobile";
  }
  const socialPlatform =
    id === "section.content.social_links"
      ? "instagram"
      : id.startsWith("site.footer.content.social_links.")
        ? id.slice("site.footer.content.social_links.".length)
        : null;
  if (socialPlatform) {
    return JSON.stringify([
      { platform: socialPlatform, url: value },
    ]);
  }
  return serialize(value);
}

export const FIELD_CONTRACTS: readonly FieldContract[] = [
  site("site.tagline", ["tagline"], "[data-website-v3-page]", "text"),
  site("site.navbar_style", ["navbar_style"], "nav", "style"),
  site("site.navbar_color", ["navbar_color"], "nav", "style"),
  site(
    "site.navbar_overlay_text_color",
    ["navbar_overlay_text_color"],
    "nav",
    "style",
  ),
  site("site.navbar_text_color", ["navbar_text_color"], "nav", "style"),
  site("site.logo_size", ["logo_size"], "nav img", "value"),
  site("site.hide_navbar_name", ["hide_navbar_name"], "nav", "visible"),
  site("site.navbar_logo_position", ["navbar_logo_position"], "nav", "value"),
  site("site.navbar_scrolled_logo_url", ["navbar_scrolled_logo_url"], "nav img", "value"),
  site("site.hero_logo_size", ["hero_logo_size"], "[data-website-v3-page]", "value"),
  site("site.hide_hero_logo", ["hide_hero_logo"], "[data-website-v3-page]", "visible"),
  site("site.navbar_show_links", ["navbar_show_links"], "nav a", "visible"),
  site("site.navbar_hamburger", ["navbar_hamburger"], "nav", "visible"),
  site("site.bottom-navigation.background", ["nav_layout", "bottom_navigation", "background_color"], "nav", "style"),
  site("site.bottom-navigation.button-background", ["nav_layout", "bottom_navigation", "button_background_color"], "nav", "style"),
  site("site.bottom-navigation.text", ["nav_layout", "bottom_navigation", "text_color"], "nav", "style"),
  site("site.bottom-navigation.active-text", ["nav_layout", "bottom_navigation", "active_text_color"], "nav", "style"),
  site("site.compact-navigation.icon", ["nav_layout", "compact_navigation", "icon_color"], "nav", "style"),
  site("site.compact-navigation.button-background", ["nav_layout", "compact_navigation", "button_background_color"], "nav", "style"),
  site("site.navbar_cta.enabled", ["navbar_cta", "enabled"], "nav", "visible"),
  site("site.navbar_cta.text", ["navbar_cta", "text"], "nav", "text"),
  site("site.navbar_cta.link", ["navbar_cta", "link"], "nav", "value"),
  site("site.navbar_cta.shape", ["navbar_cta", "shape"], "nav", "style"),
  site("site.navbar_cta.size", ["navbar_cta", "size"], "nav", "style"),
  site("site.navbar_cta.transparent.variant", ["navbar_cta", "transparent", "variant"], "nav", "style"),
  site("site.navbar_cta.transparent.bg", ["navbar_cta", "transparent", "bg"], "nav", "style"),
  site("site.navbar_cta.transparent.text_color", ["navbar_cta", "transparent", "text_color"], "nav", "style"),
  site("site.navbar_cta.transparent.border_color", ["navbar_cta", "transparent", "border_color"], "nav", "style"),
  site("site.navbar_cta.solid.variant", ["navbar_cta", "solid", "variant"], "nav", "style"),
  site("site.navbar_cta.solid.bg", ["navbar_cta", "solid", "bg"], "nav", "style"),
  site("site.navbar_cta.solid.text_color", ["navbar_cta", "solid", "text_color"], "nav", "style"),
  site("site.navbar_cta.solid.border_color", ["navbar_cta", "solid", "border_color"], "nav", "style"),
  site("site.favicon_url", ["favicon_url"], "link[rel='icon']", "value"),
  site("site.checkout_config", ["checkout_config"], "[data-website-v3-page]", "count"),
  site("site.order_page_info", ["order_page_info"], "[data-website-v3-page]", "count"),
  siteAction("site.show_orders_link", ["show_orders_link"]),
  liveSiteAction("site.stories_enabled", ["stories_enabled"]),
  footer("site.footer.content.custom_text", ["content", "custom_text"]),
  footer("site.footer.content.show_logo", ["content", "show_logo"]),
  footer("site.footer.content.show_description", ["content", "show_description"]),
  footer("site.footer.content.show_address", ["content", "show_address"]),
  footer("site.footer.content.show_phone", ["content", "show_phone"]),
  footer("site.footer.content.show_hours", ["content", "show_hours"]),
  footer("site.footer.content.social_links.instagram", ["content", "social_links"]),
  footer("site.footer.content.social_links.facebook", ["content", "social_links"]),
  footer("site.footer.content.social_links.tiktok", ["content", "social_links"]),
  footer("site.footer.content.social_links.whatsapp", ["content", "social_links"]),
  footer("site.footer.layout", ["layout"]),
  footer("site.footer.settings.color_style", ["settings", "color_style"]),
  footer("site.footer.settings.custom_bg", ["settings", "custom_bg"]),
  footer("site.footer.settings.custom_text", ["settings", "custom_text"]),
  footer("site.footer.settings.custom_muted", ["settings", "custom_muted"]),
  footer("site.footer.settings.custom_accent", ["settings", "custom_accent"]),
  footer("site.footer.settings.custom_divider", ["settings", "custom_divider"]),
  page("page.title", ["title"], "[data-page-title]", "text"),
  page("page.slug", ["slug"], "[data-website-v3-page]", "value"),
  page("page.type", ["type"], "[data-website-v3-page]", "value"),
  page("page.sort_order", ["sort_order"], "nav", "count"),
  page("page.nav_visible", ["nav_visible"], "nav a", "visible"),
  action("page.is_homepage", "page", ["is_homepage"]),
  page(
    "page.is_default",
    ["is_default"],
    "[data-website-v3-page]",
    "value",
    ["order", "catering"],
  ),
  page(
    "page.appearance_overrides.hide_navbar_name",
    ["appearance_overrides", "hide_navbar_name"],
    "nav",
    "visible",
  ),
  pageMetadata("page.seo.title", ["seo", "title"], {
    selector: "title",
    assertion: "text",
    name: "text",
  }),
  pageMetadata(
    "page.seo.description",
    ["seo", "description"],
    {
      selector: 'meta[name="description"]',
      assertion: "attribute",
      name: "content",
    },
  ),
  pageMetadata(
    "page.seo.share_image_url",
    ["seo", "share_image_url"],
    {
      selector: 'meta[property="og:image"]',
      assertion: "attribute",
      name: "content",
    },
  ),
  page(
    "page.appearance_overrides.bg",
    ["appearance_overrides", "bg"],
    "body",
    "style",
  ),
  page(
    "page.appearance_overrides.ink",
    ["appearance_overrides", "ink"],
    "body",
    "style",
  ),
  page(
    "page.appearance_overrides.accent",
    ["appearance_overrides", "accent"],
    "a,button",
    "style",
  ),
  page(
    "page.appearance_overrides.headingFont",
    ["appearance_overrides", "headingFont"],
    "h1,h2,h3",
    "style",
  ),
  page(
    "page.appearance_overrides.bodyFont",
    ["appearance_overrides", "bodyFont"],
    "body",
    "style",
  ),
  ...(["categoryTitle", "itemName", "itemPrice", "itemDescription"] as const).map((role) =>
    page(
      `page.appearance_overrides.typography.roles.${role}.color`,
      ["appearance_overrides", "typography", "roles", role, "color"],
      "order",
      "color",
      ["order"],
    ),
  ),
  ...(["heading", "primary", "secondary", "input", "price", "button"] as const).map((role) =>
    page(
      `page.appearance_overrides.checkout_text_colors.${role}`,
      ["appearance_overrides", "checkout_text_colors", role],
      "order",
      "color",
      ["order"],
    ),
  ),
  page(
    "page.appearance_overrides.navbar_style",
    ["appearance_overrides", "navbar_style"],
    "nav",
    "style",
  ),
  page(
    "page.appearance_overrides.navbar_color",
    ["appearance_overrides", "navbar_color"],
    "nav",
    "style",
  ),
  page(
    "page.appearance_overrides.navbar_text_color",
    ["appearance_overrides", "navbar_text_color"],
    "nav",
    "style",
  ),
  page(
    "page.appearance_overrides.navbar_overlay_text_color",
    ["appearance_overrides", "navbar_overlay_text_color"],
    "nav",
    "style",
  ),
  action("page.appearance_overrides.navbar_cta", "page", ["appearance_overrides", "navbar_cta"]),
  page("page.appearance_overrides.navbar_cta.transparent.variant", ["appearance_overrides", "navbar_cta", "transparent", "variant"], "nav", "style"),
  page("page.appearance_overrides.navbar_cta.transparent.bg", ["appearance_overrides", "navbar_cta", "transparent", "bg"], "nav", "style"),
  page("page.appearance_overrides.navbar_cta.transparent.text_color", ["appearance_overrides", "navbar_cta", "transparent", "text_color"], "nav", "style"),
  page("page.appearance_overrides.navbar_cta.transparent.border_color", ["appearance_overrides", "navbar_cta", "transparent", "border_color"], "nav", "style"),
  page("page.appearance_overrides.navbar_cta.solid.variant", ["appearance_overrides", "navbar_cta", "solid", "variant"], "nav", "style"),
  page("page.appearance_overrides.navbar_cta.solid.bg", ["appearance_overrides", "navbar_cta", "solid", "bg"], "nav", "style"),
  page("page.appearance_overrides.navbar_cta.solid.text_color", ["appearance_overrides", "navbar_cta", "solid", "text_color"], "nav", "style"),
  page("page.appearance_overrides.navbar_cta.solid.border_color", ["appearance_overrides", "navbar_cta", "solid", "border_color"], "nav", "style"),
  page("page.appearance_overrides.order_type_selector.shape", ["appearance_overrides", "order_type_selector", "shape"], "button", "style", ["order"]),
  page("page.appearance_overrides.order_type_selector.variant", ["appearance_overrides", "order_type_selector", "variant"], "button", "style", ["order"]),
  page("page.appearance_overrides.order_type_selector.size", ["appearance_overrides", "order_type_selector", "size"], "button", "style", ["order"]),
  page("page.appearance_overrides.order_type_selector.bg", ["appearance_overrides", "order_type_selector", "bg"], "button", "style", ["order"]),
  page("page.appearance_overrides.order_type_selector.text_color", ["appearance_overrides", "order_type_selector", "text_color"], "button", "style", ["order"]),
  page("page.appearance_overrides.order_type_selector.border_color", ["appearance_overrides", "order_type_selector", "border_color"], "button", "style", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.bg", ["appearance_overrides", "section_colors", "categoryBar", "bg"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.text", ["appearance_overrides", "section_colors", "categoryBar", "text"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.accent", ["appearance_overrides", "section_colors", "categoryBar", "accent"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.divider", ["appearance_overrides", "section_colors", "categoryBar", "divider"], "order", "color", ["order"]),
  action("page.appearance_overrides.section_colors.categoryBarSticky", "page", ["appearance_overrides", "section_colors", "categoryBarSticky"]),
  page("page.appearance_overrides.section_colors.categoryBarSticky.bg", ["appearance_overrides", "section_colors", "categoryBarSticky", "bg"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBarSticky.text", ["appearance_overrides", "section_colors", "categoryBarSticky", "text"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBarSticky.accent", ["appearance_overrides", "section_colors", "categoryBarSticky", "accent"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBarSticky.divider", ["appearance_overrides", "section_colors", "categoryBarSticky", "divider"], "order", "color", ["order"]),
  page(
    "page.settings.menu_ids",
    ["settings", "menu_ids"],
    "[data-group-id]",
    "count",
    ["order"],
  ),
  page(
    "page.settings.service_ids",
    ["settings", "service_ids"],
    "[data-catering-service]",
    "count",
    ["catering"],
  ),
  action("page.create", "page", ["pages"]),
  action("page.create.title", "page", ["title"]),
  action("page.create.type", "page", ["type"]),
  action("page.create.slug", "page", ["slug"]),
  action("page.create.menu_ids", "page", ["settings", "menu_ids"]),
  action("page.create.service_ids", "page", ["settings", "service_ids"]),
  action("page.create.is_default", "page", ["is_default"]),
  action("page.duplicate", "page", ["pages"]),
  action("page.delete", "page", ["deleted_page_ids"]),

  sectionVisibility(),
  section("section.sort_order", ["sort_order"], "[data-website-section]", "count"),
  section("section.layout", ["layout"], "[data-website-section]", "value"),
  section("section.page_id", ["page_id"], "[data-website-section]", "value"),
  section("section.content.headline", ["content", "headline"], "[data-website-section] h1", "text"),
  section("section.content.subheadline", ["content", "subheadline"], "[data-website-section] p", "text"),
  section("section.content.title", ["content", "title"], "[data-website-section] h2", "text"),
  section("section.content.body", ["content", "body"], "[data-website-section] p", "text"),
  section("section.content.text", ["content", "text"], "[data-website-section]", "text"),
  section("section.content.cta_text", ["content", "cta_text"], "[data-website-section] a", "text"),
  section("section.content.cta_link", ["content", "cta_link"], "[data-website-section] a", "value"),
  section("section.content.image_url", ["content", "image_url"], "[data-website-section] img", "value"),
  section("section.content.video_url", ["content", "video_url"], "[data-website-section] video", "value"),
  section("section.content.custom_text", ["content", "custom_text"], "[data-footer-text]", "text"),
  section("section.content.show_address", ["content", "show_address"], "[data-contact-address]", "visible"),
  section("section.content.show_phone", ["content", "show_phone"], "[data-contact-phone]", "visible"),
  section("section.content.show_hours", ["content", "show_hours"], "[data-contact-hours]", "visible"),
  section("section.content.social_links", ["content", "social_links"], "[data-social-links] a", "count"),
  section("section.settings.color_style", ["settings", "color_style"], "[data-website-section]", "style"),
  section("section.settings.custom_bg", ["settings", "custom_bg"], "[data-website-section]", "style"),
  section("section.settings.custom_text", ["settings", "custom_text"], "[data-website-section]", "style"),
  section("section.settings.card_bg", ["settings", "card_bg"], "menu_highlights", "color"),
  section("section.settings.card_text", ["settings", "card_text"], "menu_highlights", "color"),
  section("section.settings.card_muted", ["settings", "card_muted"], "menu_highlights", "color"),
  section("section.settings.price_color", ["settings", "price_color"], "menu_highlights", "color"),
  section("section.settings.accent_color", ["settings", "accent_color"], "menu_highlights", "color"),
  section("section.settings.bg_image", ["settings", "bg_image"], "[data-website-section]", "style"),
  section("section.settings.bg_overlay", ["settings", "bg_overlay"], "[data-website-section]", "visible"),
  action("section.create", "section", ["sections"]),
  action("section.delete", "section", ["deleted_section_ids"]),
] as const;

const FIELD_MAP = new Map(FIELD_CONTRACTS.map((contract) => [contract.id, contract]));

/** Returns a field contract or throws when a rendered control was not registered. */
export function fieldContract(id: string): FieldContract {
  const contract = FIELD_MAP.get(id);
  if (!contract) throw new Error(`Unregistered Website V3 field: ${id}`);
  return contract;
}
