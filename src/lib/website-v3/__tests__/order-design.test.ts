import assert from "node:assert/strict";
import { test } from "node:test";
import { selectOrderColorStyle } from "../order-design";

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
