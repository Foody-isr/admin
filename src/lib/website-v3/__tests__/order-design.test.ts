import assert from "node:assert/strict";
import { test } from "node:test";
import { compactOrderPresentation, selectOrderColorStyle } from "../order-design";

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
