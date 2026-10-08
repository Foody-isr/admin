import { orderHeaderPresentation, resolvePageHeader } from "../header";
import test from "node:test";
import assert from "node:assert/strict";
import {
  headerFromLegacy,
  normalizeWebsiteHeader,
  headerSafeUrl,
} from "../header";

test("editing a migrated Header preserves explicit empty links, logo removal and disabled controls", () => {
  const initial = headerFromLegacy(
    {
      navbar_logo_position: "center",
      nav_layout: { links: [] },
      navbar_cta: { enabled: false },
    },
    [{ slug: "home", title: "Home", nav_visible: true, sort_order: 0 }],
    "/logo.svg",
  );
  assert.equal(initial.layout, "stacked");
  assert.equal(initial.logo.image, "/logo.svg");
  assert.deepEqual(initial.navigation.links, []);
  assert.equal(initial.button.enabled, false);
  const edited = normalizeWebsiteHeader({
    ...initial,
    logo: { ...initial.logo, image: "" },
    icons: { cart: false, search: false, color: "" },
  });
  const restored = headerFromLegacy(
    { navbar_logo_position: "left", nav_layout: { header: edited } },
    [],
    "/old-logo.svg",
  );
  assert.equal(restored.logo.image, "");
  assert.equal(restored.layout, "stacked");
  assert.equal(restored.icons.cart, false);
});
test("changing Header layout does not replace its content, links or style", () => {
  const header = normalizeWebsiteHeader({
    logo: { type: "text", text: "My restaurant" },
    navigation: {
      links: [
        {
          id: "a",
          label: "About",
          target: { kind: "page", value: "about" },
          children: [
            {
              id: "b",
              label: "Visit",
              target: { kind: "url", value: "https://example.test" },
            },
          ],
        },
      ],
    },
    background: { mode: "gradient", color: "#123456", end: "#ffffff" },
    icons: { cart: false },
  });
  const next = normalizeWebsiteHeader({ ...header, layout: "centered" });
  assert.deepEqual(next.navigation, header.navigation);
  assert.deepEqual(next.background, header.background);
  assert.deepEqual(next.logo, header.logo);
  assert.deepEqual(next.icons, header.icons);
});
test("component input normalization rejects executable media and preserves token inheritance", () => {
  const header = normalizeWebsiteHeader({
    background: { image: "javascript:alert(1)" },
    button: { color: "var(--other)" },
    logo: { size: 900 },
  });
  assert.equal(header.background.image, "");
  assert.equal(header.button.color, "");
  assert.equal(header.logo.size, 160);
  for (const value of [
    "javascript:alert(1)",
    "//example.test",
    "data:text/html,x",
    "https://example.test/\nattack",
  ])
    assert.equal(headerSafeUrl(value), "");
});

test("page changes keep nested Header targets and newly added pages connected", async () => {
  const { retargetNavigationPage, addNavigationPage, removeNavigationPage } =
    await import("../navigation-links");
  const page = {
    tmp_id: "new",
    type: "content" as const,
    slug: "new",
    title: "New",
    nav_visible: true,
    sort_order: 1,
    is_homepage: false,
    is_default: false,
    seo: {},
    settings: {},
    appearance_overrides: {},
  };
  const header = normalizeWebsiteHeader({
    logo: { link: { kind: "page", value: "old" } },
    button: { link: { kind: "page", value: "old" } },
    navigation: {
      links: [
        {
          id: "root",
          label: "Visit",
          target: { kind: "home", value: "" },
          children: [
            {
              id: "child",
              label: "About",
              target: { kind: "page", value: "old", anchor: "story" },
            },
          ],
        },
      ],
    },
  });
  const state = {
    config: { nav_layout: { header } },
    pages: [page],
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  };
  const renamed = retargetNavigationPage(state, "old", "about");
  const actual = normalizeWebsiteHeader(
    (renamed.config.nav_layout as { header: unknown }).header,
  );
  assert.equal(actual.logo.link.value, "about");
  assert.equal(actual.button.link.value, "about");
  assert.equal(actual.navigation.links[0].children?.[0].target.value, "about");
  assert.equal(actual.navigation.links[0].children?.[0].target.anchor, "story");
  const added = addNavigationPage(renamed, page);
  const links = normalizeWebsiteHeader(
    (added.config.nav_layout as { header: unknown }).header,
  ).navigation.links;
  assert.equal(links.length, 2);
  assert.equal(links[1].target.value, "new");
  assert.deepEqual(addNavigationPage(added, page), added);
  const hidden = removeNavigationPage(added, "about");
  assert.equal(
    normalizeWebsiteHeader(
      (hidden.config.nav_layout as { header: unknown }).header,
    ).navigation.links[0].children?.length,
    0,
  );
  const removed = removeNavigationPage(hidden, "new");
  assert.equal(
    normalizeWebsiteHeader(
      (removed.config.nav_layout as { header: unknown }).header,
    ).navigation.links.length,
    1,
  );
});

test("fulfillment retires saved color overrides while preserving visibility and Header styles", () => {
  for (const enabled of [true, false]) {
    const header = normalizeWebsiteHeader({
      color_style: "style-4",
      fulfillment: { enabled, background: "#ff0000" },
    });
    assert.deepEqual(header.fulfillment, { enabled, background: "" });
    assert.equal(header.color_style, "style-4");
    assert.deepEqual(normalizeWebsiteHeader(header), header);
  }
});


test("Restaurant header round-trips presentation without introducing fulfillment rules", () => {
  const header = normalizeWebsiteHeader({layout:"restaurant", restaurant:{height:"large", show_name:false, info_color_style:"style-2", show_social:false}});
  assert.equal(header.layout, "restaurant");
  assert.equal(header.restaurant.height, "large");
  assert.equal(header.restaurant.show_name, false);
  assert.equal(header.restaurant.info_color_style, "style-2");
  assert.deepEqual(normalizeWebsiteHeader(JSON.parse(JSON.stringify(header))), header);
  assert.equal(normalizeWebsiteHeader({restaurant:{height:"999px", info_color_style:"red"}}).restaurant.info_color_style, "default");
  assert.equal(normalizeWebsiteHeader({restaurant:{height:"999px"}}).restaurant.height, "medium");
});


test("order header is opt-in, presentation-only, and follows shared logo and links", () => {
  const shared = normalizeWebsiteHeader({layout: "center", logo: {image: "/one.png"},
    navigation: {links: [{id: "home", label: "Home", target: {kind: "home"}}]}});
  assert.equal(resolvePageHeader(shared, "order", {}), shared);
  const local = orderHeaderPresentation(normalizeWebsiteHeader({...shared,
    layout: "restaurant", color_style: "style-2", logo: {...shared.logo, size: 140}}));
  const appearance = {order_header: JSON.parse(JSON.stringify(local))};
  assert.equal(resolvePageHeader(shared, "content", appearance), shared);
  assert.equal(resolvePageHeader(shared, "landing", appearance), shared);
  const updated = normalizeWebsiteHeader({...shared, logo: {...shared.logo, image: "/two.png"},
    navigation: {...shared.navigation, links: [{id: "about", label: "About", target: {kind: "page", value: "about"}}]}});
  const actual = resolvePageHeader(updated, "order", appearance);
  assert.equal(actual.layout, "restaurant");
  assert.equal(actual.logo.size, 140);
  assert.equal(actual.logo.image, "/two.png");
  assert.deepEqual(actual.navigation, updated.navigation);
  assert.deepEqual(actual.fulfillment, updated.fulfillment);
  assert.equal(resolvePageHeader(updated, "order", {order_header: null}), updated);
  assert.equal(shared.layout, "center");
  assert.ok(!("navigation" in local));
  assert.ok(!("logo" in local));
  assert.ok(!("fulfillment" in local));
});

test("page overrides cannot replace shared content even with untrusted extra fields", () => {
  const shared = normalizeWebsiteHeader({layout: "left", logo: {image: "/site.png"}});
  const actual = resolvePageHeader(shared, "order", {order_header: {
    ...orderHeaderPresentation(shared), layout: "restaurant",
    logo: {image: "/other.png"}, navigation: {enabled: false},
    fulfillment: {enabled: true}, background: {mode: "image", image: "javascript:alert(1)"},
  }});
  assert.deepEqual(actual.logo, shared.logo);
  assert.deepEqual(actual.navigation, shared.navigation);
  assert.deepEqual(actual.fulfillment, shared.fulfillment);
  assert.equal(actual.background.image, "");
});


test("converting an order page retires its header override without losing other appearance", async () => {
  const {normalizeDraftState, convertPageType} = await import("../state");
  const state = normalizeDraftState({config: {}, pages: [{tmp_id: "one", type: "order", slug: "order", title: "Order",
    settings: {menu_ids: [1]}, appearance_overrides: {bg: "#112233", order_header: orderHeaderPresentation(normalizeWebsiteHeader({layout: "restaurant"}))}}], sections: []});
  const page = state.pages[0];
  for (const type of ["content", "landing", "catering"] as const) {
    const converted = convertPageType(page, type);
    assert.equal(converted.appearance_overrides.order_header, undefined);
    assert.equal(converted.appearance_overrides.bg, "#112233");
  }
  assert.equal(convertPageType(page, "order").appearance_overrides.order_header?.layout, "restaurant");
  assert.equal(page.appearance_overrides.order_header?.layout, "restaurant");
});


test("the chosen information layout stays independent of ordering permissions", async () => {
  const { restaurantInfoLayout } = await import("../header");
  for (const layout of ["modern", "classic"] as const) {
    const header = normalizeWebsiteHeader({restaurant: {info_layout: layout}});
    for (const canChoose of [true, false]) {
      assert.equal(restaurantInfoLayout(header.restaurant, canChoose), layout);
      assert.equal(restaurantInfoLayout(normalizeWebsiteHeader(JSON.parse(JSON.stringify(header))).restaurant, canChoose), layout);
    }
  }
  const legacy = normalizeWebsiteHeader({restaurant: {info_layout: "invalid"}});
  assert.equal(restaurantInfoLayout(legacy.restaurant, true), "modern");
  assert.equal(restaurantInfoLayout(legacy.restaurant, false), "classic");
});
