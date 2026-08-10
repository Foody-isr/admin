import assert from "node:assert/strict";
import { test } from "node:test";
import { rehydrateDraftLines, toDraftLines } from "../draftLines";
import type { DraftLine } from "../orderDraft";
import type { MenuItem } from "@/lib/api";
import { lineUnitPrice } from "@/components/orders/NewOrderItemModal";

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 7, name: "Salade Tuna", price: 25, is_active: true,
    category_id: 1, item_type: "standard",
    ...over,
  } as unknown as MenuItem;
}

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    uid: "l1", itemId: 7, name: "Salade Tuna", quantity: 2, notes: "",
    modifiers: [], unitPriceAtDraft: 25,
    ...over,
  };
}

/** Ce que la page réécrit dans le brouillon après une reprise : les prix
 *  mémorisés, indexés par ligne. */
function remembered(rehydrated: ReturnType<typeof rehydrateDraftLines>): Map<string, number> {
  return new Map(rehydrated.map((r) => [r.line.uid, r.unitPriceAtDraft] as const));
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
// prix a changé sur une ligne qu'il ne peut pas commander. Aujourd'hui ce
// n'est pas un choix entre deux diagnostics calculés : le `if (!item) return`
// précoce rend le calcul de prix inatteignable pour une ligne sans article.
// Ce test est donc un piège à régression pour un futur refactor (par exemple
// un fallback de prix ajouté à la coquille) plutôt que la preuve d'une
// branche de priorité vivante aujourd'hui.
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

// La revue a reproduit trois plantages précis : une entrée non-objet dans le
// tableau des lignes, dans ses modificateurs, ou dans ses sélections de
// combo. C'est exactement la forme que prend une écriture localStorage
// tronquée ou une migration partielle. Rien ne plante encore aujourd'hui
// seulement parce que la page n'appelle pas rehydrateDraftLines ; la Tâche 3
// la branche, et alors ça planterait.
test("a null entry in the lines array degrades to a missing shell instead of throwing", () => {
  const map = new Map([[7, item()]]);
  const lines = [line(), null as unknown as DraftLine];
  assert.doesNotThrow(() => rehydrateDraftLines(lines, map));
  const out = rehydrateDraftLines(lines, map);
  assert.equal(out.length, 2);
  assert.deepEqual(out[1].issue, { kind: "missing" });
});

test("a null entry inside modifiers degrades instead of throwing", () => {
  const map = new Map([[7, item()]]);
  const malformed = line({ modifiers: [null] as unknown as DraftLine["modifiers"] });
  assert.doesNotThrow(() => rehydrateDraftLines([malformed], map));
});

// Le drapeau « prix modifié » doit survivre à la réécriture qui suit la
// reprise. Recalculer `unitPriceAtDraft` depuis l'article courant remplaçait le
// prix mémorisé par le nouveau : au retour suivant la ligne revenait saine et
// la validation n'était plus bloquée. Une acceptation silencieuse au deuxième
// aller-retour, exactement ce que « signaler sans supprimer » doit empêcher.
test("a flagged price change survives the write-back that follows a restore", () => {
  const raised = new Map([[7, item({ price: 28 })]]);

  const first = rehydrateDraftLines([line()], raised);
  assert.deepEqual(first[0].issue, { kind: "price_changed", was: 25, now: 28 });

  const written = toDraftLines(first.map((r) => r.line), remembered(first));
  assert.equal(written[0].unitPriceAtDraft, 25, "la référence reste le prix d'origine");

  const second = rehydrateDraftLines(written, raised);
  assert.deepEqual(second[0].issue, { kind: "price_changed", was: 25, now: 28 });
});

// Accepter, c'est le staff qui valide le nouveau prix : à partir de là, c'est
// lui la référence. La page oublie le prix mémorisé de cette ligne, donc la
// réécriture stocke le prix courant et la ligne revient saine.
test("accepting the change makes the current price the remembered one", () => {
  const raised = new Map([[7, item({ price: 28 })]]);
  const first = rehydrateDraftLines([line()], raised);

  const written = toDraftLines(first.map((r) => r.line), new Map());
  assert.equal(written[0].unitPriceAtDraft, 28);
  assert.equal(rehydrateDraftLines(written, raised)[0].issue, null);
});

test("without a remembered price, toDraftLines falls back to the current one", () => {
  const map = new Map([[7, item()]]);
  const [rehydrated] = rehydrateDraftLines([line()], map);
  assert.equal(toDraftLines([rehydrated.line])[0].unitPriceAtDraft, 25);
});

// « Le nom mémorisé permet de l'afficher », disait le commentaire de la
// coquille — sauf qu'aucun nom n'était stocké. La ligne s'affichait « #412 ·
// n'existe plus » au moment précis où le staff doit décider quoi en faire.
test("a vanished item is displayed by name, not by id", () => {
  const out = rehydrateDraftLines([line({ name: "Salade Tuna" })], new Map());
  assert.deepEqual(out[0].issue, { kind: "missing" });
  assert.equal(out[0].line.item.name, "Salade Tuna");
});

test("a vanished line keeps the variant the staff had chosen", () => {
  const drafted = line({ name: "Salade Tuna", selectedVariantId: 3, selectedVariantName: "Grande" });
  const out = rehydrateDraftLines([drafted], new Map());
  assert.equal(out[0].line.selectedVariantName, "Grande");
  assert.equal(out[0].line.selectedVariantId, 3);
});

// Une coquille ne doit rien peser dans le total : elle ne peut pas être
// honorée. Le prix de la variante est donc volontairement laissé de côté.
test("a vanished line still weighs nothing in the total", () => {
  const drafted = line({ selectedVariantId: 3, selectedVariantName: "Grande", selectedVariantPrice: 35 });
  const out = rehydrateDraftLines([drafted], new Map());
  assert.equal(lineUnitPrice(out[0].line), 0);
});

test("a line with no remembered name falls back to its id", () => {
  const out = rehydrateDraftLines([line({ name: "" })], new Map());
  assert.equal(out[0].line.item.name, "#7");
});

test("toDraftLines captures the item name", () => {
  const map = new Map([[7, item()]]);
  const [rehydrated] = rehydrateDraftLines([line()], map);
  assert.equal(toDraftLines([rehydrated.line])[0].name, "Salade Tuna");
});

// La quantité, elle, part au serveur telle quelle. La ramener à 1 en silence
// enverrait en cuisine une commande que personne n'a passée.
test("a non-positive quantity flags the line instead of silently becoming 1", () => {
  const map = new Map([[7, item()]]);
  const out = rehydrateDraftLines([line({ quantity: 0 })], map);
  assert.deepEqual(out[0].issue, { kind: "quantity_invalid" });
  assert.equal(out[0].line.quantity, 1, "la ligne reste commandable une fois le drapeau traité");
});

test("a fractional quantity is flagged", () => {
  const map = new Map([[7, item()]]);
  const out = rehydrateDraftLines([line({ quantity: 2.5 })], map);
  assert.deepEqual(out[0].issue, { kind: "quantity_invalid" });
});

test("a quantity that is not a number at all is flagged", () => {
  const map = new Map([[7, item()]]);
  const malformed = line({ quantity: "3" as unknown as number });
  assert.deepEqual(rehydrateDraftLines([malformed], map)[0].issue, { kind: "quantity_invalid" });
});

test("a sound quantity carries no quantity flag", () => {
  const map = new Map([[7, item()]]);
  assert.equal(rehydrateDraftLines([line()], map)[0].issue, null);
});

// Un article introuvable l'emporte : inutile de discuter la quantité d'une
// ligne qui ne peut de toute façon pas partir.
test("a missing item wins over an invalid quantity", () => {
  const out = rehydrateDraftLines([line({ quantity: 0 })], new Map());
  assert.deepEqual(out[0].issue, { kind: "missing" });
});

// Deux lignes corrompues retombaient toutes les deux sur `uid: ''` : même clé
// React, une seule entrée dans `issues`, et un Retirer qui en supprimait deux.
test("two malformed lines get distinct uids", () => {
  const lines = [null, null] as unknown as DraftLine[];
  const out = rehydrateDraftLines(lines, new Map());
  assert.equal(out.length, 2);
  assert.notEqual(out[0].line.uid, out[1].line.uid);
  assert.ok(out[0].line.uid, "une ligne sans uid en reçoit un, jamais une chaîne vide");
});

test("a null entry inside comboSelections degrades instead of throwing", () => {
  const combo = item({ id: 50, name: "Menu midi", item_type: "combo", price: 45 });
  const map = new Map([[50, combo]]);
  const malformed = line({
    uid: "c1", itemId: 50, unitPriceAtDraft: 45,
    comboItemId: 50,
    comboSelections: [null] as unknown as DraftLine["comboSelections"],
  });
  assert.doesNotThrow(() => rehydrateDraftLines([malformed], map));
});
