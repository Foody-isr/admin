import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDraftState } from "../state";
import {
  applyRestaurantTheme,
  RESTAURANT_THEMES,
  record,
} from "../restaurant-themes";
import { applySitePalette, applySiteStyle, SITE_STYLES } from "../site-styles";

test("every Aa remix preserves a theme's complete composition and commerce bindings", () => {
  let id = 0;
  const initial = normalizeDraftState({
    config: {},
    pages: [
      {
        id: 1,
        type: "landing",
        title: "Home",
        slug: "home",
        is_homepage: true,
      },
      {
        id: 2,
        type: "order",
        title: "Order",
        slug: "order",
        is_default: true,
        settings: { menu_ids: [17] },
      },
    ],
    sections: [],
  });
  for (const theme of RESTAURANT_THEMES) {
    const composed = applyRestaurantTheme(initial, theme, {
      compose: true,
      allPages: true,
      orderingOnly: false,
      title: "Restaurant",
      description: "Our story",
      image: "/restaurant.jpg",
      cta: "Order",
      createId: () => `s-${++id}`,
    });
    const before = structuredClone(composed);
    for (const style of SITE_STYLES) {
      const next = applySiteStyle(composed, style);
      assert.deepEqual(
        next.pages.map(({ appearance_overrides, ...page }) => page),
        composed.pages.map(({ appearance_overrides, ...page }) => page),
      );
      assert.deepEqual(
        next.sections.map(({ settings, ...section }) => section),
        composed.sections.map(({ settings, ...section }) => section),
      );
      assert.deepEqual(next.config.nav_layout, composed.config.nav_layout);
      for (const key of [
        "navbar_logo_position",
        "navbar_style",
        "navbar_show_links",
        "hide_navbar_name",
        "logo_size",
        "checkout_config",
      ])
        assert.deepEqual(next.config[key], composed.config[key]);
      assert.equal(
        record(next.config.navbar_cta).link,
        record(composed.config.navbar_cta).link,
      );
      assert.equal(
        record(record(next.config.typography).site).template,
        theme.id,
      );
      assert.equal(
        record(record(next.config.typography).site).headingFont,
        style.heading,
      );
      assert.deepEqual(
        next.sections.map((s) => s.settings.theme_layout),
        composed.sections.map((s) => s.settings.theme_layout),
      );
    }
    assert.deepEqual(composed, before);
  }
});

test("site styles keep page-local navigation geometry and hidden fields", () => {
  const before = normalizeDraftState({
    config: {},
    pages: [
      {
        id: 1,
        type: "order",
        title: "Order",
        slug: "order",
        is_homepage: true,
        appearance_overrides: {
          navbar_logo_position: "center",
          navigation_mode: "hidden",
          cover_url: "/cover.jpg",
          category_navigation: { mode: "sidebar" },
          typography: { site: { headingFont: "Old", template: "keep" } },
        },
      },
    ],
    sections: [
      {
        id: 4,
        page_id: 1,
        section_type: "hero_banner",
        layout: "split",
        content: { image_url: "/photo.jpg" },
        settings: {
          show_headline: false,
          height: "tall",
          theme_layout: "joy-bakery",
        },
      },
    ],
  });
  const next = applySiteStyle(before, SITE_STYLES[0]);
  assert.equal(next.pages[0].appearance_overrides.navigation_mode, "hidden");
  assert.equal(
    next.pages[0].appearance_overrides.navbar_logo_position,
    "center",
  );
  assert.equal(next.sections[0].settings.show_headline, false);
  assert.equal(next.sections[0].settings.height, "tall");
});

test("Aa remixes recolor filled buttons even when the old ink and accent were identical", () => {
  const state = normalizeDraftState({
    config: {
      custom_palette: {
        bg: "#fff",
        surface: "#eee",
        ink: "#000000",
        accent: "#000000",
      },
      navbar_overlay_text_color: "#000000",
      navbar_cta: {
        link: "/order",
        solid: { variant: "filled", bg: "#000000", text_color: "#fff" },
      },
    },
    pages: [],
    sections: [],
  });
  const electric = applySiteStyle(
    state,
    SITE_STYLES.find((s) => s.id === "electric")!,
  );
  assert.equal(record(record(electric.config.navbar_cta).solid).bg, "#0000ff");
  const dark = applySiteStyle(
    state,
    SITE_STYLES.find((s) => s.id === "warm")!,
  );
  assert.equal(dark.config.navbar_overlay_text_color, "#ffffdd");
  const lightButton = applySiteStyle(
    state,
    SITE_STYLES.find((s) => s.id === "editorial")!,
  );
  assert.equal(
    record(record(lightButton.config.navbar_cta).solid).text_color,
    "#111111",
  );
});


test("brand edits repair inherited CTA colors on every page without replacing custom colors or composition", () => {
  const before = normalizeDraftState({
    config: {
      typography: { site: { style: "ochre", headingFont: "Dela Gothic One" } },
      custom_palette: { mode: "light", bg: "#f3f2ef", surface: "#ffffff", ink: "#171717", accent: "#de5428" },
      navbar_cta: { link: "/order", solid: { bg: "#956600", text_color: "#ffffff" } },
    },
    pages: [{ id: 1, type: "landing", slug: "home", appearance_overrides: {
      navbar_cta: { solid: { bg: "#de5428", text_color: "#ffffff" } },
      section_colors: { hero: { accent: "#DE5428" } },
      website_order: { background: "#123456" },
    } }],
    sections: [{ id: 1, page_id: 1, section_type: "text_and_image", layout: "split", content: { title: "Keep me" },
      settings: { cta_bg_color: "#de5428", custom_bg: "#de5428", custom_text: "#123456" } }],
  });
  const snapshot = structuredClone(before);
  const next = applySitePalette(before, { mode: "light", bg: "#f3f2ef", surface: "#ffffff", ink: "#171717", accent: "#ffeeaa" });
  assert.deepEqual(before, snapshot);
  assert.equal(record(record(next.config.navbar_cta).solid).bg, "#ffeeaa");
  assert.equal(record(record(next.config.navbar_cta).solid).text_color, "#111111");
  assert.equal(record(record(next.pages[0].appearance_overrides.navbar_cta).solid).bg, "#ffeeaa");
  assert.equal(record(record(next.pages[0].appearance_overrides.section_colors).hero).accent, "#ffeeaa");
  assert.equal(record(next.pages[0].appearance_overrides.website_order).background, "#123456");
  assert.equal(next.sections[0].settings.custom_bg, "#ffeeaa");
  assert.equal(next.sections[0].settings.custom_text, "#123456");
  assert.deepEqual(next.sections[0].content, before.sections[0].content);
  assert.equal(next.sections[0].layout, "split");
  assert.deepEqual(next.config.typography, before.config.typography);
});


test("a site preset resets shared styles and section color overrides while retaining authored content", () => {
 const state = normalizeDraftState({config: {custom_palette: {bg: "#fff", color_styles: {default: "style-2"}}}, pages: [{id: 1, type: "landing", title: "Home", slug: "home", is_homepage: true}], sections: [{id: 1, page: "home", page_id: 1, section_type: "text", content: {headline: "Keep this"}, settings: {color_style: "custom", custom_bg: "#ff0000", headline_color: "#0000ff", bg_image: "/keep.jpg"}}]});
 const next = applySiteStyle(state, SITE_STYLES[0]);
 assert.equal(record(record(next.config.custom_palette).color_styles).default, "style-1");
 assert.equal(next.sections[0].settings.color_style, "default");
 assert.equal(next.sections[0].settings.custom_bg, undefined);
 assert.equal(next.sections[0].settings.headline_color, undefined);
 assert.equal(next.sections[0].settings.bg_image, "/keep.jpg");
 assert.deepEqual(next.sections[0].content, state.sections[0].content);
});
