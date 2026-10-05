import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDraftState } from "../state";
import {
  applyRestaurantTheme,
  RESTAURANT_THEMES,
  record,
} from "../restaurant-themes";
import { applySiteStyle, SITE_STYLES } from "../site-styles";

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
