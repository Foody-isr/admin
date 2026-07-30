import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalAliasForType,
  isReservedPublicSlug,
  suggestSpecificSlug,
} from "../url-model";

test("commerce aliases are public entry points, not editable page slugs", () => {
  assert.equal(canonicalAliasForType("order"), "/order");
  assert.equal(canonicalAliasForType("catering"), "/catering");
  assert.equal(canonicalAliasForType("content"), null);
  assert.equal(isReservedPublicSlug("order"), true);
  assert.equal(isReservedPublicSlug("notre-carte"), false);
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
