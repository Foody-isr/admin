import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type {
  CateringService,
  Menu,
  Restaurant,
  ThemeCatalog,
} from "@/lib/api";
import {
  surfacesForPageType,
  visibleInspectorGroups,
  type InspectorSurface,
  type InspectorTab,
} from "@/lib/website-v3/inspector-scope";
import type {
  DraftPagePayload,
  WebsitePageType,
} from "@/lib/website-v3/types";
import { PageInspector } from "../PageInspector";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const TABS: readonly InspectorTab[] = ["content", "appearance", "settings"];
const PAGE_TYPES: readonly WebsitePageType[] = [
  "landing",
  "content",
  "order",
  "catering",
];

function page(type: WebsitePageType): DraftPagePayload {
  const base = {
    tmp_id: `${type}-page`,
    slug: type,
    title: `${type} page`,
    sort_order: 0,
    nav_visible: true,
    is_homepage: type === "landing",
    is_default: true,
    seo: {},
    appearance_overrides: {
      theme_id: "editorial-light",
      section_colors: { categoryBar: { bg: "#ffffff" } },
      checkout_text_colors: { heading: "#ffffff" },
      cart_text_colors: { heading: "#111827" },
      order_type_selector: { shape: "pill" as const },
      cover_url: "https://example.com/cover.jpg",
    },
  };
  if (type === "order") {
    return { ...base, type, settings: { menu_ids: [3] } };
  }
  if (type === "catering") {
    return { ...base, type, settings: { service_ids: [7] } };
  }
  return { ...base, type, settings: {} };
}

function renderInspector(
  pageType: WebsitePageType,
  tab: InspectorTab,
  surface: InspectorSurface,
): string {
  return renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(PageInspector, {
        page: page(pageType),
        tab,
        surface,
        onSurfaceChange: () => undefined,
        restaurantId: 24,
        restaurant: {
          name: "Lovely Patisserie",
          pickup_enabled: true,
          delivery_enabled: true,
        } as Restaurant,
        config: {},
        onConfigChange: () => undefined,
        catalog: themeCatalog(),
        menus: [] as Menu[],
        services: [] as CateringService[],
        errors: [],
        onChange: () => undefined,
        onReplace: () => undefined,
        onMakeDefault: () => undefined,
        onMakeHomepage: () => undefined,
      }),
    ),
  );
}

function renderedGroups(markup: string): string[] {
  return Array.from(
    markup.matchAll(/data-inspector-group="([^"]+)"/g),
    (match) => match[1],
  );
}

// ─── The matrix ──────────────────────────────────────────────────────────────
// Every (page type x tab x surface) combination must render exactly the groups
// the scope table predicts, in the table's order. Comparing ordered arrays also
// pins the order, so a reordering that buries the checkout colours under the
// handoff card fails here.

for (const pageType of PAGE_TYPES) {
  for (const tab of TABS) {
    for (const surface of surfacesForPageType(pageType)) {
      test(`${pageType} / ${tab} / ${surface} renders exactly its scoped groups`, () => {
        assert.deepEqual(
          renderedGroups(renderInspector(pageType, tab, surface)),
          Array.from(visibleInspectorGroups({ pageType, tab, surface })),
        );
      });
    }
  }
}

// ─── The bug, in the words it was reported in ────────────────────────────────
// These survive a table refactor: they assert on the state paths the user saw
// leaking, not on group ids.

test("the checkout surface offers no cart, category bar, cover or mode selector", () => {
  const markup = renderInspector("order", "appearance", "checkout");

  assert.doesNotMatch(markup, /cart_text_colors/);
  assert.doesNotMatch(markup, /section_colors\.categoryBar/);
  assert.doesNotMatch(markup, /Couverture/);
  assert.doesNotMatch(markup, /order_type_selector/);
  assert.doesNotMatch(markup, /Catalogue et séparateurs/);
  assert.doesNotMatch(markup, /Visuels par catégorie/);
  // What it does own.
  assert.match(markup, /checkout_text_colors\.heading/);
});

test("the page surface offers no checkout colours but keeps the cart", () => {
  const markup = renderInspector("order", "appearance", "page");

  assert.doesNotMatch(markup, /checkout_text_colors/);
  assert.match(markup, /cart_text_colors\.heading/);
  assert.match(markup, /cart_text_colors\.surface/);
  assert.match(markup, /section_colors\.categoryBar\.bg/);
  assert.match(markup, /Couverture/);
});

test("the checkout surface offers no page address, commerce or SEO", () => {
  const markup = renderInspector("order", "settings", "checkout");

  assert.doesNotMatch(markup, /data-field-id="page\.slug"/);
  assert.doesNotMatch(markup, /data-field-id="page\.type"/);
  assert.doesNotMatch(markup, /data-field-id="page\.seo\.title"/);
  assert.doesNotMatch(markup, /data-field-id="page\.settings\.menu_ids"/);
  assert.doesNotMatch(markup, /Navigation et pied de page/);
  assert.doesNotMatch(markup, /Informations de commande/);
});

test("every checkout tab offers a one-click way back to the page", () => {
  for (const tab of TABS) {
    const markup = renderInspector("order", tab, "checkout");
    assert.match(
      markup,
      /data-inspector-action="surface\.page"/,
      `${tab}: no handoff action`,
    );
    // Keyed copy: LocaleProvider initialises to 'en' and renderToStaticMarkup
    // never runs its effect, so assertions on new copy are in English.
    assert.match(markup, /Set on the page/, tab);
  }
});

// The theme reaches the checkout too (through foodyweb's OrderThemeBridge), so
// the handoff must not claim otherwise — a false explanation is worse than none.
test("the handoff says the page settings also apply to the checkout", () => {
  const markup = renderInspector("order", "appearance", "checkout");

  assert.match(markup, /apply to the checkout too/);
  assert.doesNotMatch(markup, /do not apply to the checkout/);
});

// ─── No page type regressed ──────────────────────────────────────────────────
// Nothing outside order pages should have changed at all: the surface clamp
// keeps them on "page", where the table reproduces the previous behaviour.

test("non-order pages never render a checkout-only group", () => {
  for (const pageType of ["landing", "content", "catering"] as const) {
    for (const tab of TABS) {
      const markup = renderInspector(pageType, tab, "page");
      assert.doesNotMatch(markup, /checkout_text_colors/, `${pageType}/${tab}`);
      assert.doesNotMatch(
        markup,
        /data-inspector-group="page\.handoff"/,
        `${pageType}/${tab}`,
      );
      assert.doesNotMatch(
        markup,
        /data-inspector-group="checkout\./,
        `${pageType}/${tab}`,
      );
    }
  }
});

test("landing and content pages keep only the page-wide appearance", () => {
  for (const pageType of ["landing", "content"] as const) {
    const markup = renderInspector(pageType, "appearance", "page");
    assert.deepEqual(
      renderedGroups(markup),
      ["page.theme", "page.typography", "page.quick_colors", "page.fonts"],
      pageType,
    );
  }
});

test("catering pages keep the cover and drop the order-only groups", () => {
  const markup = renderInspector("catering", "appearance", "page");

  assert.match(markup, /Couverture/);
  assert.doesNotMatch(markup, /cart_text_colors/);
  assert.doesNotMatch(markup, /order_type_selector/);
  assert.doesNotMatch(markup, /section_colors\.categoryBar\.bg/);
});

// ─── Plumbing lock ───────────────────────────────────────────────────────────
// checkout_config is site-level and shared by every order page. Writing it
// through the page-scoped onChange would silently bury it in one page's
// appearance_overrides, where nothing reads it.

test("the checkout form writes site config, never page state", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(
    resolve(process.cwd(), "src/components/website-v3/PageInspector.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /onChange\(\["checkout_config"\]/);
});

function themeCatalog(): ThemeCatalog {
  return {
    themes: [
      {
        id: "editorial-light",
        name: "Editorial",
        description: "Editorial theme",
        mode: "light",
        preview: {
          swatches: ["#ffffff", "#f8fafc", "#315fce", "#111827"] as [
            string,
            string,
            string,
            string,
          ],
          sampleImage: "",
        },
        suggestedFor: [],
        tokens: {},
        layout: {},
      },
    ],
    typography_pairings: [],
  };
}
