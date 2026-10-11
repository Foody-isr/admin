import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPageSettings } from "../page-settings";
import type { DraftPagePayload, DraftStatePayload } from "../types";

function fixture(): DraftStatePayload {
  return {config: {typography: {extraFonts: [{family: "Owned font", weights: [300, 400]}]}}, pages: [
    {id: 1, type: "order", slug: "commander", title: "Order", sort_order: 0, nav_visible: true, is_homepage: true, is_default: true, seo: {}, settings: {menu_ids: [3]}, appearance_overrides: {theme_id: "legacy-theme", typography: {roles: {categoryTitle: {font: "Owned font"}}}}},
    {tmp_id: "brunch", type: "order", slug: "brunch", title: "Brunch", sort_order: 1, nav_visible: true, is_homepage: false, is_default: false, seo: {}, settings: {menu_ids: [3]}, appearance_overrides: {bg: "#123456"}},
  ], sections: [], deleted_page_ids: [], deleted_section_ids: []};
}

test("staged metadata and menu edits preserve stored appearance, fonts and stable IDs", () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const staged: DraftPagePayload = {...state.pages[0], title: "Dinner", seo: {title: "Dinner menu"}, type: "order", settings: {menu_ids: [4, 5]}, appearance_overrides: {}};
  const next = applyPageSettings(state, "1", staged);
  assert.equal(JSON.stringify(state), before);
  assert.equal(next.pages[0].id, 1);
  assert.equal(next.pages[0].title, "Dinner");
  assert.deepEqual(next.pages[0].settings, {menu_ids: [4, 5]});
  assert.deepEqual(next.pages[0].appearance_overrides, state.pages[0].appearance_overrides);
  assert.deepEqual(next.config.typography, state.config.typography);
});

test("changing the primary order page and homepage keeps each invariant unique", () => {
  const state = fixture();
  const next = applyPageSettings(state, "brunch", {...state.pages[1], is_default: true, is_homepage: true});
  assert.equal(next.pages.filter(page => page.is_default).length, 1);
  assert.equal(next.pages.filter(page => page.is_homepage).length, 1);
  assert.equal(next.pages[1].is_default, true);
  assert.equal(next.pages[1].is_homepage, true);
  assert.equal(next.pages[1].slug, "brunch");
});

test("a stale settings dialog cannot recreate a removed page", () => {
  const state = fixture();
  assert.equal(applyPageSettings(state, "removed", state.pages[0]), state);
});
