import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalAliasForType,
  isReservedPublicSlug,
  publicAddressForPage,
  suggestSpecificSlug,
} from "../url-model";

function orderPage({ slug, is_default }: { slug: string; is_default: boolean }) {
  return { type: "order" as const, slug, is_default };
}

function cateringPage({ slug, is_default }: { slug: string; is_default: boolean }) {
  return { type: "catering" as const, slug, is_default };
}

test("commerce aliases are public entry points, not editable page slugs", () => {
  assert.equal(canonicalAliasForType("order"), "/order");
  assert.equal(canonicalAliasForType("catering"), "/catering");
  assert.equal(canonicalAliasForType("content"), null);
  assert.equal(isReservedPublicSlug("order"), true);
  assert.equal(isReservedPublicSlug("notre-carte"), false);
});

test("default commerce pages expose only their canonical address", () => {
  assert.equal(publicAddressForPage(orderPage({ slug: "menu", is_default: true })), "/order");
  assert.equal(publicAddressForPage(cateringPage({ slug: "traiteur", is_default: true })), "/catering");
});

test("non-default commerce pages expose their specific slug", () => {
  assert.equal(publicAddressForPage(orderPage({ slug: "shabbat", is_default: false })), "/shabbat");
});

test("specific slug suggestion remains unique", () => {
  assert.equal(
    suggestSpecificSlug("order", [{ slug: "commander" }, { slug: "commander-2" }]),
    "commander-3",
  );
  assert.equal(
    suggestSpecificSlug("catering", [{ slug: "traiteur" }]),
    "traiteur-2",
  );
});
