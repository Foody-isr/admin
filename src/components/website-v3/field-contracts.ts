import type {
  PreviewDevice,
  WebsitePageType,
} from "@/lib/website-v3/types";
import type { InspectorSurface } from "@/lib/website-v3/inspector-scope";

type Assertion = "text" | "attribute" | "css" | "visible" | "count";
type TestValue = string | number | boolean | number[];
import type { SectionPanel } from "./SectionInspector";

type RendererExpectation = {
  selector: string;
  assertion: Assertion;
  expected: string;
  name: string;
};

type FieldEditorContract = {
  kind: "field" | "action";
  scope: "site" | "page" | "section";
  sectionPanel?: SectionPanel;
  pageTitle: string;
  sectionLabel?: string;
  publicSlug: string;
  /** Preview surface the control lives on. Absent means "page" — only an order
   *  page has a second surface. See lib/website-v3/inspector-scope. */
  surface?: InspectorSurface;
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

function orderSection(
  id: string,
  path: readonly (string | number)[],
  _selector: string,
  _assertion: string,
): FieldContract {
  return contract({
    id,
    scope: "section",
    statePath: path,
    pageTypes: ["order"],
  });
}

function footer(
  id: string,
  path: readonly (string | number)[],
): FieldContract {
  const base = contract({
    id,
    scope: "site",
    statePath: path,
    pageTypes: ALL_PAGES,
  });
  if (id !== "site.footer.is_visible") return base;
  const assertion = {
    selector: '[data-editor-region="footer"]',
    assertion: "visible" as const,
    expected: "false",
    name: "hidden",
  };
  return { ...base, testValue: false, preview: assertion, public: assertion };
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
    editor: editorFor(base.id, base.scope, actionContract, base.pageTypes),
    preview: expectation,
    public: expectation,
  };
}

const FIELD_TEST_VALUES: Record<string, TestValue> = {
  "section.settings.motion.parallax_target": "text",
  "section.settings.motion.mobile_parallax": "up",
  "section.settings.motion.mobile_parallax_target": "text",
  "section.settings.motion.mobile_parallax_amount": 200,

  "section.settings.word_animation": "slide",
  "section.settings.resize_width": false,
  "section.settings.carousel_autoplay": true,
  "section.settings.carousel_interval": 6000,
  "section.settings.carousel_duration": 700,
  "section.settings.motion.enabled": true,
  "section.settings.motion.entrance": "zoom",
  "section.settings.motion.mobile_entrance": "from_bottom",
  "section.settings.motion.duration_ms": 1500,
  "section.settings.motion.delay_ms": 200,
  "section.settings.motion.replay": true,
  "section.settings.motion.media_hover": "wobble",
  "section.settings.motion.button_hover": "push",
  "section.settings.motion.parallax": "up",
  "section.settings.motion.parallax_amount": 30,
  "section.settings.motion.mobile": false,
  "section.settings.motion.parallax_mobile": true,

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
  "site.nav_layout": `{"logo":"left","links":"center","cta":"right"}`,
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
  "site.footer_branding.enabled": false,
  "site.footer_branding.background": "#234537",
  "site.footer.settings.custom_text": "#f8fafc",
  "site.footer.settings.custom_muted": "#94a3b8",
  "site.footer.settings.custom_accent": "#d6ff3f",
  "site.footer.settings.custom_divider": "#334155",
  "site.favicon_url": "http://localhost:3000/logo-icon.svg",
  "site.show_orders_link": false,
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
  "page.appearance_overrides.navbar_logo_position": "right",
  "page.seo.title": "Website V3 SEO title",
  "page.seo.description": "Website V3 SEO description",
  "page.seo.share_image_url": "http://localhost:3000/logo-icon.svg",
  "page.appearance_overrides.bg": "#f1e2d3",
  "page.appearance_overrides.ink": "#102030",
  "page.appearance_overrides.accent": "#b42318",
  "page.appearance_overrides.headingFont": "Georgia",
  "page.appearance_overrides.bodyFont": "Inter",
  "page.appearance_overrides.catering_page.hero_title": "A table made for your celebration",
  "page.appearance_overrides.catering_page.hero_subtitle": "A connected catering introduction.",
  "page.appearance_overrides.catering_page.show_restaurant_name": false,
  "page.appearance_overrides.catering_page.chooser_title": "Choose your reception",
  "page.appearance_overrides.catering_page.chooser_subtitle": "A connected service-list introduction.",
  "page.appearance_overrides.catering_page.service_action_label": "Explore",
  "page.appearance_overrides.catering_page.show_steps": false,
  "page.appearance_overrides.chain_order_entry.logo_url":
    "http://localhost:3000/logo-icon.svg",
  "page.appearance_overrides.chain_order_entry.layout": "cards",
  "page.appearance_overrides.chain_order_entry.surface_color": "#fffaf0",
  "page.appearance_overrides.chain_order_entry.overlay_opacity": 42,
  "page.appearance_overrides.chain_order_entry.show_search": false,
  "page.appearance_overrides.chain_order_entry.show_near_me": false,
  "page.appearance_overrides.chain_order_entry.show_branch_count": false,
  "page.appearance_overrides.chain_order_entry.show_branch_numbers": false,
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
  "page.appearance_overrides.section_colors.categoryBar.activeBg": "#111827",
  "page.appearance_overrides.section_colors.categoryBar.activeText": "#ffffff",
  "page.appearance_overrides.section_colors.categoryBar.searchBg": "#f1f5f9",
  "page.appearance_overrides.section_colors.categoryBar.searchText": "#111827",
  "page.appearance_overrides.section_colors.categoryBar.iconBg": "#111827",
  "page.appearance_overrides.section_colors.categoryBar.icon": "#ffffff",
  "page.appearance_overrides.section_colors.categoryBar.cartBg": "#111827",
  "page.appearance_overrides.section_colors.categoryBar.cartText": "#ffffff",
  "page.settings.menu_ids": [0],
  "page.settings.service_ids": [0],
  "section.is_visible": true,
  "section.sort_order": 0,
  "section.layout": "image_left",
  "section.page_id": 0,
  "section.content.headline": "Connected hero headline",
  "section.content.subheadline": "Connected hero subheadline",
  "section.content.title": "Connected section title",
  "section.content.heading_eyebrow": "Connected discovery eyebrow",
  "section.content.heading": "Connected discovery heading",
  "section.content.show_heading": false,
  "section.content.body": "Connected section body",
  "section.content.text": "Connected scrolling text",
  "section.content.phrases": "a little\na lot\nwith passion",
  "section.settings.show_text": false,
  "section.settings.rotating_color": "#d7807f",
  "section.settings.speed": "slow",
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
  "section.settings.button_bg_color": "#7c2d12",
  "section.settings.button_text_color": "#fef3c7",
  "section.settings.button_border_color": "#f59e0b",
  "section.settings.button_shape": "pill",
  "section.settings.image_position": "alternate",
  "section.settings.card_height": "tall",
  "section.settings.card_radius": "soft",
  "section.settings.heading_eyebrow_color": "#6b7280",
  "section.settings.heading_color": "#111827",
  "section.settings.panel_style": "gradient",
  "section.settings.panel_bg_color": "#5f241a",
  "section.settings.panel_bg_color_end": "#8f4432",
  "section.settings.panel_text_color": "#ffffff",
  "section.settings.panel_muted_color": "#f5d8cf",
  "section.settings.mobile_text_color": "#ffffff",
  "section.settings.mobile_overlay_opacity": 0.8,
  "section.settings.section_bg_color": "#fff7ed",
  "section.settings.show_dividers": false,
  "section.settings.divider_color": "#fed7aa",
  "section.settings.placement_mode": "between_groups",
  "section.settings.placement_group_id": "42",
  "section.settings.placement_edge": "before",
  "section.settings.insert_after_items": 9,
  "section.settings.bg_image": "http://localhost:3000/logo-icon.svg",
  "section.settings.bg_overlay": true,
  "section.settings.image_only": true,
};

function editorFor(
  id: string,
  scope: FieldContract["scope"],
  isAction: boolean,
  pageTypes: FieldContract["pageTypes"] = ALL_PAGES,
): FieldEditorContract {
  const action = isAction ? "action" : "field";
  if (id.startsWith("section.settings.motion.")) return { kind: action, scope: "section", sectionPanel: "appearance", pageTitle: "About", sectionLabel: "Text and image", publicSlug: "about", commit: "change", prerequisite: id.endsWith(".enabled") ? undefined : { id: "section.settings.motion.enabled", value: true } };
  if (id.startsWith("section.settings.carousel_")) return { kind: action, scope: "section", sectionPanel: "appearance", pageTitle: "Home", sectionLabel: "Testimonials", publicSlug: "", commit: "change" };

  if (id.startsWith("site.footer.")) {
    return {
      kind: action,
      scope: "site",
      pageTitle: "Home",
      publicSlug: "",
      commit: "change",
    };
  }
  if (id.startsWith("site.") || id.startsWith("section.content.custom_") ||
      (id.startsWith("section.content.show_") && id !== "section.content.show_heading") ||
      id === "section.content.social_links") {
    return {
      kind: action,
      scope: "site",
      pageTitle: "Home",
      publicSlug: "",
      commit: id === "site.typography" || id === "site.nav_layout" ? "blur" : "change",
    };
  }

  if (scope === "page") {
    const order = id === "page.settings.menu_ids";
    const catering = id === "page.settings.service_ids";
    const cateringContent = id.startsWith(
      "page.appearance_overrides.catering_page.",
    );
    const defaultPage = id === "page.is_default";
    const categoryBar = id.includes(
      "page.appearance_overrides.section_colors.categoryBar",
    );
    // Any order-only field must be edited ON an order page. Deriving this from
    // pageTypes instead of an id allowlist fixes 37 contracts that pointed at
    // the "About" content page, where their editor has never rendered.
    const orderOnly =
      pageTypes !== ALL_PAGES &&
      pageTypes.length === 1 &&
      pageTypes[0] === "order";
    const orderPage = order || categoryBar || orderOnly;
    const cateringPage = catering || cateringContent;
    const chainSelector = id.startsWith(
      "page.appearance_overrides.chain_order_entry.",
    );
    const pageCtaState = id.startsWith(
      "page.appearance_overrides.navbar_cta.",
    );
    return {
      kind: action,
      scope,
      pageTitle: orderPage ? "Brunch Order" : cateringPage ? "Office Catering" :
        defaultPage ? "Dinner Order" : "About",
      publicSlug: orderPage ? "brunch-order" : cateringPage ? "office-catering" :
        defaultPage ? "dinner-order" :
        id === "page.slug" ? String(FIELD_TEST_VALUES[id]) : "about",
      surface: chainSelector ? "branches" : "page",
      commit: "change",
      prerequisite: pageCtaState
        ? { id: "page.appearance_overrides.navbar_cta", value: true }
        : undefined,
    };
  }

  const hero = [
    "section.content.headline", "section.content.subheadline",
    "section.content.cta_text", "section.content.cta_link",
    "section.content.video_url",
  ].includes(id);
  const scrolling = id === "section.content.text";
  const animated = [
    "section.content.phrases",
    "section.settings.show_text",
    "section.settings.rotating_color",
    "section.settings.speed",
  ].includes(id);
  const menuHighlights = [
    "section.settings.card_bg",
    "section.settings.card_text",
    "section.settings.card_muted",
    "section.settings.price_color",
    "section.settings.accent_color",
  ].includes(id);
  const featureCards = [
    "section.settings.button_bg_color",
    "section.settings.button_text_color",
    "section.settings.button_border_color",
    "section.settings.button_shape",
  ].includes(id);
  const orderDiscovery =
    id === "section.content.heading_eyebrow" ||
    id === "section.content.heading" ||
    id === "section.content.show_heading" ||
    id.startsWith("section.settings.image_position") ||
    id.startsWith("section.settings.card_height") ||
    id.startsWith("section.settings.card_radius") ||
    id.startsWith("section.settings.heading_") ||
    id.startsWith("section.settings.panel_") ||
    id.startsWith("section.settings.mobile_") ||
    id === "section.settings.section_bg_color" ||
    id === "section.settings.show_dividers" ||
    id === "section.settings.divider_color" ||
    id.startsWith("section.settings.placement_") ||
    id === "section.settings.insert_after_items";
  const discoveryPlacement =
    id.startsWith("section.settings.placement_") ||
    id === "section.settings.insert_after_items";
  const appearance =
    id === "section.layout" ||
    (id.startsWith("section.settings.") && !discoveryPlacement && !animated);
  return {
    kind: action,
    scope,
    sectionPanel: appearance ? "appearance" : id === "section.is_visible" || id === "section.page_id" ? "settings" : "content",
    pageTitle: orderDiscovery
      ? "Dinner Order"
      : hero || scrolling || animated || menuHighlights || featureCards
        ? "Home"
        : "About",
    sectionLabel: hero
      ? "Hero banner"
      : scrolling
        ? "Scrolling text"
        : animated
          ? "Animated text"
        : menuHighlights
          ? "Menu highlights"
          : featureCards
            ? "Feature cards"
            : orderDiscovery
              ? "Order discovery"
              : "Text and image",
    publicSlug: orderDiscovery
      ? "dinner-order"
      : hero || scrolling || animated || menuHighlights || featureCards
        ? ""
        : "about",
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
  if (id === "section.content.phrases" && typeof value === "string") {
    return JSON.stringify(value.split("\n").map((text) => ({ text })));
  }
  if (
    ["site.typography", "site.nav_layout"].includes(id) &&
    typeof value === "string"
  ) {
    return JSON.stringify(JSON.parse(value));
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
  siteAction("site.show_orders_link", ["show_orders_link"]),
  site("site.footer_branding.enabled", ["custom_palette", "footer_branding", "enabled"], "[data-editor-region=footer-branding]"),
  site("site.footer_branding.background", ["custom_palette", "footer_branding", "background"], "[data-editor-region=footer-branding]"),
  footer("site.footer.is_visible", ["is_visible"]),
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
  page(
    "page.appearance_overrides.navbar_logo_position",
    ["appearance_overrides", "navbar_logo_position"],
    "nav",
    "value",
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
  ...([
    "hero_title",
    "hero_subtitle",
    "show_restaurant_name",
    "chooser_title",
    "chooser_subtitle",
    "service_action_label",
    "show_steps",
  ] as const).map((field) =>
    page(
      `page.appearance_overrides.catering_page.${field}`,
      ["appearance_overrides", "catering_page", field],
      "main",
      typeof FIELD_TEST_VALUES[`page.appearance_overrides.catering_page.${field}`] === "boolean"
        ? "visible"
        : "text",
      ["catering"],
    ),
  ),
  page(
    "page.appearance_overrides.chain_order_entry.logo_url",
    ["appearance_overrides", "chain_order_entry", "logo_url"],
    "main",
    "attribute",
    ["order"],
  ),
  page(
    "page.appearance_overrides.chain_order_entry.layout",
    ["appearance_overrides", "chain_order_entry", "layout"],
    "main",
    "attribute",
    ["order"],
  ),
  page(
    "page.appearance_overrides.chain_order_entry.surface_color",
    ["appearance_overrides", "chain_order_entry", "surface_color"],
    "main",
    "attribute",
    ["order"],
  ),
  page(
    "page.appearance_overrides.chain_order_entry.overlay_opacity",
    ["appearance_overrides", "chain_order_entry", "overlay_opacity"],
    "main",
    "attribute",
    ["order"],
  ),
  ...(["show_search", "show_near_me", "show_branch_count", "show_branch_numbers"] as const).map(
    (field) =>
      page(
        `page.appearance_overrides.chain_order_entry.${field}`,
        ["appearance_overrides", "chain_order_entry", field],
        "main",
        "attribute",
        ["order"],
      ),
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
  page("page.appearance_overrides.section_colors.categoryBar.activeBg", ["appearance_overrides", "section_colors", "categoryBar", "activeBg"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.activeText", ["appearance_overrides", "section_colors", "categoryBar", "activeText"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.searchBg", ["appearance_overrides", "section_colors", "categoryBar", "searchBg"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.searchText", ["appearance_overrides", "section_colors", "categoryBar", "searchText"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.iconBg", ["appearance_overrides", "section_colors", "categoryBar", "iconBg"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.icon", ["appearance_overrides", "section_colors", "categoryBar", "icon"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.cartBg", ["appearance_overrides", "section_colors", "categoryBar", "cartBg"], "order", "color", ["order"]),
  page("page.appearance_overrides.section_colors.categoryBar.cartText", ["appearance_overrides", "section_colors", "categoryBar", "cartText"], "order", "color", ["order"]),
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
  orderSection("section.content.heading_eyebrow", ["content", "heading_eyebrow"], "order_discovery", "text"),
  orderSection("section.content.heading", ["content", "heading"], "order_discovery", "text"),
  orderSection("section.content.show_heading", ["content", "show_heading"], "order_discovery", "visible"),
  section("section.content.body", ["content", "body"], "[data-website-section] p", "text"),
  section("section.content.text", ["content", "text"], "[data-website-section]", "text"),
  section("section.content.phrases", ["content", "phrases"], "animated_text", "text"),
  section("section.settings.show_text", ["settings", "show_text"], "animated_text", "visible"),
  section("section.settings.rotating_color", ["settings", "rotating_color"], "animated_text", "color"),
  section("section.settings.speed", ["settings", "speed"], "animated_text", "value"),
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
  section("section.settings.button_bg_color", ["settings", "button_bg_color"], "feature_cards", "color"),
  section("section.settings.button_text_color", ["settings", "button_text_color"], "feature_cards", "color"),
  section("section.settings.button_border_color", ["settings", "button_border_color"], "feature_cards", "color"),
  section("section.settings.button_shape", ["settings", "button_shape"], "feature_cards", "style"),
  orderSection("section.settings.image_position", ["settings", "image_position"], "order_discovery", "style"),
  orderSection("section.settings.card_height", ["settings", "card_height"], "order_discovery", "style"),
  orderSection("section.settings.card_radius", ["settings", "card_radius"], "order_discovery", "style"),
  orderSection("section.settings.heading_eyebrow_color", ["settings", "heading_eyebrow_color"], "order_discovery", "color"),
  orderSection("section.settings.heading_color", ["settings", "heading_color"], "order_discovery", "color"),
  orderSection("section.settings.panel_style", ["settings", "panel_style"], "order_discovery", "style"),
  orderSection("section.settings.panel_bg_color", ["settings", "panel_bg_color"], "order_discovery", "color"),
  orderSection("section.settings.panel_bg_color_end", ["settings", "panel_bg_color_end"], "order_discovery", "color"),
  orderSection("section.settings.panel_text_color", ["settings", "panel_text_color"], "order_discovery", "color"),
  orderSection("section.settings.panel_muted_color", ["settings", "panel_muted_color"], "order_discovery", "color"),
  orderSection("section.settings.mobile_text_color", ["settings", "mobile_text_color"], "order_discovery", "color"),
  orderSection("section.settings.mobile_overlay_opacity", ["settings", "mobile_overlay_opacity"], "order_discovery", "style"),
  orderSection("section.settings.section_bg_color", ["settings", "section_bg_color"], "order_discovery", "color"),
  orderSection("section.settings.show_dividers", ["settings", "show_dividers"], "order_discovery", "visible"),
  orderSection("section.settings.divider_color", ["settings", "divider_color"], "order_discovery", "color"),
  orderSection("section.settings.placement_mode", ["settings", "placement_mode"], "order_discovery", "value"),
  orderSection("section.settings.placement_group_id", ["settings", "placement_group_id"], "order_discovery", "value"),
  orderSection("section.settings.placement_edge", ["settings", "placement_edge"], "order_discovery", "value"),
  orderSection("section.settings.insert_after_items", ["settings", "insert_after_items"], "order_discovery", "value"),
  section("section.settings.bg_image", ["settings", "bg_image"], "[data-website-section]", "style"),
  section("section.settings.bg_overlay", ["settings", "bg_overlay"], "[data-website-section]", "visible"),
  section("section.settings.image_only", ["settings", "image_only"], "text_and_image", "visible"),
  section("section.settings.word_animation", ["settings", "word_animation"], "[data-website-section]", "style"),
  section("section.settings.resize_width", ["settings", "resize_width"], "[data-website-section]", "style"),
  section("section.settings.carousel_autoplay", ["settings", "carousel_autoplay"], "[data-website-section]", "style"),
  section("section.settings.carousel_interval", ["settings", "carousel_interval"], "[data-website-section]", "style"),
  section("section.settings.carousel_duration", ["settings", "carousel_duration"], "[data-website-section]", "style"),
  section("section.settings.motion.enabled", ["settings", "motion", "enabled"], "[data-website-section]", "style"),
  section("section.settings.motion.entrance", ["settings", "motion", "entrance"], "[data-website-section]", "style"),
  section("section.settings.motion.mobile_entrance", ["settings", "motion", "mobile_entrance"], "[data-website-section]", "style"),
  section("section.settings.motion.duration_ms", ["settings", "motion", "duration_ms"], "[data-website-section]", "style"),
  section("section.settings.motion.delay_ms", ["settings", "motion", "delay_ms"], "[data-website-section]", "style"),
  section("section.settings.motion.replay", ["settings", "motion", "replay"], "[data-website-section]", "style"),
  section("section.settings.motion.media_hover", ["settings", "motion", "media_hover"], "[data-website-section]", "style"),
  section("section.settings.motion.button_hover", ["settings", "motion", "button_hover"], "[data-website-section]", "style"),
  section("section.settings.motion.parallax", ["settings", "motion", "parallax"], "[data-website-section]", "style"),
  section("section.settings.motion.parallax_amount", ["settings", "motion", "parallax_amount"], "[data-website-section]", "style"),
  section("section.settings.motion.mobile", ["settings", "motion", "mobile"], "[data-website-section]", "style"),
  section("section.settings.motion.parallax_mobile", ["settings", "motion", "parallax_mobile"], "[data-website-section]", "style"),
  section("section.settings.motion.parallax_target", ["settings", "motion", "parallax_target"], "[data-website-section]", "style"),
  section("section.settings.motion.mobile_parallax", ["settings", "motion", "mobile_parallax"], "[data-website-section]", "style"),
  section("section.settings.motion.mobile_parallax_target", ["settings", "motion", "mobile_parallax_target"], "[data-website-section]", "style"),
  section("section.settings.motion.mobile_parallax_amount", ["settings", "motion", "mobile_parallax_amount"], "[data-website-section]", "style"),
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
