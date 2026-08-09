import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATE_REGISTRY, findTemplate, unknownTokens } from "../registry";

test("the order recap template is registered with its tokens and blocks", () => {
  const def = findTemplate("order_recap");
  assert.ok(def, "order_recap must be in the registry");
  assert.ok(def!.blocks.includes("articles"));
  assert.ok(def!.tokens.includes("client"));
});

test("every registered template ships a default in all three locales", () => {
  for (const def of TEMPLATE_REGISTRY) {
    for (const locale of ["fr", "he", "en"] as const) {
      assert.ok(
        def.defaults[locale] && def.defaults[locale].trim().length > 0,
        `${def.key} has no ${locale} default`,
      );
    }
  }
});

// Every token used by a shipped default must be declared, or the editor would
// flag Foody's own text as invalid.
test("shipped defaults only use declared tokens", () => {
  for (const def of TEMPLATE_REGISTRY) {
    for (const locale of ["fr", "he", "en"] as const) {
      assert.deepEqual(
        unknownTokens(def.defaults[locale], def),
        [],
        `${def.key}/${locale} uses an undeclared token`,
      );
    }
  }
});

test("unknownTokens reports what the editor must flag", () => {
  const def = findTemplate("order_recap")!;
  assert.deepEqual(unknownTokens("{{client}} {{nawak}}", def), ["nawak"]);
});

test("unknownTokens returns each unknown token once", () => {
  const def = findTemplate("order_recap")!;
  assert.deepEqual(unknownTokens("{{nawak}} {{nawak}}", def), ["nawak"]);
});
