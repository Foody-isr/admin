import assert from "node:assert/strict";
import { test } from "node:test";
import { i18nOr } from "../i18n";

test("returns the translated value when the key resolves to something real", () => {
  const t = (k: string) => ({ hello: "Bonjour" })[k as "hello"] ?? k;
  assert.equal(i18nOr(t, "hello", "fallback"), "Bonjour");
});

// t() (see i18n.tsx) returns the raw key itself on a miss — i18nOr must
// recognize that shape and use the fallback instead of leaking the key.
test("falls back when t() echoes the key back (a miss)", () => {
  const t = (k: string) => k;
  assert.equal(i18nOr(t, "token_numero_commande", "Order number"), "Order number");
});

test("falls back when t() returns an empty string", () => {
  const t = () => "";
  assert.equal(i18nOr(t, "anything", "fallback"), "fallback");
});

test("a translated value equal to the fallback text is still used, not treated as a miss", () => {
  const t = (k: string) => ({ save: "Save" })[k as "save"] ?? k;
  assert.equal(i18nOr(t, "save", "Save"), "Save");
});
