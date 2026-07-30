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
  "site.nav_layout": `{"logo":"left","links":"center","cta":"right"}`,
  "site.navbar_style": "overlay",
  "site.navbar_color": "#223344",
  "site.navbar_scrolled_logo_url": "http://localhost:3000/logo-icon.svg",
  "site.navbar_show_links": false,
  "site.navbar_hamburger": "always",
  "site.navbar_cta": "Réserver E2E",
  "site.favicon_url": "http://localhost:3000/logo-icon.svg",
  "site.checkout_config": `{"note":"connected checkout"}`,
  "site.order_page_info": `{"modal":["about"],"modal_text":"Connected order info"}`,
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
  "page.seo.title": "Website V3 SEO title",
  "page.seo.description": "Website V3 SEO description",
  "page.seo.share_image_url": "http://localhost:3000/logo-icon.svg",
  "page.appearance_overrides.bg": "#f1e2d3",
  "page.appearance_overrides.ink": "#102030",
  "page.appearance_overrides.accent": "#b42318",
  "page.appearance_overrides.headingFont": "Georgia",
  "page.appearance_overrides.bodyFont": "Inter",
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
  "section.content.custom_text": "© Website V3 connected",
  "section.content.show_address": false,
  "section.content.show_phone": false,
  "section.content.show_hours": false,
  "section.content.social_links": "https://instagram.com/foody-v3-e2e",
  "section.settings.color_style": "custom",
  "section.settings.custom_bg": "#213547",
  "section.settings.custom_text": "#f7f8fa",
  "section.settings.bg_image": "http://localhost:3000/logo-icon.svg",
  "section.settings.bg_overlay": true,
};

function editorFor(
  id: string,
  scope: FieldContract["scope"],
  isAction: boolean,
): FieldEditorContract {
  const action = isAction ? "action" : "field";
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
      tab: appearance ? "Apparence" : id === "site.tagline" || id.startsWith("section.") ? "Contenu" : "Réglages",
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
    return {
      kind: action,
      scope,
      tab: id === "page.title" ? "Contenu" :
        id.startsWith("page.appearance_overrides.") ? "Apparence" : "Réglages",
      pageTitle: order ? "Brunch Order" : catering ? "Office Catering" :
        defaultPage ? "Dinner Order" : "About",
      publicSlug: order ? "brunch-order" : catering ? "office-catering" :
        defaultPage ? "dinner-order" :
        id === "page.slug" ? String(FIELD_TEST_VALUES[id]) : "about",
      commit: "change",
    };
  }

  const hero = [
    "section.content.headline", "section.content.subheadline",
    "section.content.cta_text", "section.content.cta_link",
  ].includes(id);
  const scrolling = id === "section.content.text";
  const appearance = id === "section.layout" || id.startsWith("section.settings.");
  return {
    kind: action,
    scope,
    tab: appearance ? "Apparence" : id === "section.is_visible" || id === "section.page_id" ? "Réglages" : "Contenu",
    pageTitle: hero || scrolling ? "Home" : "About",
    sectionLabel: hero ? "Hero banner" : scrolling ? "Scrolling text" : "Text and image",
    publicSlug: hero || scrolling ? "" : "about",
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
  if (id === "section.content.social_links") {
    return JSON.stringify([
      { platform: "instagram", url: value },
    ]);
  }
  return serialize(value);
}

export const FIELD_CONTRACTS: readonly FieldContract[] = [
  site("site.theme_id", ["theme_id"], "[data-website-v3-page]", "value"),
  site("site.pairing_id", ["pairing_id"], "body", "style"),
  site("site.brand_color", ["brand_color"], "body", "style"),
  site("site.tagline", ["tagline"], "[data-website-v3-page]", "text"),
  site("site.hero_name_font", ["hero_name_font"], "[data-website-v3-page]", "style"),
  site("site.typography", ["typography"], "body", "style"),
  site("site.nav_layout", ["nav_layout"], "nav", "visible"),
  site("site.navbar_style", ["navbar_style"], "nav", "style"),
  site("site.navbar_color", ["navbar_color"], "nav", "style"),
  site("site.navbar_scrolled_logo_url", ["navbar_scrolled_logo_url"], "nav img", "value"),
  site("site.navbar_show_links", ["navbar_show_links"], "nav a", "visible"),
  site("site.navbar_hamburger", ["navbar_hamburger"], "nav", "visible"),
  site("site.navbar_cta", ["navbar_cta"], "nav", "text"),
  site("site.favicon_url", ["favicon_url"], "link[rel='icon']", "value"),
  site("site.checkout_config", ["checkout_config"], "[data-website-v3-page]", "count"),
  site("site.order_page_info", ["order_page_info"], "[data-website-v3-page]", "count"),
  site("site.layout_default", ["layout_default"], "[data-website-v3-page]", "value"),
  site("site.layout_default_mobile", ["layout_default_mobile"], "[data-website-v3-page]", "value"),
  site("site.category_banner_style", ["category_banner_style"], "[data-website-v3-page]", "style"),
  site("site.category_banner_overlay", ["category_banner_overlay"], "[data-website-v3-page]", "style"),
  site("site.category_banner_fit", ["category_banner_fit"], "[data-website-v3-page]", "style"),
  site("site.category_banner_fit_mobile", ["category_banner_fit_mobile"], "[data-website-v3-page]", "style"),

  page("page.title", ["title"], "[data-page-title]", "text"),
  page("page.slug", ["slug"], "[data-website-v3-page]", "value"),
  page("page.type", ["type"], "[data-website-v3-page]", "value"),
  page("page.sort_order", ["sort_order"], "nav", "count"),
  page("page.nav_visible", ["nav_visible"], "nav a", "visible"),
  page(
    "page.is_default",
    ["is_default"],
    "[data-website-v3-page]",
    "value",
    ["order", "catering"],
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
  section("section.content.custom_text", ["content", "custom_text"], "[data-footer-text]", "text"),
  section("section.content.show_address", ["content", "show_address"], "[data-contact-address]", "visible"),
  section("section.content.show_phone", ["content", "show_phone"], "[data-contact-phone]", "visible"),
  section("section.content.show_hours", ["content", "show_hours"], "[data-contact-hours]", "visible"),
  section("section.content.social_links", ["content", "social_links"], "[data-social-links] a", "count"),
  section("section.settings.color_style", ["settings", "color_style"], "[data-website-section]", "style"),
  section("section.settings.custom_bg", ["settings", "custom_bg"], "[data-website-section]", "style"),
  section("section.settings.custom_text", ["settings", "custom_text"], "[data-website-section]", "style"),
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
