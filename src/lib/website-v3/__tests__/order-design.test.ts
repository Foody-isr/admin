import assert from "node:assert/strict";
import { test } from "node:test";
import { compactOrderPresentation, selectOrderColorStyle, woltOrderPresentation } from "../order-design";
import { normalizeDraftState, updateWebsitePageAtPath } from "../state";
import { pageKey } from "../types";

test("the order mode step is saved for just the edited order page", () => {
  const draft = normalizeDraftState({ pages: [
    { id: 1, slug: "order", title: "Order", type: "order", is_default: true, appearance_overrides: { website_order: { prompt_on_entry: false, layout: "list" } } },
    { id: 2, slug: "weekend", title: "Weekend", type: "order", appearance_overrides: { website_order: { layout: "grid" } } },
  ] });
  const path = ["appearance_overrides", "website_order", "choose_before_menu"];
  const saved = updateWebsitePageAtPath(draft, pageKey(draft.pages[0]), path, true);
  const reloaded = normalizeDraftState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reloaded.pages[0].appearance_overrides.website_order, { prompt_on_entry: false, layout: "list", choose_before_menu: true });
  assert.deepEqual(reloaded.pages[1].appearance_overrides.website_order, { layout: "grid" });
});

test("selecting a shared style removes the competing background without changing layout or child references", () => {
  const value = {
    color_style: "default",
    background_kind: "color",
    background: "#de5228",
    card_color_style: "style-4",
    category_color_style: "style-5",
    columns: 3,
  };
  const before = structuredClone(value);
  assert.deepEqual(selectOrderColorStyle(value, "style-5"), {
    ...value,
    color_style: "style-5",
    color_preset: "site",
    background_kind: "style",
  });
  assert.deepEqual(value, before);
});

test("compact menu presentation changes layout while preserving colors and ordering preferences", () => {
  const source = {
    color_style: "style-5", card_price_color: "#00aacc", columns: 3,
    show_banner: false, prompt_on_entry: false, show_availability_filter: false,
    item_image_frames: { "7": { x: 20 } }, item_layout: "cover",
  };
  const before = structuredClone(source);
  const result = compactOrderPresentation(source);
  assert.deepEqual(source, before);
  for (const [key, value] of Object.entries(source)) assert.deepEqual(result[key], value);
  assert.equal(result.layout, "rows");
  assert.equal(result.card_border, "separator");
  assert.equal(result.image_position, "right");
  assert.equal(result.image_ratio, "wide");
  assert.equal(result.show_descriptions, true);
  assert.equal(result.category_shape, "underline");
  assert.deepEqual(compactOrderPresentation(result), result);
});

test("Wolt presentation replaces conflicting card geometry and makes category titles visible, without changing site colors or ordering", () => {
  const source = { layout: "list", card_style: "filled", card_radius: "rounded", card_border: "line", color_style: "style-1", show_category_titles: false, prompt_on_entry: false, show_fulfillment: false, columns: 3 };
  const before = structuredClone(source);
  const result = woltOrderPresentation(source);
  assert.deepEqual(source, before);
  assert.equal(result.card_style, "plain");
  assert.equal(result.card_radius, "square");
  assert.equal(result.card_border, "separator");
  assert.equal(result.color_preset, "wolt");
  assert.equal(result.color_style, source.color_style);
  assert.equal(result.show_category_titles, true);
  assert.equal(result.prompt_on_entry, false);
  assert.equal(result.show_fulfillment, false);
  assert.equal(result.columns, 3);
  assert.deepEqual(woltOrderPresentation(result), result);
  assert.equal(selectOrderColorStyle(result, "style-2").color_preset, "site");
});
