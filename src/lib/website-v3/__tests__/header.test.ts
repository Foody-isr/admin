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
