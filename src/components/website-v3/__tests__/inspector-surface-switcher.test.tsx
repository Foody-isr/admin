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
import type {
  DraftPagePayload,
  DraftStatePayload,
  WebsitePageType,
} from "@/lib/website-v3/types";
import type { InspectorSurface } from "@/lib/website-v3/inspector-scope";
import { Inspector } from "../Inspector";
import type { RailSelection } from "../PageRail";

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
  surface: InspectorSurface = "page",
): string {
  const state: DraftStatePayload = {
    config: {},
    pages,
    sections: [],
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
        tab: "appearance" as const,
        surface,
        menus: [] as Menu[],
        services: [] as CateringService[],
        catalog: { themes: [], typography_pairings: [] } as ThemeCatalog,
        errors: [],
        onTabChange: () => undefined,
        onSurfaceChange: () => undefined,
        onConfigChange: () => undefined,
        onPageChange: () => undefined,
        onPageReplace: () => undefined,
        onSectionChange: () => undefined,
        onMakeDefault: () => undefined,
        onMakeHomepage: () => undefined,
        onStoriesNavigationAvailabilityChange: () => undefined,
        onRestaurantLogoUpload: async () => undefined,
        onRestaurantLogoRemove: async () => undefined,
      }),
    ),
  );
}

test("an order page offers the surface switcher in the inspector header", () => {
  const markup = render([page("order", "order-1")], {
    kind: "page",
    key: "order-1",
  });

  assert.match(markup, /data-inspector-surface="page"/);
  assert.match(markup, /data-inspector-surface="checkout"/);
  // LocaleProvider initialises to 'en' and renderToStaticMarkup never runs its
  // effect, so keyed copy asserts in English here.
  assert.match(markup, /aria-label="Preview surface"/);
});

test("the switcher marks the surface currently on screen", () => {
  const onPage = render(
    [page("order", "order-1")],
    { kind: "page", key: "order-1" },
    "page",
  );
  const onCheckout = render(
    [page("order", "order-1")],
    { kind: "page", key: "order-1" },
    "checkout",
  );

  assert.match(
    onPage,
    /data-inspector-surface="page" aria-pressed="true"/,
  );
  assert.match(
    onCheckout,
    /data-inspector-surface="checkout" aria-pressed="true"/,
  );
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
  assert.match(markup, /Éléments partagés/);
});

test("the three inspector tabs are still present alongside it", () => {
  const markup = render([page("order", "order-1")], {
    kind: "page",
    key: "order-1",
  });

  for (const label of ["Contenu", "Apparence", "Réglages"]) {
    assert.match(markup, new RegExp(`>${label}</button>`), label);
  }
});
