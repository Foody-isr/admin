import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptsInlineEdit, isEditorElement, editorElementContentPath } from "../editor-elements";

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

test("campaign canvas fields target only an existing bounded slide and retain stale-edit protection", () => {
  const campaign={section_type:"hero_banner",content:{slides:[{headline:"Slide one"},{headline:"Slide two"}]}};
  assert.deepEqual(editorElementContentPath("hero_banner","slides.1.headline"),["slides",1,"headline"]);
  assert.equal(acceptsInlineEdit(campaign,{field:"slides.1.headline",previousValue:"Slide two",value:"Updated"}),true);
  assert.equal(acceptsInlineEdit(campaign,{field:"slides.1.headline",previousValue:"Old",value:"Updated"}),false);
  for (const field of ["slides.6.headline","slides.-1.headline","slides.0.__proto__","slides.0.image_url","slides.5.headline"]) {
    assert.equal(acceptsInlineEdit(campaign,{field,previousValue:"",value:"Changed"}),false);
  }
  assert.equal(isEditorElement("text","slides.1.headline"),false);
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
