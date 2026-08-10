import assert from "node:assert/strict";
import { test } from "node:test";
import { rehydrateDraftLines, toDraftLines } from "../draftLines";
import type { DraftLine } from "../orderDraft";
import type { MenuItem } from "@/lib/api";

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 7, name: "Salade Tuna", price: 25, is_active: true,
    category_id: 1, item_type: "standard",
    ...over,
  } as unknown as MenuItem;
}

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    uid: "l1", itemId: 7, quantity: 2, notes: "",
    modifiers: [], unitPriceAtDraft: 25,
    ...over,
  };
}

test("a line whose item is unchanged carries no issue", () => {
  const map = new Map([[7, item()]]);
  const out = rehydrateDraftLines([line()], map);
  assert.equal(out.length, 1);
  assert.equal(out[0].issue, null);
  assert.equal(out[0].line.item.id, 7);
  assert.equal(out[0].line.quantity, 2);
});

test("an item that no longer exists is flagged missing", () => {
  const out = rehydrateDraftLines([line()], new Map());
  assert.deepEqual(out[0].issue, { kind: "missing" });
});

test("an item that became unavailable is flagged sold_out", () => {
  // Le scénario qui motive la feature : le staff quitte la page pour marquer
  // un article indisponible via la puce "86", qui pose `force_sold_out`.
  // `is_active` est un axe différent (publié/dépublié) qu'isItemSoldOut ne lit
  // jamais ; le fixer ici ne testerait rien.
  const map = new Map([[7, item({ availability_override: "force_sold_out" })]]);
  const out = rehydrateDraftLines([line()], map);
  assert.equal(out[0].issue?.kind, "sold_out");
});

test("a changed unit price is flagged with both figures", () => {
  const map = new Map([[7, item({ price: 28 })]]);
  const out = rehydrateDraftLines([line()], map);
  assert.deepEqual(out[0].issue, { kind: "price_changed", was: 25, now: 28 });
});

// La régression la plus probable : recalculer le prix à la main au lieu de
// réutiliser lineUnitPrice signalerait un faux « prix modifié » sur toute ligne
// portant une variante ou des modificateurs.
test("a variant plus modifiers line with nothing changed is NOT flagged", () => {
  const map = new Map([[7, item()]]);
  const drafted = line({
    selectedVariantId: 3,
    selectedVariantName: "Grande",
    selectedVariantPrice: 35,
    modifiers: [{ id: 9, name: "Supplément sauce", price_delta: 2 }],
    unitPriceAtDraft: 37,
  });
  const out = rehydrateDraftLines([drafted], map);
  assert.equal(out[0].issue, null, "37 = 35 (variante) + 2 (modificateur), rien n'a bougé");
});

test("a combo whose component disappeared names the component", () => {
  const combo = item({ id: 50, name: "Menu midi", item_type: "combo", price: 45 });
  const map = new Map([[50, combo]]);
  const drafted = line({
    uid: "c1", itemId: 50, unitPriceAtDraft: 45,
    comboItemId: 50,
    comboSelections: [
      { stepId: 1, stepName: "Plat", menuItemId: 7, menuItemName: "Salade Tuna", quantity: 1, priceDelta: 0 },
    ],
  });
  const out = rehydrateDraftLines([drafted], map);
  assert.deepEqual(out[0].issue, { kind: "combo_part", partName: "Salade Tuna", reason: "missing" });
});

test("a combo whose component went out of stock names the component", () => {
  const combo = item({ id: 50, name: "Menu midi", item_type: "combo", price: 45 });
  const map = new Map([[50, combo], [7, item({ availability_override: "force_sold_out" })]]);
  const drafted = line({
    uid: "c1", itemId: 50, unitPriceAtDraft: 45,
    comboItemId: 50,
    comboSelections: [
      { stepId: 1, stepName: "Plat", menuItemId: 7, menuItemName: "Salade Tuna", quantity: 1, priceDelta: 0 },
    ],
  });
  const out = rehydrateDraftLines([drafted], map);
  assert.deepEqual(out[0].issue, { kind: "combo_part", partName: "Salade Tuna", reason: "sold_out" });
});

// L'article manquant l'emporte sur le prix : inutile de dire à quelqu'un que le
// prix a changé sur une ligne qu'il ne peut pas commander.
test("a missing item wins over a price change", () => {
  const out = rehydrateDraftLines([line({ unitPriceAtDraft: 99 })], new Map());
  assert.deepEqual(out[0].issue, { kind: "missing" });
});

test("toDraftLines keeps every field the draft needs", () => {
  const map = new Map([[7, item()]]);
  const [rehydrated] = rehydrateDraftLines([line({ notes: "sans oignons" })], map);
  const [back] = toDraftLines([rehydrated.line]);

  assert.equal(back.itemId, 7);
  assert.equal(back.notes, "sans oignons");
  assert.equal(back.quantity, 2);
  assert.equal(back.unitPriceAtDraft, 25);
});

// Un brouillon est trusted après JSON.parse au-delà de version/savedAt (même
// contrat que itemDraft.ts) : une ligne individuelle peut être corrompue sans
// que le brouillon entier soit rejeté. rehydrateDraftLines doit dégrader
// proprement plutôt que de planter la page de commande.
test("a line missing its modifiers array does not throw and degrades gracefully", () => {
  const map = new Map([[7, item()]]);
  const malformed = { uid: "l2", itemId: 7, quantity: 1, notes: "" } as unknown as DraftLine;
  assert.doesNotThrow(() => rehydrateDraftLines([malformed], map));
  const out = rehydrateDraftLines([malformed], map);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].line.modifiers, []);
});

test("a malformed lines value degrades to an empty cart instead of throwing", () => {
  assert.doesNotThrow(() => rehydrateDraftLines(null as unknown as DraftLine[], new Map()));
  assert.deepEqual(rehydrateDraftLines(null as unknown as DraftLine[], new Map()), []);
});
