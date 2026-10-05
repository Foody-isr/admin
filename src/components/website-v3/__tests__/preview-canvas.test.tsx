import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewCanvas, componentGroupsForPage } from "../PreviewCanvas";
import type { DraftSectionPayload } from "@/lib/website-v3/types";

test("preview iframe uses one stable landing bootstrap route for every draft page", () => {
  Object.assign(globalThis, { React });
  const state = {
    config: {},
    pages: [
      {
        id: 9,
        type: "catering" as const,
        slug: "catering",
        title: "Traiteur",
        sort_order: 0,
        nav_visible: true,
        is_homepage: true,
        is_default: false,
        seo: {},
        settings: { service_ids: [] },
        appearance_overrides: {},
      },
    ],
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  };
  const markup = renderToStaticMarkup(
    React.createElement(PreviewCanvas, {
      webOrigin: "https://dev-app.foody-pos.co.il",
      restaurantSlug: "moulin-doree",
      restaurantId: 24,
      state,
      activePage: state.pages[0],
      device: "desktop",
      surface: "page" as const,
      onSurfaceChange: () => undefined,
      revision: 1,
      contentRevision: 1,
      onAcknowledged: () => undefined,
      onNavigatePage: () => undefined,
      onHoverSection: () => {},
      onEditElement: () => {},
      onClearSelection: () => {},
      onSelectSection: () => undefined,
      onAddSection: () => undefined,
      onMoveSection: () => undefined,
      onToggleSection: () => undefined,
      onDeleteSection: () => undefined,
    }),
  );

  assert.match(
    markup,
    /src="https:\/\/dev-app\.foody-pos\.co\.il\/r\/moulin-doree\?preview=1"/,
  );
  assert.doesNotMatch(markup, /\/catering\?preview=1/);
  assert.doesNotMatch(markup, /draftPage=/);
});

test("content pages expose the same section library through the sidebar", () => {
  const types = componentGroupsForPage("content").flatMap((group) =>
    group.items.map((item) => item.type),
  );
  for (const type of ["text", "gallery", "text_and_image", "video", "forms", "location_hours"])
    assert.ok(types.includes(type));
  assert.ok(!types.includes("order_discovery"));
});

test("all page types expose Square primitives and never retired Foody blocks", () => {
  for(const page of ["order","landing","catering","content"] as const) {
    const types=componentGroupsForPage(page).flatMap(group=>group.items.map(item=>item.type));
    assert.equal(types.length,19);
    for(const retired of ["order_discovery","picnic_basket","promo_banner","feature_cards","hero_banner","footer"]) assert.ok(!types.includes(retired));
  }
});

test("the page surface keeps the order preview on the landing bootstrap", () => {
  Object.assign(globalThis, { React });
  const state = {
    config: { checkout_config: { lock_order_type: true } },
    pages: [
      {
        id: 11,
        type: "order" as const,
        slug: "commander",
        title: "Commander",
        sort_order: 0,
        nav_visible: true,
        is_homepage: false,
        is_default: true,
        seo: {},
        settings: { menu_ids: [3] },
        appearance_overrides: {
          checkout_text_colors: { heading: "#ffffff" },
        },
      },
    ],
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  };
  const markup = renderToStaticMarkup(
    React.createElement(PreviewCanvas, {
      webOrigin: "https://dev-app.foody-pos.co.il",
      restaurantSlug: "moulin-doree",
      restaurantId: 24,
      state,
      activePage: state.pages[0],
      device: "desktop",
      surface: "page" as const,
      onSurfaceChange: () => undefined,
      revision: 2,
      contentRevision: 2,
      onAcknowledged: () => undefined,
      onNavigatePage: () => undefined,
      onHoverSection: () => {},
      onEditElement: () => {},
      onClearSelection: () => {},
      onSelectSection: () => undefined,
      onAddSection: () => undefined,
      onMoveSection: () => undefined,
      onToggleSection: () => undefined,
      onDeleteSection: () => undefined,
    }),
  );

  // The surface is owned by the builder now, so the page surface must still
  // resolve to the restaurant root and never to the checkout route.
  assert.match(
    markup,
    /src="https:\/\/dev-app\.foody-pos\.co\.il\/r\/moulin-doree\?preview=1"/,
  );
});

// The one thing that, if it regresses, silently kills the whole feature: the
// checkout surface must point the iframe at the checkout route, carrying the
// page slug so foodyweb can resolve that page's appearance overrides.
test("the checkout surface points the iframe at the checkout route", () => {
  Object.assign(globalThis, { React });
  const state = {
    config: {},
    pages: [
      {
        id: 11,
        type: "order" as const,
        slug: "commander",
        title: "Commander",
        sort_order: 0,
        nav_visible: true,
        is_homepage: false,
        is_default: true,
        seo: {},
        settings: { menu_ids: [3] },
        appearance_overrides: {},
      },
    ],
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  };
  const markup = renderToStaticMarkup(
    React.createElement(PreviewCanvas, {
      webOrigin: "https://dev-app.foody-pos.co.il",
      restaurantSlug: "moulin-doree",
      restaurantId: 24,
      state,
      activePage: state.pages[0],
      device: "desktop",
      surface: "checkout" as const,
      onSurfaceChange: () => undefined,
      revision: 2,
      contentRevision: 2,
      onAcknowledged: () => undefined,
      onNavigatePage: () => undefined,
      onHoverSection: () => {},
      onEditElement: () => {},
      onClearSelection: () => {},
      onSelectSection: () => undefined,
      onAddSection: () => undefined,
      onMoveSection: () => undefined,
      onToggleSection: () => undefined,
      onDeleteSection: () => undefined,
    }),
  );

  assert.match(
    markup,
    /src="https:\/\/dev-app\.foody-pos\.co\.il\/order\/checkout\?restaurantId=moulin-doree&amp;orderType=delivery&amp;preview=1&amp;pageSlug=commander"/,
  );
  assert.match(markup, /title="Aperçu du checkout"/);
  assert.doesNotMatch(markup, /Ajouter un composant/);
});

// Locks the lift itself: the surface must not regrow local state in the
// preview, or the inspector silently stops following the visible surface.
test("the preview does not own the surface state", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(
    resolve(process.cwd(), "src/components/website-v3/PreviewCanvas.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /setPreviewSurface/);
  assert.doesNotMatch(source, /useState<"page" \| "checkout">/);
  const inspector = readFileSync(
    resolve(process.cwd(), "src/components/website-v3/Inspector.tsx"),
    "utf8",
  );
  assert.match(inspector, /onSurfaceChange\(value\)/);
  assert.match(inspector, /data-inspector-surface/);
});

test("the builder owns the surface and clamps it before rendering", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(
    resolve(process.cwd(), "src/components/website-v3/WebsiteV3Builder.tsx"),
    "utf8",
  );

  assert.match(source, /const \[requestedSurface, setRequestedSurface\]/);
  assert.match(
    source,
    /const surface = effectiveSurface\(\s*activePageType,\s*requestedSurface,\s*showBranchSelector,?\s*\)/,
  );
  // The clamp must sit above the loading/failure early returns, or the surface
  // is undefined for the first paint of every draft load.
  assert.ok(
    source.indexOf("const surface = effectiveSurface") <
      source.indexOf("return <BuilderLoading />"),
    "the surface clamp must precede the early returns",
  );
  // A surface change must not move previewRevision: it would flip previewStatus
  // and canPublish for a change that published nothing.
  const changeSurface = source.match(
    /const changeSurface = \([\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(changeSurface, "changeSurface is defined");
  assert.doesNotMatch(changeSurface, /bumpPreview/);
  assert.match(changeSurface, /busyRef\.current/);
});
