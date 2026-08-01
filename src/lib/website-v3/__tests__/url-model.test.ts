import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalAliasForType,
  isReservedPublicSlug,
  publicAddressForPage,
  publicURLForPage,
  suggestSpecificSlug,
} from "../url-model";
import { PUBLIC_WEBSITE_ROUTE_SEGMENTS } from "../public-route-segments";

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

test("reserved slugs mirror every static restaurant route", () => {
  assert.deepEqual(PUBLIC_WEBSITE_ROUTE_SEGMENTS, [
    "catering",
    "delivery",
    "order",
    "orders",
    "payment",
    "pickup",
    "stories",
    "t",
    "table",
    "tournee",
  ]);
  PUBLIC_WEBSITE_ROUTE_SEGMENTS.forEach((slug) => {
    assert.equal(isReservedPublicSlug(slug), true, slug);
  });
});

test("default commerce pages expose only their canonical address", () => {
  assert.equal(publicAddressForPage(orderPage({ slug: "menu", is_default: true })), "/order");
  assert.equal(publicAddressForPage(cateringPage({ slug: "traiteur", is_default: true })), "/catering");
});

test("non-default commerce pages expose their specific slug", () => {
  assert.equal(publicAddressForPage(orderPage({ slug: "shabbat", is_default: false })), "/shabbat");
});

test("builder public URLs use the same canonical page addresses", () => {
  const input = {
    webOrigin: "https://dev-app.foody-pos.co.il/ignored/path",
    restaurantSlug: "moulin dorée",
  };
  assert.equal(
    publicURLForPage({
      ...input,
      page: { type: "landing", slug: "accueil", is_default: false },
    }),
    "https://dev-app.foody-pos.co.il/r/moulin%20dor%C3%A9e",
  );
  assert.equal(
    publicURLForPage({
      ...input,
      page: orderPage({ slug: "menu-interne", is_default: true }),
    }),
    "https://dev-app.foody-pos.co.il/r/moulin%20dor%C3%A9e/order",
  );
  assert.equal(
    publicURLForPage({
      ...input,
      page: cateringPage({ slug: "traiteur-interne", is_default: true }),
    }),
    "https://dev-app.foody-pos.co.il/r/moulin%20dor%C3%A9e/catering",
  );
  assert.equal(
    publicURLForPage({
      ...input,
      page: orderPage({ slug: "brunch", is_default: false }),
    }),
    "https://dev-app.foody-pos.co.il/r/moulin%20dor%C3%A9e/brunch",
  );
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
