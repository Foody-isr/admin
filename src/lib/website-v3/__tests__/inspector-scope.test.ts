import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INSPECTOR_GROUP_SCOPES, effectiveSurface, showsInspectorGroup,
  surfacesForPageType, visibleInspectorGroups, type InspectorGroupId,
} from "../inspector-scope";
import type { WebsitePageType } from "../types";

const PAGE_TYPES: readonly WebsitePageType[] = ["landing", "content", "order", "catering"];

test("checkout exposes its form and a way back, without unrelated page controls", () => {
  assert.deepEqual(visibleInspectorGroups({ pageType: "order", surface: "checkout" }), ["checkout.form", "page.handoff"]);
});

test("all page settings are reachable together without an aspect selector", () => {
  assert.deepEqual(visibleInspectorGroups({ pageType: "order", surface: "page" }), [
    "page.identity", "page.sections", "page.theme", "page.typography", "page.quick_colors",
    "page.fonts", "page.category_bar", "page.cover", "page.order_type_selector", "page.catalog",
    "page.category_visuals", "page.address", "page.commerce", "page.navigation", "page.order_info", "page.seo",
  ]);
  for (const pageType of ["landing", "content"] as const) {
    assert.deepEqual(visibleInspectorGroups({ pageType, surface: "page" }), [
      "page.identity", "page.sections", "page.theme", "page.typography", "page.quick_colors",
      "page.fonts", "page.address", "page.navigation", "page.seo",
    ]);
  }
  assert.deepEqual(visibleInspectorGroups({ pageType: "catering", surface: "page" }), [
    "page.identity", "page.catering_content", "page.sections", "page.theme", "page.typography",
    "page.quick_colors", "page.fonts", "page.cover", "page.address", "page.commerce", "page.navigation", "page.seo",
  ]);
});

test("commerce and catering controls remain scoped to their page types", () => {
  for (const pageType of PAGE_TYPES) {
    assert.equal(showsInspectorGroup("page.commerce", { pageType, surface: "page" }), pageType === "order" || pageType === "catering");
    assert.equal(showsInspectorGroup("page.catering_content", { pageType, surface: "page" }), pageType === "catering");
  }
});

test("only order pages offer checkout and an eligible branch selector", () => {
  assert.deepEqual(surfacesForPageType("order"), ["page", "checkout"]);
  assert.deepEqual(surfacesForPageType("order", true), ["branches", "page", "checkout"]);
  assert.equal(effectiveSurface("order", "branches"), "page");
  assert.equal(effectiveSurface("order", "branches", true), "branches");
  assert.equal(effectiveSurface(undefined, "checkout"), "page");
  for (const pageType of ["landing", "content", "catering"] as const) {
    assert.deepEqual(surfacesForPageType(pageType, true), ["page"]);
    assert.equal(effectiveSurface(pageType, "checkout"), "page");
    assert.equal(effectiveSurface(pageType, "branches", true), "page");
    assert.deepEqual(visibleInspectorGroups({ pageType, surface: "checkout" }), []);
  }
});

test("each group is unique, reachable and restricted to valid surfaces", () => {
  const ids = INSPECTOR_GROUP_SCOPES.map(scope => scope.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const scope of INSPECTOR_GROUP_SCOPES) {
    assert.ok(PAGE_TYPES.some(pageType => surfacesForPageType(pageType).some(surface => showsInspectorGroup(scope.id, { pageType, surface }))), scope.id);
    if (scope.surfaces.includes("checkout")) assert.deepEqual(scope.pageTypes, ["order"]);
  }
  assert.throws(() => showsInspectorGroup("page.nope" as InspectorGroupId, { pageType: "order", surface: "page" }), /Unknown inspector group/);
});
