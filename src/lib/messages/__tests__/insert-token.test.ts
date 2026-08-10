import assert from "node:assert/strict";
import { test } from "node:test";
import { spliceToken } from "../insert-token";

test("inserts at the start of a non-empty body", () => {
  const { next, caret } = spliceToken("votre commande", 0, 0, "{{client}}");
  assert.equal(next, "{{client}}votre commande");
  assert.equal(caret, "{{client}}".length);
});

test("inserts at the end of a non-empty body", () => {
  const body = "Bonjour ";
  const { next, caret } = spliceToken(body, body.length, body.length, "{{client}}");
  assert.equal(next, "Bonjour {{client}}");
  assert.equal(caret, next.length);
});

test("inserts into the middle of a body", () => {
  const body = "Bonjour , votre commande est confirmée";
  const start = "Bonjour ".length;
  const { next, caret } = spliceToken(body, start, start, "{{client}}");
  assert.equal(next, "Bonjour {{client}}, votre commande est confirmée");
  assert.equal(caret, start + "{{client}}".length);
});

test("replaces a selection instead of inserting at a single point", () => {
  const body = "Bonjour ANCIEN_NOM, votre commande";
  const start = body.indexOf("ANCIEN_NOM");
  const end = start + "ANCIEN_NOM".length;
  const { next, caret } = spliceToken(body, start, end, "{{client}}");
  assert.equal(next, "Bonjour {{client}}, votre commande");
  assert.equal(caret, start + "{{client}}".length);
});

test("inserts into an empty body", () => {
  const { next, caret } = spliceToken("", 0, 0, "{{articles}}");
  assert.equal(next, "{{articles}}");
  assert.equal(caret, "{{articles}}".length);
});

// The behaviour the editor relies on: clicking a second chip right after the
// first must not require re-clicking into the field. At the pure-logic level
// this means feeding the caret returned by one call straight into the next
// as its start/end must produce a left-to-right composition, never
// overwriting or skipping a character.
test("two sequential insertions compose left to right, matching two chip clicks in a row", () => {
  let body = "";
  let caret = 0;
  ({ next: body, caret } = spliceToken(body, caret, caret, "{{client}}"));
  ({ next: body, caret } = spliceToken(body, caret, caret, " {{numero_commande}}"));
  assert.equal(body, "{{client}} {{numero_commande}}");
  assert.equal(caret, body.length);
});
