import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTemplate } from "../render";

test("substitutes simple tokens and generated blocks alike", () => {
  const out = renderTemplate("Bonjour {{client}}\n{{articles}}", {
    tokens: { client: "Leah" },
    blocks: { articles: "• 2× Salade\n• 1× Coca" },
  });
  assert.equal(out, "Bonjour Leah\n• 2× Salade\n• 1× Coca");
});

// A customer must never receive braces. An unknown token renders as nothing.
test("an unknown token renders empty, never as raw braces", () => {
  const out = renderTemplate("A{{nexiste_pas}}B", { tokens: {}, blocks: {} });
  assert.equal(out, "AB");
});

// A pickup order has no address. The label must go with it rather than leaving
// a bare "Adresse :" line.
test("a line whose every token resolves empty disappears entirely", () => {
  const out = renderTemplate("Commande\n📍 Adresse : {{adresse}}\nMerci", {
    tokens: {},
    blocks: { adresse: "" },
  });
  assert.equal(out, "Commande\nMerci");
});

test("a line keeps its place when at least one of its tokens has a value", () => {
  const out = renderTemplate("{{creneau}} / {{adresse}}", {
    tokens: { creneau: "jeudi 10:00" },
    blocks: { adresse: "" },
  });
  assert.equal(out, "jeudi 10:00 / ");
});

test("a line without any token is never dropped", () => {
  const out = renderTemplate("Ligne fixe\n{{vide}}\nAutre", {
    tokens: { vide: "" },
    blocks: {},
  });
  assert.equal(out, "Ligne fixe\nAutre");
});

test("the same token can appear twice", () => {
  const out = renderTemplate("{{client}} et encore {{client}}", {
    tokens: { client: "Leah" },
    blocks: {},
  });
  assert.equal(out, "Leah et encore Leah");
});

test("tolerates inner spacing in a token", () => {
  const out = renderTemplate("Bonjour {{ client }}", { tokens: { client: "Leah" }, blocks: {} });
  assert.equal(out, "Bonjour Leah");
});

test("a block wins over a simple token of the same name", () => {
  const out = renderTemplate("{{articles}}", {
    tokens: { articles: "jeton" },
    blocks: { articles: "bloc" },
  });
  assert.equal(out, "bloc");
});
