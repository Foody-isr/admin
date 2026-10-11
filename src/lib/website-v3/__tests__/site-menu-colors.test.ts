import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeSiteColors,
  normalizeSiteMenuColors,
  resolveSiteMenuColors,
  siteMenuColorVariables,
  siteMenuColorReference,
  siteColorVariables,
} from "../site-colors";

const base = normalizeSiteColors({
  bg: "#ffffff",
  ink: "#111111",
  accent: "#e77a40",
}).styles[0];
const mamie = {
  ...base,
  menu: {
    background: "#de5228",
    heading: "#ffffff",
    bar_background: "#6d1f13",
    category_text: "#ffffff",
    pill_background: "transparent",
    active_background: "#ffffff",
    active_text: "#6d1f13",
    card_background: "#6d1f13",
    card_title: "#ffffff",
    card_price: "#dfc65b",
    card_description: "#cfb4a9",
  },
};

test("one global style represents Mamie's independent menu surfaces without recoloring generic sections", () => {
  const menu = resolveSiteMenuColors(mamie);
  assert.equal(menu.background, "#de5228");
  assert.equal(menu.bar_background, "#6d1f13");
  assert.equal(menu.active_background, "#ffffff");
  assert.equal(menu.active_text, "#6d1f13");
  assert.equal(menu.card_title, "#ffffff");
  assert.equal(menu.card_price, "#dfc65b");
  assert.equal(menu.card_description, "#cfb4a9");
  assert.deepEqual(siteColorVariables(mamie), siteColorVariables(base));
  assert.equal(
    siteMenuColorVariables(mamie)["--site-menu-card-price"],
    "#dfc65b",
  );
});

test("inherited foregrounds stay authored when menu surfaces change", () => {
  const style = {
    ...base,
    menu: { card_background: "#6d1f13", bar_background: "#6d1f13" },
  };
  const first = resolveSiteMenuColors(style);
  assert.equal(first.card_title, base.title);
  assert.equal(first.card_price, first.card_title);
  assert.equal(first.category_text, base.paragraph);
  assert.equal(first.card_description, base.paragraph);
  const second = resolveSiteMenuColors({
    ...style,
    solid_button: "#ccaa00",
    menu: { ...style.menu, card_title: "#dfc65b" },
  });
  assert.equal(second.card_price, "#dfc65b");
  assert.equal(second.active_background, "#ccaa00");
  assert.equal(second.background, "#ffffff");
});

test("sparse saved overrides round trip and removing a role restores live automatic behavior", () => {
  const palette = { color_styles: { default: base.id, styles: [mamie] } };
  const saved = normalizeSiteColors(palette);
  assert.deepEqual(saved.styles[0].menu, mamie.menu);
  assert.deepEqual(normalizeSiteColors({ color_styles: saved }), saved);
  const reset = { ...mamie.menu };
  delete (reset as Partial<typeof reset>).card_price;
  const restored = resolveSiteMenuColors({
    ...mamie,
    menu: { ...reset, card_title: "#aaffaa" },
  });
  assert.equal(restored.card_price, "#aaffaa");
  assert.equal(restored.card_description, mamie.menu.card_description);
});

test("menu overrides reject CSS expressions and unknown keys but retain explicitly authored text", () => {
  assert.deepEqual(
    normalizeSiteMenuColors({
      background: "url(evil)",
      heading: "transparent",
      bar_background: "#abc",
      active_background: "transparent",
      card_background: "transparent",
      card_title: "#000000",
      surprise: "#112233",
      card_price: "var(--price)",
    }),
    {
      bar_background: "#aabbcc",
      active_background: "transparent",
      card_background: "transparent",
      card_title: "#000000",
    },
  );
  assert.equal(
    resolveSiteMenuColors({
      ...base,
      menu: { card_background: "#000000", card_title: "#000000" },
    }).card_title,
    "#000000",
  );
});

test("all menu roles use one style reference and follow a later site default change", () => {
  assert.equal(
    siteMenuColorReference("style-2")["--site-menu-card-background"],
    "var(--style-2-menu-card-background)",
  );
  assert.equal(
    siteMenuColorReference("default")["--site-menu-card-price"],
    "var(--site-default-menu-card-price)",
  );
  assert.equal(
    siteMenuColorReference("custom")["--site-menu-background"],
    "var(--site-default-menu-background)",
  );
});
