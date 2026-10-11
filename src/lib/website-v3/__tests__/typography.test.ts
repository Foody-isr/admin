import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeFontLibrary, mergeTypography } from "../typography";
import type { ExtraFont } from "@/lib/api";

const font: ExtraFont = {
  family: "Eros Condensed",
  category: "custom",
  weights: [300, 400],
  supportsHebrew: false,
  faces: [
    { url: "https://example.test/light.otf", weight: 300 },
    { url: "https://example.test/regular.otf", weight: 400 },
  ],
};

test("page text edits retain the site's font sources, roles and size", () => {
  const base = {
    roles: {
      categoryTitle: { font: font.family, sizeMult: 3, weight: 400 },
      itemName: { font: "Montserrat" },
    },
    extraFonts: [font],
  };
  const before = structuredClone(base);
  const result = mergeTypography(base, {
    roles: { categoryTitle: { sizeMult: 2 } },
  });
  assert.deepEqual(result.roles?.categoryTitle, {
    font: font.family,
    sizeMult: 2,
    weight: 400,
  });
  assert.deepEqual(result.extraFonts, [font]);
  assert.deepEqual(result.roles?.itemName, base.roles.itemName);
  assert.deepEqual(base, before);
});

test("importing a variant keeps existing files and avoids duplicate families", () => {
  const result = mergeFontLibrary(
    [font],
    [
      {
        ...font,
        weights: [700],
        faces: [{ url: "https://example.test/bold.otf", weight: 700 }],
      },
    ],
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].weights, [300, 400, 700]);
  assert.equal(result[0].faces?.length, 3);
  assert.deepEqual(mergeFontLibrary(result, [font]), result);
});


test("resetting a page font or weight immediately restores the site values", () => {
  const base = {roles: {categoryTitle: {font: font.family, weight: 300}}};
  assert.deepEqual(mergeTypography(base, {roles: {categoryTitle: {font: undefined, weight: undefined}}}).roles, base.roles);
});
