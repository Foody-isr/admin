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
