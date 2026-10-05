import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRestaurantTheme,
  RESTAURANT_THEMES,
  record,
} from "../restaurant-themes";
import { normalizeDraftState } from "../state";
import { recordDraftEdit, travelDraftHistory } from "../history";
const state = () =>
  normalizeDraftState({
    config: {
      typography: { roles: { itemPrice: { weight: 700 } } },
      checkout_config: { pickup: true },
    },
    pages: [
      {
        id: 1,
        type: "landing",
        title: "Home",
        slug: "home",
        is_homepage: true,
        appearance_overrides: {
          bg: "#abc",
          navbar_color: "#123",
          foody_renderer_version: 1,
        },
      },
      {
        id: 2,
        type: "order",
        title: "Order",
        slug: "order",
        is_default: true,
        settings: { menu_ids: [17] },
        appearance_overrides: { checkout: { show_notes: true } },
      },
    ],
    sections: [
      {
        id: 8,
        page_id: 1,
        page: "home",
        section_type: "hero_banner",
        is_visible: true,
        sort_order: 0,
        layout: "centered",
        content: {
          headline: "Original",
          cta_link: "/order",
          image_url: "/restaurant.jpg",
        },
        settings: { headline_font: "Custom", custom_bg: "#123" },
      },
    ],
  });
let id = 0;
const options = {
  allPages: false,
  compose: false,
  orderingOnly: false,
  title: "Restaurant",
  description: "Kitchen",
  image: "/photo.jpg",
  cta: "Order",
  createId: () => `section-${++id}`,
};
test("style preview preserves the original draft, page overrides and commerce contracts", () => {
  const before = state(),
    copy = structuredClone(before),
    next = applyRestaurantTheme(before, RESTAURANT_THEMES[0], options);
  assert.deepEqual(before, copy);
  assert.deepEqual(next.pages, before.pages);
  assert.deepEqual(next.sections, before.sections);
  assert.deepEqual(next.config.checkout_config, before.config.checkout_config);
  assert.deepEqual(
    record(next.config.typography).roles,
    record(before.config.typography).roles,
  );
});
test("explicit inheritance removes visual overrides while keeping content, identity and operational settings", () => {
  const before = state(),
    next = applyRestaurantTheme(before, RESTAURANT_THEMES[2], {
      ...options,
      allPages: true,
    });
  assert.equal(next.pages[0].appearance_overrides.bg, undefined);
  assert.equal(next.pages[0].appearance_overrides.navbar_color, undefined);
  assert.equal(next.pages[0].appearance_overrides.foody_renderer_version, 1);
  assert.deepEqual(next.pages[1].settings, { menu_ids: [17] });
  assert.deepEqual(
    next.pages[1].appearance_overrides,
    before.pages[1].appearance_overrides,
  );
  assert.deepEqual(next.sections[0].content, before.sections[0].content);
  assert.equal(next.sections[0].id, 8);
  assert.equal(next.sections[0].settings.headline_font, undefined);
});
test("compositions reuse existing sections and stay idempotent", () => {
  for (const theme of RESTAURANT_THEMES) {
    const next = applyRestaurantTheme(state(), theme, {
      ...options,
      compose: true,
    });
    const again = applyRestaurantTheme(next, theme, {
      ...options,
      compose: true,
    });
    assert.deepEqual(next, again);
    assert.equal(
      next.sections.find((s) => s.id === 8)?.content.headline,
      "Original",
    );
    assert.equal(
      next.sections.filter(
        (s) => s.section_type === "hero_banner" && s.page_id === 1,
      ).length,
      1,
    );
    assert.equal(
      new Set(next.sections.map((s) => s.id ?? s.tmp_id)).size,
      next.sections.length,
    );
  }
});
test("ordering themes move the homepage without deleting editorial pages or menu links", () => {
  const before = state(),
    next = applyRestaurantTheme(before, RESTAURANT_THEMES[0], {
      ...options,
      orderingOnly: true,
    });
  assert.equal(next.pages.length, 2);
  assert.equal(next.pages.find((p) => p.is_homepage)?.id, 2);
  assert.deepEqual(next.sections, before.sections);
  assert.deepEqual(next.pages[1].settings, before.pages[1].settings);
});
test("switching back to a theme restores its retired sections without duplicating content", () => {
  const mediterranean = applyRestaurantTheme(state(), RESTAURANT_THEMES[0], {
    ...options,
    compose: true,
  });
  const originalText = mediterranean.sections.find(
    (section) => section.page_id === 1 && section.section_type === "text",
  )!;
  const youngsPlace = applyRestaurantTheme(
    mediterranean,
    RESTAURANT_THEMES[2],
    { ...options, compose: true },
  );
  assert.equal(
    youngsPlace.sections.find(
      (section) => section.tmp_id === originalText.tmp_id,
    )?.is_visible,
    false,
  );
  const restored = applyRestaurantTheme(youngsPlace, RESTAURANT_THEMES[0], {
    ...options,
    compose: true,
  });
  assert.equal(
    restored.sections.find((section) => section.tmp_id === originalText.tmp_id)
      ?.is_visible,
    true,
  );
  assert.deepEqual(
    restored.sections.find((section) => section.tmp_id === originalText.tmp_id)
      ?.content,
    originalText.content,
  );
});
test("theme changes are one undoable transaction and new edits invalidate redo", () => {
  const before = state(),
    after = applyRestaurantTheme(before, RESTAURANT_THEMES[0], {
      ...options,
      compose: true,
    });
  const history = recordDraftEdit({ past: [], future: [] }, before, after);
  const undone = travelDraftHistory(history, after, "undo")!;
  assert.deepEqual(undone.state, before);
  const redone = travelDraftHistory(undone.history, before, "redo")!;
  assert.deepEqual(redone.state, after);
  assert.equal(
    recordDraftEdit(undone.history, before, {
      ...before,
      config: { brand_color: "#123" },
    }).future.length,
    0,
  );
});

test("composing a theme reuses the shared footer and keeps photo text readable", () => {
  const before = state();
  before.sections.push({
    id: 40,
    section_type: "footer",
    page: "_site",
    sort_order: 0,
    is_visible: true,
    layout: "columns",
    content: { show_hours: true },
    settings: {},
  });
  const next = applyRestaurantTheme(before, RESTAURANT_THEMES[0], {
    ...options,
    compose: true,
  });
  assert.equal(
    next.sections.filter((section) => section.section_type === "footer").length,
    1,
  );
  assert.equal(
    next.sections.find((section) => section.id === 40)?.page,
    "_site",
  );
  assert.equal(
    next.sections.find((section) => section.id === 8)?.settings.inset_ink,
    RESTAURANT_THEMES[0].ink,
  );
  const split = applyRestaurantTheme(next, RESTAURANT_THEMES[1], {
    ...options,
    compose: true,
  });
  assert.equal(
    split.sections.find((section) => section.id === 8)?.settings.headline_color,
    undefined,
  );
});

test("restaurant themes have distinct multipage blueprints and only three single-order variants", () => {
  assert.deepEqual(
    RESTAURANT_THEMES.filter((theme) => theme.ordering).map(
      (theme) => theme.id,
    ),
    ["mediterranean", "leaf-lemon", "youngs-place"],
  );
  const theme = RESTAURANT_THEMES.find((theme) => theme.id === "youngs-place")!;
  const next = applyRestaurantTheme(state(), theme, {
    ...options,
    compose: true,
  });
  assert.equal(
    next.sections.filter(
      (section) =>
        section.page_id === 1 && section.section_type === "scrolling_text",
    ).length,
    3,
  );
  assert.ok(next.pages.some((page) => page.slug === "locations"));
  assert.ok(next.pages.some((page) => page.slug === "menu"));
});
test("switching modes restores an editorial homepage and keeps ordering contracts", () => {
  const original = state();
  const single = applyRestaurantTheme(original, RESTAURANT_THEMES[0], {
    ...options,
    orderingOnly: true,
  });
  assert.equal(record(single.config.nav_layout).site_mode, "single_order");
  const multi = applyRestaurantTheme(single, RESTAURANT_THEMES[0], {
    ...options,
    compose: true,
  });
  assert.equal(record(multi.config.nav_layout).site_mode, "multi_page");
  assert.equal(multi.pages.find((page) => page.is_homepage)?.id, 1);
  assert.deepEqual(
    multi.pages.find((page) => page.id === 2)?.settings,
    original.pages[1].settings,
  );
  assert.deepEqual(
    applyRestaurantTheme(multi, RESTAURANT_THEMES[0], {
      ...options,
      compose: true,
    }),
    multi,
  );
});

test("theme footer is shared and retired blocks are retained outside the visible composition", () => {
  const before = state();
  before.sections.push({
    ...before.sections[0],
    id: 88,
    section_type: "promo_banner",
  });
  const next = applyRestaurantTheme(before, RESTAURANT_THEMES[0], {
    ...options,
    compose: true,
  });
  const footer = next.sections.find(
    (section) => section.section_type === "footer",
  )!;
  assert.equal(footer.page, "_site");
  assert.equal(footer.page_id, undefined);
  assert.equal(
    next.sections.find((section) => section.id === 88)?.is_visible,
    false,
  );
  assert.deepEqual(
    next.sections.find((section) => section.id === 88)?.content,
    before.sections[1].content,
  );
});
