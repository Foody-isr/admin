import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INSPECTOR_GROUP_SCOPES,
  effectiveSurface,
  showsInspectorGroup,
  surfacesForPageType,
  visibleInspectorGroups,
  type InspectorGroupId,
  type InspectorSurface,
  type InspectorTab,
} from "../inspector-scope";
import type { WebsitePageType } from "../types";

const PAGE_TYPES: readonly WebsitePageType[] = [
  "landing",
  "content",
  "order",
  "catering",
];
const TABS: readonly InspectorTab[] = ["content", "appearance", "settings"];

// ─── The bug, expressed ──────────────────────────────────────────────────────
// Before this table, the checkout surface of an order page showed the cart
// colours, the category bar, the cover image and the order-type selector — none
// of which the /order/checkout route renders — while the page surface showed
// the checkout text colours, which it does not render either.

test("the checkout surface of an order page owns only checkout appearance", () => {
  assert.deepEqual(
    visibleInspectorGroups({
      pageType: "order",
      tab: "appearance",
      surface: "checkout",
    }),
    ["checkout.text_colors", "page.handoff"],
  );
});

test("the page surface of an order page keeps the cart and drops the checkout", () => {
  const groups = visibleInspectorGroups({
    pageType: "order",
    tab: "appearance",
    surface: "page",
  });

  assert.deepEqual(groups, [
    "page.theme",
    "page.typography",
    "page.quick_colors",
    "page.fonts",
    "cart.text",
    "cart.surfaces",
    "cart.buttons",
    "page.category_bar",
    "page.cover",
    "page.order_type_selector",
    "page.catalog",
    "page.category_visuals",
  ]);
  assert.equal(groups.includes("checkout.text_colors"), false);
  assert.equal(groups.includes("page.handoff"), false);
});

test("the checkout surface swaps the page settings for the checkout form", () => {
  assert.deepEqual(
    visibleInspectorGroups({
      pageType: "order",
      tab: "settings",
      surface: "checkout",
    }),
    ["checkout.form", "page.handoff"],
  );
  assert.deepEqual(
    visibleInspectorGroups({
      pageType: "order",
      tab: "settings",
      surface: "page",
    }),
    [
      "page.address",
      "page.commerce",
      "page.navigation",
      "page.order_info",
      "page.seo",
    ],
  );
});

test("the checkout surface owns no page content", () => {
  assert.deepEqual(
    visibleInspectorGroups({
      pageType: "order",
      tab: "content",
      surface: "checkout",
    }),
    ["page.handoff"],
  );
});

// ─── Page-type gating ────────────────────────────────────────────────────────

test("commerce-only appearance never reaches landing or content pages", () => {
  for (const pageType of ["landing", "content"] as const) {
    assert.deepEqual(
      visibleInspectorGroups({ pageType, tab: "appearance", surface: "page" }),
      ["page.theme", "page.typography", "page.quick_colors", "page.fonts"],
      pageType,
    );
  }
});

test("catering pages keep the cover but no order-only appearance", () => {
  assert.deepEqual(
    visibleInspectorGroups({
      pageType: "catering",
      tab: "appearance",
      surface: "page",
    }),
    [
      "page.theme",
      "page.typography",
      "page.quick_colors",
      "page.fonts",
      "page.cover",
    ],
  );
});

test("only commerce pages expose the commerce settings group", () => {
  const exposes = (pageType: WebsitePageType) =>
    showsInspectorGroup("page.commerce", {
      pageType,
      tab: "settings",
      surface: "page",
    });

  assert.equal(exposes("order"), true);
  assert.equal(exposes("catering"), true);
  assert.equal(exposes("landing"), false);
  assert.equal(exposes("content"), false);
});

// ─── The surface clamp ───────────────────────────────────────────────────────

test("only order pages have a checkout surface", () => {
  assert.deepEqual(surfacesForPageType("order"), ["page", "checkout"]);
  for (const pageType of ["landing", "content", "catering"] as const) {
    assert.deepEqual(surfacesForPageType(pageType), ["page"], pageType);
  }
});

test("a checkout surface requested on a non-order page clamps to page", () => {
  assert.equal(effectiveSurface("order", "checkout"), "checkout");
  assert.equal(effectiveSurface("order", "page"), "page");
  for (const pageType of ["landing", "content", "catering"] as const) {
    assert.equal(effectiveSurface(pageType, "checkout"), "page", pageType);
  }
  // The builder's active page is nullable while the draft loads.
  assert.equal(effectiveSurface(undefined, "checkout"), "page");
});

test("no non-order page can render a checkout-only group", () => {
  for (const pageType of PAGE_TYPES) {
    if (pageType === "order") continue;
    for (const tab of TABS) {
      for (const surface of ["page", "checkout"] as const) {
        const groups = visibleInspectorGroups({
          pageType,
          tab,
          surface: effectiveSurface(pageType, surface),
        });
        assert.equal(groups.includes("checkout.text_colors"), false);
        assert.equal(groups.includes("checkout.form"), false);
        assert.equal(groups.includes("page.handoff"), false);
      }
    }
  }
});

// ─── Table invariants ────────────────────────────────────────────────────────

test("every group is registered exactly once", () => {
  const ids = INSPECTOR_GROUP_SCOPES.map((scope) => scope.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate inspector group id");
});

test("no group is unreachable", () => {
  for (const scope of INSPECTOR_GROUP_SCOPES) {
    assert.ok(scope.tabs.length > 0, `${scope.id}: no tab`);
    assert.ok(scope.surfaces.length > 0, `${scope.id}: no surface`);
    assert.ok(
      scope.pageTypes === "all" || scope.pageTypes.length > 0,
      `${scope.id}: no page type`,
    );
    const reachable = PAGE_TYPES.some((pageType) =>
      scope.tabs.some((tab) =>
        scope.surfaces.some(
          (surface) =>
            effectiveSurface(pageType, surface) === surface &&
            showsInspectorGroup(scope.id, { pageType, tab, surface }),
        ),
      ),
    );
    assert.equal(reachable, true, `${scope.id} is unreachable`);
  }
});

test("checkout groups are restricted to order pages", () => {
  for (const scope of INSPECTOR_GROUP_SCOPES) {
    if (!scope.surfaces.includes("checkout")) continue;
    assert.notEqual(
      scope.pageTypes,
      "all",
      `${scope.id}: a checkout group must name its page types`,
    );
    assert.deepEqual(
      scope.pageTypes,
      ["order"],
      `${scope.id}: only order pages have a checkout`,
    );
  }
});

test("an unregistered group id fails loudly", () => {
  assert.throws(
    () =>
      showsInspectorGroup("page.nope" as InspectorGroupId, {
        pageType: "order",
        tab: "appearance",
        surface: "page",
      }),
    /Unknown inspector group: page\.nope/,
  );
});

test("every context resolves without throwing", () => {
  for (const pageType of PAGE_TYPES) {
    for (const tab of TABS) {
      for (const surface of surfacesForPageType(pageType)) {
        const groups = visibleInspectorGroups({ pageType, tab, surface });
        assert.equal(
          new Set(groups).size,
          groups.length,
          `${pageType}/${tab}/${surface}: duplicate group`,
        );
      }
    }
  }
});

test("group order follows the table", () => {
  const tableOrder = new Map<InspectorGroupId, number>(
    INSPECTOR_GROUP_SCOPES.map((scope, index) => [scope.id, index]),
  );
  for (const pageType of PAGE_TYPES) {
    for (const tab of TABS) {
      for (const surface of surfacesForPageType(pageType)) {
        const positions = visibleInspectorGroups({
          pageType,
          tab,
          surface,
        }).map((id) => tableOrder.get(id) ?? -1);
        const sorted = [...positions].sort((a, b) => a - b);
        assert.deepEqual(
          positions,
          sorted,
          `${pageType}/${tab}/${surface}: out of table order`,
        );
      }
    }
  }
});

test("the handoff card is the last group of every checkout tab", () => {
  for (const tab of TABS) {
    const groups = visibleInspectorGroups({
      pageType: "order",
      tab,
      surface: "checkout",
    });
    assert.equal(groups.at(-1), "page.handoff", tab);
  }
});

test("a surface never renders an empty inspector", () => {
  for (const pageType of PAGE_TYPES) {
    for (const tab of TABS) {
      for (const surface of surfacesForPageType(pageType)) {
        assert.ok(
          visibleInspectorGroups({ pageType, tab, surface }).length > 0,
          `${pageType}/${tab}/${surface} renders nothing`,
        );
      }
    }
  }
});

// Guards the assumption the whole design rests on: page-surface behaviour is
// unchanged for every page type that has no checkout, so this change cannot
// regress landing, content or catering pages.
test("page-type-only pages see exactly one surface's worth of groups", () => {
  const surfaces: readonly InspectorSurface[] = ["page", "checkout"];
  for (const pageType of ["landing", "content", "catering"] as const) {
    for (const tab of TABS) {
      const [first, ...rest] = surfaces.map((surface) =>
        visibleInspectorGroups({
          pageType,
          tab,
          surface: effectiveSurface(pageType, surface),
        }),
      );
      for (const other of rest) assert.deepEqual(other, first, `${pageType}/${tab}`);
    }
  }
});
