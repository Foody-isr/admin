import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptsInlineEdit, isEditorElement } from "../editor-elements";

const section = {
  section_type: "hero_banner",
  content: { headline: "Before" },
};

test("canvas text edits accept only a known field with the current base value", () => {
  assert.equal(
    acceptsInlineEdit(section, {
      field: "headline",
      previousValue: "Before",
      value: "After",
    }),
    true,
  );
  assert.equal(
    acceptsInlineEdit(section, {
      field: "headline",
      previousValue: "Old",
      value: "After",
    }),
    false,
  );
  assert.equal(
    acceptsInlineEdit(section, {
      field: "headline",
      previousValue: "Before",
      value: "x".repeat(10001),
    }),
    false,
  );
});

test("preview messages cannot replace media, settings, prototypes or another section's fields", () => {
  for (const field of [
    "__proto__",
    "content",
    "settings",
    "image_url",
    "body",
    "content.headline",
  ]) {
    assert.equal(
      acceptsInlineEdit(section, { field, previousValue: "", value: "After" }),
      false,
    );
  }
  assert.equal(isEditorElement("hero_banner", "image_url"), true);
  assert.equal(isEditorElement("unknown", "headline"), false);
  assert.equal(isEditorElement("__proto__", "headline"), false);
});
