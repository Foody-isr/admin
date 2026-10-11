import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveSurface, surfacesForPageType } from "../inspector-scope";

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
  }
});
