import assert from "node:assert/strict";
import { mock, test } from "node:test";
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
        name: "Salade Tuna",
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

// Un enregistrement au JSON valide mais à la forme partielle — écriture
// tronquée, changement de schéma à venir — était rendu tel quel. Le drawer lit
// ensuite `customer.name` et `fulfillment` dans un effet : ça lève, la page de
// commande ne rend plus rien, et comme rien n'effaçait l'enregistrement, ça se
// répétait à chaque chargement jusqu'à vider localStorage à la main.
function storeRaw(store: Map<string, string>, record: unknown): string {
  const key = "foody.orders.draft.1";
  store.set(key, JSON.stringify(record));
  return key;
}

function storedRecord(store: Map<string, string>): Record<string, unknown> {
  const key = Array.from(store.keys())[0];
  return JSON.parse(store.get(key)!) as Record<string, unknown>;
}

test("a record without a customer is discarded instead of blanking the page", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const full = storedRecord(store);
  delete full.customer;
  const key = storeRaw(store, full);

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false, "a record that would crash the page must be removed, not kept");
});

test("a customer with a non-string field is discarded", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const full = storedRecord(store);
  (full.customer as Record<string, unknown>).phone = 42;
  const key = storeRaw(store, full);

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false);
});

test("an unknown orderType is discarded", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const full = storedRecord(store);
  full.orderType = "dine_in";
  const key = storeRaw(store, full);

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false);
});

test("a record without a fulfillment is discarded", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const full = storedRecord(store);
  delete full.fulfillment;
  const key = storeRaw(store, full);

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false);
});

test("a record whose lines are not an array is discarded", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const full = storedRecord(store);
  full.lines = "l1";
  const key = storeRaw(store, full);

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false);
});

test("a JSON scalar where a record is expected is discarded", () => {
  const store = installStorage();
  saveOrderDraft(1, draft());
  const key = storeRaw(store, 7);

  assert.equal(loadOrderDraft(1), null);
  assert.equal(store.has(key), false);
});

// Le TTL est l'une des deux protections contre la reprise du panier de
// quelqu'un d'autre. Reprendre un brouillon EST une écriture (la reprise pose
// `lines`, l'effet de sauvegarde part, 500 ms plus tard l'enregistrement est
// réécrit) : si l'horodatage se rafraîchissait à chaque écriture, un brouillon
// oublié sur un poste ouvert tous les jours ne mourrait jamais. Les autres
// tests de TTL trafiquent `savedAt` à la main et ne peuvent donc pas le voir ;
// celui-ci fait le cycle réel sauvegarde → reprise → sauvegarde.
test("re-saving a restored draft does not restart its 12-hour clock", () => {
  const store = installStorage();
  mock.timers.enable({ apis: ["Date"], now: 0 });
  try {
    saveOrderDraft(1, draft());

    // Onze heures plus tard, le staff rouvre la page : le brouillon est repris,
    // puis réécrit par l'effet de sauvegarde.
    mock.timers.tick(11 * 60 * 60 * 1000);
    const restored = loadOrderDraft(1);
    assert.ok(restored, "onze heures, c'est encore dans la fenêtre");
    saveOrderDraft(1, {
      lines: restored!.lines,
      customer: restored!.customer,
      linked: restored!.linked,
      orderType: restored!.orderType,
      fulfillment: restored!.fulfillment,
    });
    assert.equal(storedRecord(store).savedAt, 0, "la réécriture garde l'heure de création");

    // Deux heures encore : treize heures après la création, donc au-delà du TTL.
    mock.timers.tick(2 * 60 * 60 * 1000);
    assert.equal(loadOrderDraft(1), null, "un brouillon repris ne se prolonge pas indéfiniment");
  } finally {
    mock.timers.reset();
  }
});

// Le quota est une raison de perdre un brouillon, jamais de casser la page.
test("a storage failure is swallowed", () => {
  installStorage();
  (globalThis as { localStorage: { setItem: unknown } }).localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.doesNotThrow(() => saveOrderDraft(1, draft()));
});
