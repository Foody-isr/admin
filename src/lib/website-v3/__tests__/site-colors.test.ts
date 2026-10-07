import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeSiteColors,
  resolveSiteColorStyle,
  colorContrast,
  siteColorVariables,
  siteHex,
} from "../site-colors";
const palette = {
  bg: "#ffffff",
  ink: "#000000",
  accent: "#264a3c",
  surface: "#f3f2ef",
  secondary_colors: ["#ffcc00", "#4d4d4d"],
};
test("six stable styles inherit the default and reject CSS expressions", () => {
  const colors = normalizeSiteColors(palette);
  assert.equal(colors.styles.length, 6);
  assert.equal(resolveSiteColorStyle(palette), undefined);
  assert.equal(siteHex("url(evil)", "#ffffff"), "#ffffff");
  assert.equal(siteHex("#abc"), "#aabbcc");
  const config = {
    ...palette,
    color_styles: { ...colors, default: "style-2" },
  };
  assert.equal(resolveSiteColorStyle(config)?.id, "style-2");
  assert.equal(resolveSiteColorStyle(config, "light")?.id, "style-3");
  assert.equal(resolveSiteColorStyle(config, "dark")?.id, "style-5");
  assert.equal(resolveSiteColorStyle(config, "style-1")?.background, "#ffffff");
  assert.equal(
    siteColorVariables(resolveSiteColorStyle(config)!)["--brand"],
    colors.styles[1].solid_button,
  );
});
test("background edits repair unreadable title, paragraph and outline colors", () => {
  const colors = normalizeSiteColors(palette);
  const edited = normalizeSiteColors({
    ...palette,
    color_styles: {
      ...colors,
      styles: colors.styles.map((s) => ({
        ...s,
        background: "#000000",
        title: "#000000",
        paragraph: "#111111",
        outline_button: "#000000",
      })),
    },
  });
  for (const s of edited.styles)
    for (const role of ["title", "paragraph", "outline_button"] as const)
      assert.ok(colorContrast(s[role], s.background) >= 3);
  assert.equal(colorContrast("#000000", "#ffffff"), 21);
  assert.deepEqual(
    normalizeSiteColors({ ...palette, color_styles: edited }),
    edited,
  );
});
