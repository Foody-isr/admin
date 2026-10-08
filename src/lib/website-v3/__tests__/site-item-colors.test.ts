import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeSiteColors,
  resolveSiteItemColors,
  normalizeSiteItemColors,
} from "../site-colors";
import { normalizeDraftState } from "../state";
import { previousItemPresentation } from "../order-design";

test("item details inherit cards and site buttons while authored roles remain independent", () => {
  const palette = {
    color_styles: {
      styles: [
        {
          id: "style-2",
          background: "#de5228",
          solid_button: "#dfc65b",
          menu: {
            card_background: "#6d1f13",
            card_title: "#ffffff",
            card_price: "#dfc65b",
            card_description: "#cfb4a9",
          },
        },
      ],
    },
  };
  const style = normalizeSiteColors(palette).styles[1];
  const inherited = resolveSiteItemColors(style);
  assert.equal(inherited.background, "#6d1f13");
  assert.equal(inherited.title, "#ffffff");
  assert.equal(inherited.price, "#dfc65b");
  assert.equal(inherited.description, "#cfb4a9");
  assert.equal(inherited.button_background, "#dfc65b");
  const edited = {
    ...style,
    item_detail: {
      price: "#ffcc00",
      options_background: "#ffffff",
      selection_background: "#111111",
      button_background: "#000000",
    },
  };
  const colors = resolveSiteItemColors(edited);
  assert.equal(colors.price, "#ffcc00");
  assert.equal(colors.options_text, "#111111");
  assert.equal(colors.selection_text, "#ffffff");
  assert.equal(colors.button_text, "#ffffff");
  assert.deepEqual(style.menu, normalizeSiteColors(palette).styles[1].menu);
  assert.equal(
    resolveSiteItemColors({
      ...edited,
      item_detail: { ...edited.item_detail, price: undefined },
    }).price,
    "#dfc65b",
  );
});

test("detail roles reject unknown keys, transparency and CSS and survive draft normalization", () => {
  assert.deepEqual(
    normalizeSiteItemColors({
      title: "url(evil)",
      background: "transparent",
      price: "#abc",
      unknown: "#ffffff",
    }),
    { price: "#aabbcc" },
  );
  const colors = normalizeSiteColors({
    color_styles: {
      styles: [
        {
          id: "style-3",
          item_detail: { price: "#004433", button_text: "#ffffff" },
        },
      ],
    },
  });
  const state = normalizeDraftState({
    config: { custom_palette: { color_styles: colors } },
    pages: [
      {
        id: 1,
        type: "order",
        slug: "order",
        title: "Menu",
        settings: { menu_ids: [4] },
        appearance_overrides: {
          website_order: {
            item_color_style: "style-3",
            item_layout: "cover",
            item_radius: "rounded",
            item_width: "compact",
          },
        },
      },
    ],
    sections: [],
  });
  const restored = normalizeDraftState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.config.custom_palette, state.config.custom_palette);
  assert.deepEqual(
    restored.pages[0].appearance_overrides,
    state.pages[0].appearance_overrides,
  );
});

test("restoring the old sheet only changes presentation and keeps assigned colors and commerce settings", () => {
  const before = {
    color_style: "style-2",
    item_color_style: "style-4",
    prompt_on_entry: false,
    item_image_fit: "contain",
  };
  const restored = previousItemPresentation(before);
  assert.equal(restored.item_width, "compact");
  assert.equal(restored.item_layout, "cover");
  assert.equal(restored.item_radius, "rounded");
  assert.equal(restored.item_image_fit, "cover");
  assert.equal(restored.item_color_style, "style-4");
  assert.equal(restored.prompt_on_entry, false);
  assert.equal(before.item_image_fit, "contain");
  assert.deepEqual(previousItemPresentation(restored), restored);
});
