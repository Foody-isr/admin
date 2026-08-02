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
});
