import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DRAFT_TTL_MS,
  isMeaningfulDraft,
  loadOrderDraft,
  saveOrderDraft,
  clearOrderDraft,
  type OrderDraftInput,
} from "../orderDraft";

// Un localStorage minimal : les fonctions sont pures vis-à-vis de React mais
// parlent au navigateur, donc on lui en fournit un.
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as { window?: unknown }).window = globalThis;
  return store;
}

function draft(over: Partial<OrderDraftInput> = {}): OrderDraftInput {
  return {
    lines: [
      {
        uid: "l1",
        itemId: 7,
        quantity: 2,
        notes: "sans oignons",
        modifiers: [],
        unitPriceAtDraft: 25,
      },
    ],
    customer: {
      name: "Leah", phone: "0541234567",
      address: "12 Dizengoff", city: "Tel Aviv",
      floor: "3", apt: "7", entryCode: "1234", deliveryNotes: "",
    },
    linked: null,
    orderType: "delivery",
    fulfillment: { timing: "immediate" },
    ...over,
  };
}

test("round trips every field", () => {
  installStorage();
  const input = draft();
  saveOrderDraft(1, input);

  const out = loadOrderDraft(1);
  assert.ok(out);
  assert.deepEqual(out!.lines, input.lines);
  assert.deepEqual(out!.customer, input.customer);
  assert.equal(out!.orderType, "delivery");
  assert.deepEqual(out!.fulfillment, input.fulfillment);
});

// Deux restaurants sur le même navigateur ne doivent jamais se voir.
test("is scoped per restaurant", () => {
  installStorage();
  saveOrderDraft(1, draft());
  assert.equal(loadOrderDraft(2), null);
});

test("clear removes it", () => {
  installStorage();
  saveOrderDraft(1, draft());
  clearOrderDraft(1);
  assert.equal(loadOrderDraft(1), null);
});

// Un panier vide n'est pas un brouillon : sinon un bandeau apparaîtrait sur une
// page que personne n'a touchée.
test("an empty cart is not a meaningful draft, even with a customer filled in", () => {
  assert.equal(isMeaningfulDraft(draft({ lines: [] })), false);
  assert.equal(isMeaningfulDraft(draft()), true);
});

test("saving an empty cart clears any previous draft instead of storing it", () => {
  installStorage();
  saveOrderDraft(1, draft());
  saveOrderDraft(1, draft({ lines: [] }));
  assert.equal(loadOrderDraft(1), null);
});

// Un panier vieux d'un service n'est pas un brouillon, c'est un piège.
test("expires past the TTL and removes itself", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());

  const key = Array.from(store.keys())[0];
  const stored = JSON.parse(store.get(key)!);
  stored.savedAt = Date.now() - DRAFT_TTL_MS - 1;
  store.set(key, JSON.stringify(stored));

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false, "an expired draft must be removed, not just ignored");
});

test("a draft from an older schema version is discarded", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const key = Array.from(store.keys())[0];
  const stored = JSON.parse(store.get(key)!);
  stored.version = 0;
  store.set(key, JSON.stringify(stored));

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false);
});

test("corrupt JSON is discarded rather than thrown", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const key = Array.from(store.keys())[0];
  store.set(key, "{not json");

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false);
});

// Le quota est une raison de perdre un brouillon, jamais de casser la page.
test("a storage failure is swallowed", () => {
  installStorage();
  (globalThis as { localStorage: { setItem: unknown } }).localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.doesNotThrow(() => saveOrderDraft(1, draft()));
});
