import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSelectedPage } from "../editor-selection";
import type { DraftStatePayload } from "../types";

const state = {
  config: {},
  sections: [],
  deleted_page_ids: [],
  deleted_section_ids: [],
  pages: [
    {
      id: 1,
      type: "landing",
      slug: "home",
      title: "Home",
      sort_order: 0,
      nav_visible: true,
      is_homepage: true,
      is_default: false,
      seo: {},
      settings: {},
      appearance_overrides: {},
    },
    {
      tmp_id: "about",
      type: "content",
      slug: "about",
      title: "About",
      sort_order: 1,
      nav_visible: true,
      is_homepage: false,
      is_default: false,
      seo: {},
      settings: {},
      appearance_overrides: {},
    },
  ],
} satisfies DraftStatePayload;

test("shared header and footer keep an unsaved content page visible", () => {
  for (const region of ["header", "footer"] as const) {
    assert.equal(
      resolveSelectedPage(state, { kind: "site", pageKey: "about", region }),
      state.pages[1],
    );
  }
});

test("removing a selected page resolves to a remaining page instead of a stale preview", () => {
  assert.equal(
    resolveSelectedPage(state, { kind: "page", key: "removed" }),
    state.pages[0],
  );
  assert.equal(
    resolveSelectedPage({ ...state, pages: [] }, { kind: "site" }),
    null,
  );
});
