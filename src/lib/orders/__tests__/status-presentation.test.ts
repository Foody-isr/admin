import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  STATUS_TONE,
  PAYMENT_TONE,
  localizeStatus,
  localizeSource,
  localizeOrderType,
} from "@/lib/orders/status-presentation";
import type { Order } from "@/lib/api";

// The orders table renders `STATUS_TONE[order.status] ?? 'neutral'`, so a
// wrong or missing entry silently changes a badge colour on the busiest screen
// in the product. This suite pins the whole map before the detail view moves.

/** Every status foodyserver can put on an order (internal/common/models.go). */
const SERVER_STATUSES = [
  "scheduled",
  "pending_review",
  "accepted",
  "rejected",
  "in_kitchen",
  "ready",
  "ready_for_pickup",
  "ready_for_delivery",
  "out_for_delivery",
  "served",
  "received",
  "picked_up",
  "delivered",
  "cancelled",
  "refunded",
] as const;

// A `t` that resolves nothing, exactly like i18n.tsx on a total miss.
const echoT = (k: string) => k;

test("every server status maps to the tone it did before the extraction", () => {
  const expected: Record<string, string | undefined> = {
    scheduled: "neutral",
    pending_review: "warning",
    accepted: "info",
    rejected: "danger",
    in_kitchen: "warning",
    ready: "info",
    ready_for_pickup: "info",
    ready_for_delivery: "info",
    out_for_delivery: "info",
    served: "success",
    received: "success",
    picked_up: "success",
    delivered: "success",
    // Legacy abandoned-payment status, rendered like `rejected`.
    cancelled: "danger",
    // Deliberately unmapped — callers fall back to 'neutral'. Pinned so that
    // adding a tone for it becomes a conscious decision, not a silent drift.
    refunded: undefined,
  };
  for (const status of SERVER_STATUSES) {
    assert.equal(STATUS_TONE[status], expected[status], `tone for "${status}"`);
  }
});

test("STATUS_TONE carries no entry the server cannot produce", () => {
  for (const key of Object.keys(STATUS_TONE)) {
    assert.ok(
      (SERVER_STATUSES as readonly string[]).includes(key),
      `STATUS_TONE has "${key}", which foodyserver never emits`,
    );
  }
});

test("payment tones cover every payment_status", () => {
  assert.equal(PAYMENT_TONE.paid, "success");
  assert.equal(PAYMENT_TONE.pending, "warning");
  assert.equal(PAYMENT_TONE.unpaid, "warning");
  assert.equal(PAYMENT_TONE.refunded, "neutral");
});

test("localizeStatus uses the translation when there is one", () => {
  const t = (k: string) => ({ statusInKitchen: "En cuisine" })[k as "statusInKitchen"] ?? k;
  assert.equal(localizeStatus("in_kitchen", t), "En cuisine");
});

test("localizeStatus humanizes the id when t() echoes the key back", () => {
  // i18n.tsx returns the raw key on a miss; that must not leak to the badge.
  assert.equal(localizeStatus("in_kitchen", echoT), "in kitchen");
  assert.equal(localizeStatus("ready_for_delivery", echoT), "ready for delivery");
});

test("localizeStatus humanizes a status that has no key at all", () => {
  // `refunded` has no STATUS_KEY entry.
  assert.equal(localizeStatus("refunded", echoT), "refunded");
  assert.equal(localizeStatus("some_future_status", echoT), "some future status");
});

test("cancelled deliberately shares the rejected label so cancellations read as one status", () => {
  const t = (k: string) => ({ statusRejected: "Annulée" })[k as "statusRejected"] ?? k;
  assert.equal(localizeStatus("cancelled", t), "Annulée");
  assert.equal(localizeStatus("rejected", t), "Annulée");
});

test("localizeSource falls back to online when the order carries no source", () => {
  const t = (k: string) => ({ sourceOnline: "En ligne" })[k as "sourceOnline"] ?? k;
  assert.equal(localizeSource(undefined, t), "En ligne");
  assert.equal(localizeSource("", t), "En ligne");
});

test("localizeSource title-cases the sources the server emits but the map omits", () => {
  // qr_dine_in, wolt, manual and unknown_external have no SOURCE_KEY entry.
  assert.equal(localizeSource("qr_dine_in", echoT), "Qr Dine In");
  assert.equal(localizeSource("wolt", echoT), "Wolt");
  assert.equal(localizeSource("unknown_external", echoT), "Unknown External");
});

test("localizeOrderType covers the three real types and degrades for anything else", () => {
  const t = (k: string) =>
    ({ dineIn: "Sur place", pickup: "À emporter", delivery: "Livraison" })[
      k as "dineIn" | "pickup" | "delivery"
    ] ?? k;
  assert.equal(localizeOrderType("dine_in", t), "Sur place");
  assert.equal(localizeOrderType("pickup", t), "À emporter");
  assert.equal(localizeOrderType("delivery", t), "Livraison");
  assert.equal(localizeOrderType("catering" as Order["order_type"], t), "catering");
});

// ─────────────────────────────────────────────────────────────────────────────
// The gap `npm run check:i18n` cannot see.
//
// The checker only matches translate calls whose argument is a quoted literal.
// localizeStatus resolves STATUS_KEY[status] through t() — a dynamic key — so a
// status label missing from the dictionary ships green and renders as a raw
// humanized id in the UI. Read the dictionary the same way
// scripts/check-i18n.cjs does and close the hole.
//
// Note the checker walks raw file text, comments included, so writing a quoted
// translate call in a comment here would itself register a phantom used key.
// ─────────────────────────────────────────────────────────────────────────────

function enBlockKeys(): Set<string> {
  const src = readFileSync(new URL("../../i18n.tsx", import.meta.url), "utf8");
  const start = src.indexOf("\n  en: {");
  assert.ok(start > -1, "could not find the `  en: {` block marker in i18n.tsx");
  // The next locale block marker bounds the en block.
  const rest = src.slice(start + 1);
  const endRel = rest.search(/\n {2}(?:he|fr): \{/);
  const block = endRel > -1 ? rest.slice(0, endRel) : rest;
  const keys = new Set<string>();
  for (const m of Array.from(block.matchAll(/^\s{4,}([A-Za-z0-9_]+):\s/gm))) keys.add(m[1]);
  return keys;
}

test("every status label key that localizeStatus resolves dynamically exists in en", () => {
  const keys = enBlockKeys();
  assert.ok(keys.size > 1000, `expected a full en dictionary, parsed only ${keys.size} keys`);
  const statusKeys = [
    "statusPendingReview",
    "statusAccepted",
    "statusInKitchen",
    "statusReady",
    "statusReadyForPickup",
    "statusReadyForDelivery",
    "statusOutForDelivery",
    "statusServed",
    "statusReceived",
    "statusPickedUp",
    "statusDelivered",
    "statusRejected",
    "statusScheduled",
  ];
  const missing = statusKeys.filter((k) => !keys.has(k));
  assert.deepEqual(missing, [], `status keys missing from the en dictionary: ${missing.join(", ")}`);
});

test("every source label key that localizeSource resolves dynamically exists in en", () => {
  const keys = enBlockKeys();
  const missing = [
    "sourceWebsiteOrder",
    "sourceOnline",
    "sourceCounter",
    "sourceTabletPos",
  ].filter((k) => !keys.has(k));
  assert.deepEqual(missing, [], `source keys missing from the en dictionary: ${missing.join(", ")}`);
});
