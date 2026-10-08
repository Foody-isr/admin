import test from "node:test";
import assert from "node:assert/strict";
import { siteColorUsage } from "../site-color-usage";
import { normalizeWebsiteHeader, orderHeaderPresentation } from "../header";
import { normalizeSiteColors } from "../site-colors";
import { normalizeDraftState } from "../state";

test("usage follows header, restaurant info, explicit menu and inherited defaults", () => {
  const header = normalizeWebsiteHeader({layout: "restaurant", color_style: "style-2", restaurant: {info_color_style: "style-4"}});
  const state = normalizeDraftState({config: {nav_layout: {header}}, pages: [
    {tmp_id: "home", type: "landing", slug: "home", title: "Home"},
    {tmp_id: "order", type: "order", slug: "menu", title: "Menu", settings: {menu_ids: [1]},
      appearance_overrides: {website_order: {color_style: "style-3"}}},
  ], sections: []});
  const palette = {color_styles: {...normalizeSiteColors({}), default: "style-5"}};
  const usage = (id: string) => siteColorUsage(state.config, state.pages, [], palette, id);
  assert.deepEqual(usage("style-2").map(value => value.parts), [["header"], ["header"]]);
  assert.deepEqual(usage("style-4").map(value => value.parts), [["info"], ["info"]]);
  assert.deepEqual(usage("style-3").map(value => value.parts), [["menu", "cart", "checkout", "confirmation"]]);
  assert.deepEqual(usage("style-5"), []);
  state.pages[1].appearance_overrides.order_header = orderHeaderPresentation(normalizeWebsiteHeader({...header, color_style: "default", restaurant: {info_enabled: false}}));
  assert.deepEqual(usage("style-5").map(value => value.parts), [["header"]]);
  assert.deepEqual(usage("style-2").map(value => value.title), ["Home"]);
  assert.deepEqual(usage("style-4").map(value => value.title), ["Home"]);
});

test("usage includes visible page sections and shared sections, excludes hidden sections", () => {
  const state = normalizeDraftState({config: {}, pages: [
    {tmp_id: "home", type: "landing", slug: "home", title: "Home"},
    {tmp_id: "about", type: "content", slug: "about", title: "About"},
  ], sections: [
    {tmp_id: "one", page_tmp_id: "home", section_type: "text", is_visible: true, settings: {color_style: "style-6"}},
    {tmp_id: "two", page_tmp_id: "about", section_type: "text", is_visible: false, settings: {color_style: "style-6"}},
  ]});
  const usage = siteColorUsage(state.config, state.pages, state.sections, {color_styles: normalizeSiteColors({})}, "style-6");
  assert.deepEqual(usage.map(value => value.title), ["Home"]);
});


test("commerce usage follows each screen assignment and inherited menu style", () => {
  const state = normalizeDraftState({config: {}, pages: [
    {tmp_id: "order", type: "order", slug: "menu", title: "Menu", settings: {menu_ids: [1]},
      appearance_overrides: {website_order: {color_style: "style-2"}, order_journey: {cart: "style-4", checkout: "style-5", confirmation: "default"}}},
  ], sections: []});
  const palette = {color_styles: normalizeSiteColors({})};
  const usage = (id: string) => siteColorUsage(state.config, state.pages, [], palette, id).flatMap(value => value.parts);
  assert.deepEqual(usage("style-2"), ["menu", "confirmation"]);
  assert.deepEqual(usage("style-4"), ["cart"]);
  assert.deepEqual(usage("style-5"), ["checkout"]);
});
