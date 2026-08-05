import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isProviderSettled,
  localizePaymentMethod,
  paymentReference,
  settledPaymentMethod,
} from "../orders/payment";
import type { Order } from "../api";

function order(over: Partial<Order> = {}): Order {
  return {
    id: 1,
    restaurant_id: 5,
    status: "in_kitchen",
    payment_status: "paid",
    total_amount: 645,
    created_at: "2026-08-05T10:10:47Z",
    ...over,
  } as Order;
}

// The bug this whole module exists for: an order created as cash and later
// collected by card kept reporting cash, because the column is written once at
// creation and never again.
test("settled method prefers the settlement over the creation-time column", () => {
  assert.equal(
    settledPaymentMethod(
      order({ payment_method: "cash", external_metadata: { payment_method: "credit_card" } }),
    ),
    "credit_card",
  );
});

test("settled method falls back to the column when nothing was settled", () => {
  assert.equal(settledPaymentMethod(order({ payment_method: "cash" })), "cash");
  assert.equal(
    settledPaymentMethod(order({ payment_method: "cash", external_metadata: {} })),
    "cash",
  );
  // An empty settlement string must not shadow the column.
  assert.equal(
    settledPaymentMethod(
      order({ payment_method: "cash", external_metadata: { payment_method: "" } }),
    ),
    "cash",
  );
});

test("settled method is empty when nothing was ever recorded", () => {
  assert.equal(settledPaymentMethod(order()), "");
});

test("provider-settled covers both provider names and weight holds", () => {
  assert.equal(isProviderSettled(order({ external_metadata: { payment_method: "sumit" } })), true);
  assert.equal(isProviderSettled(order({ external_metadata: { payment_method: "payplus" } })), true);
  assert.equal(isProviderSettled(order({ hold_amount: 120 })), true);
  assert.equal(isProviderSettled(order({ captured_amount: 120 })), true);
  assert.equal(isProviderSettled(order({ settlement_status: "held" })), true);
});

// The regression that let the incident happen: staff overwrote the settlement
// marker with "cash", which flipped this guard open on an order a provider had
// actually settled. A manual method must never read as provider-settled, and a
// provider one always must.
test("a manually recorded method is never provider-settled", () => {
  assert.equal(
    isProviderSettled(
      order({ payment_method: "cash", external_metadata: { payment_method: "credit_card" } }),
    ),
    false,
  );
  assert.equal(isProviderSettled(order({ payment_method: "cash" })), false);
});

test("payment reference is read from the metadata and trimmed", () => {
  assert.equal(
    paymentReference(order({ external_metadata: { payment_reference: "  SUMIT-10493 " } })),
    "SUMIT-10493",
  );
  assert.equal(paymentReference(order()), "");
});

test("payment method labels fall back to the raw value", () => {
  const t = (k: string) => (k === "cash" ? "Espèces" : k === "creditCard" ? "Carte" : k);
  assert.equal(localizePaymentMethod("cash", t), "Espèces");
  assert.equal(localizePaymentMethod("CREDIT_CARD", t), "Carte");
  // A provider name has no label of its own, but must still render as something
  // in an audit line rather than vanishing.
  assert.equal(localizePaymentMethod("sumit", t), "sumit");
  assert.equal(localizePaymentMethod("", t), "");
});
