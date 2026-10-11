import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type {
  CateringService,
  Menu,
  Restaurant,
} from "@/lib/api";
import type {
  DraftPagePayload,
  DraftStatePayload,
  WebsitePageType,
} from "@/lib/website-v3/types";
import { Inspector } from "../Inspector";
import type { RailSelection } from "@/lib/website-v3/editor-selection";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function page(type: WebsitePageType, key: string): DraftPagePayload {
  const base = {
    tmp_id: key,
    slug: type,
    title: `${type} page`,
    sort_order: 0,
    nav_visible: true,
    is_homepage: type === "landing",
    is_default: true,
    seo: {},
    appearance_overrides: {},
  };
  if (type === "order") return { ...base, type, settings: { menu_ids: [3] } };
  if (type === "catering")
    return { ...base, type, settings: { service_ids: [7] } };
  return { ...base, type, settings: {} };
}

function render(
  pages: DraftPagePayload[],
  selection: RailSelection,
  sections: DraftStatePayload["sections"] = [],
): string {
  const state: DraftStatePayload = {
    config: {},
    pages,
    sections,
    deleted_page_ids: [],
    deleted_section_ids: [],
  };
  return renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(Inspector, {
        restaurantId: 24,
        restaurant: { name: "Lovely Patisserie" } as Restaurant,
        state,
        selection,

        sectionPanel: "appearance",
        menus: [] as Menu[],
        services: [] as CateringService[],
        onConfigChange: () => undefined,
        onOrderHeaderChange: () => undefined,
        onPageChange: () => undefined,
        onSectionChange: () => undefined,
        onCreateFooter: () => undefined,
        onRestaurantLogoUpload: async () => undefined,
        onRestaurantLogoRemove: async () => undefined,
      }),
    ),
  );
}

test("a plain page selection cannot reopen any retired inspector controls", () => {
  for (const type of ["landing", "content", "order", "catering"] as const) {
    const markup = render([page(type, "page-1")], {kind: "page", key: "page-1"});
    assert.doesNotMatch(markup, /data-inspector-surface|page\.theme|page\.typography|page\.catalog|page\.identity|Choose a theme/);
    assert.doesNotMatch(markup, /<input|<select|<button/);
  }
});

test("pages without a checkout offer no surface switcher", () => {
  for (const type of ["landing", "content", "catering"] as const) {
    const markup = render([page(type, `${type}-1`)], {
      kind: "page",
      key: `${type}-1`,
    });
    assert.doesNotMatch(markup, /data-inspector-surface=/, type);
  }
});

// resolveSelectedPage falls back to the landing page for the site selection, so
// a switcher there would offer a checkout for a page that is not being edited.
test("the site selection offers no surface switcher", () => {
  const markup = render([page("order", "order-1")], { kind: "site" });

  assert.doesNotMatch(markup, /data-inspector-surface=/);
  assert.match(markup, /site.tagline/);
});

test("shared elements and pages expose no obsolete inspector tab strip", () => {
  for (const selection of [{ kind: "page", key: "order-1" }, { kind: "site", region: "footer" }, { kind: "site", region: "footer-branding" }, { kind: "site" }] as const) {
    const markup = render([page("order", "order-1")], selection);
    assert.doesNotMatch(markup, /data-inspector-tabs|role="tablist"|role="tab"/);
  }
});

test("missing footers offer creation in the dedicated and shared site panels", () => {
  for (const region of ["footer"] as const) {
    const markup = render([page("landing", "home")], { kind: "site", region });
    assert.match(markup, />Add footer<\/button>/);
    assert.doesNotMatch(markup, /from Add section/);
  }
});

test("hidden footers stay editable and branding needs no footer section", () => {
  const markup = render([page("landing", "home")], { kind: "site", region: "footer" }, [{
    id: 42, section_type: "footer", page: "_site", sort_order: 0,
    is_visible: false, layout: "columns", content: {}, settings: {},
  }]);
  assert.match(markup, /data-footer-editor/);
  assert.match(markup, /data-field-id="site.footer.is_visible"/);
  assert.doesNotMatch(markup, />Add footer<\/button>/);
  const branding = render([page("landing", "home")], { kind: "site", region: "footer-branding" });
  assert.match(branding, /site.footer_branding.enabled/);
  assert.doesNotMatch(branding, />Add footer<\/button>/);
});
