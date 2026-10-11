import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOrderJourneyColors, orderJourneyColorStyle } from "../order-journey";
import { normalizeDraftState } from "../state";

test("screen styles survive a saved-draft round trip without changing forms or the menu", () => {
  const draft = normalizeDraftState({config: {checkout_config: {pickup: {require_auth: false, fields: []}}}, pages: [
    {tmp_id: "order", type: "order", slug: "menu", title: "Menu", settings: {menu_ids: [1]},
      appearance_overrides: {website_order: {color_style: "style-2"}, order_journey: {cart: "style-3", checkout: "style-5", confirmation: "default"}}},
  ], sections: []});
  const saved = normalizeDraftState(JSON.parse(JSON.stringify(draft)));
  const appearance = saved.pages[0].appearance_overrides;
  assert.deepEqual(appearance.order_journey, {cart: "style-3", checkout: "style-5", confirmation: "default"});
  assert.deepEqual(saved.config.checkout_config, draft.config.checkout_config);
  assert.equal(appearance.website_order?.color_style, "style-2");
  assert.equal(orderJourneyColorStyle(appearance.order_journey, "confirmation", "style-2"), "style-2");
});

test("only shared style references are accepted, and invalid values inherit", () => {
  for (const value of [null, [], "red", {cart: "#ffffff", checkout: "style-7", confirmation: {color: "red"}}]) {
    assert.deepEqual(normalizeOrderJourneyColors(value), {});
    assert.equal(orderJourneyColorStyle(value, "checkout", "style-4"), "style-4");
  }
});
