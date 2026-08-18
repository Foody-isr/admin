import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewCanvas } from "../PreviewCanvas";

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

test("content pages expose a discoverable component library", () => {
  Object.assign(globalThis, { React });
  const state = {
    config: {},
    pages: [
      {
        id: 10,
        type: "content" as const,
        slug: "about",
        title: "À propos",
        sort_order: 0,
        nav_visible: true,
        is_homepage: true,
        is_default: false,
        seo: {},
        settings: {},
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
      onSelectSection: () => undefined,
      onAddSection: () => undefined,
      onMoveSection: () => undefined,
      onToggleSection: () => undefined,
      onDeleteSection: () => undefined,
    }),
  );

  assert.match(markup, /Ajouter un composant/);
  assert.match(markup, /Mise en page/);
  assert.match(markup, /Hero banner/);
  assert.match(markup, /Galerie/);
  assert.match(markup, /aria-label="Texte \+ image"/);
  assert.doesNotMatch(markup, /<select[^>]+Ajouter une section/);
});

test("order pages expose an explicit checkout preview surface", () => {
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
      onSelectSection: () => undefined,
      onAddSection: () => undefined,
      onMoveSection: () => undefined,
      onToggleSection: () => undefined,
      onDeleteSection: () => undefined,
    }),
  );

  assert.match(markup, />Page<\/button>/);
  assert.match(markup, />Checkout<\/button>/);
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
  assert.match(source, /onSurfaceChange\(option\)/);
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
    /const surface = effectiveSurface\(activePageType, requestedSurface, showBranchSelector\)/,
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
