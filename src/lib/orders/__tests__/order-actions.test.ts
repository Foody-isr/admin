import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveOrderCapabilities, type PrimaryAction } from "@/lib/orders/order-actions";
import type { Order } from "@/lib/api";

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

// `status` is widened to string on purpose: the client OrderStatus union
// omits `cancelled` and `refunded`, which foodyserver does emit.
function makeOrder(over: Partial<Omit<Order, "status">> & { status?: string } = {}): Order {
  return {
    id: 1,
    restaurant_id: 5,
    order_type: "delivery",
    status: "pending_review",
    payment_status: "unpaid",
    customer_name: "Yael",
    customer_phone: "0537085513",
    total_amount: 100,
    items: [],
    created_at: "2026-08-14T09:51:00Z",
    ...over,
  } as Order;
}

/** Owner on the orders board: every permission and every handler wired. */
const OWNER = { canManage: true, canOverride: true, canDelete: true };
const ALL_HANDLERS = {
  onConfirmWeights: true,
  onOverride: true,
  onCorrectPayment: true,
  onCorrectPaymentMethod: true,
  onToggleForceProduction: true,
  onDelete: true,
};

/**
 * The production page's reduced prop set. ProductionOrderDetail passes none of
 * the correction/delete/force-production handlers, so every action they gate
 * must disappear rather than render and crash on an undefined callback.
 */
const PRODUCTION_PERMS = { canManage: true };
const PRODUCTION_HANDLERS = { onConfirmWeights: true };

// ─── Primary action ──────────────────────────────────────────────────────────

test("the primary next step is correct for all 15 server statuses on a delivery order", () => {
  const expected: Record<string, PrimaryAction | null> = {
    scheduled: "accept",
    pending_review: "accept",
    accepted: "sendToKitchen",
    in_kitchen: "markReady",
    ready: "markServed",
    ready_for_pickup: "markServed",
    ready_for_delivery: "markOutForDelivery",
    out_for_delivery: "markDelivered",
    // Terminal and unknown states offer nothing.
    served: null,
    received: null,
    picked_up: null,
    delivered: null,
    rejected: null,
    cancelled: null,
    refunded: null,
  };
  for (const status of SERVER_STATUSES) {
    const caps = deriveOrderCapabilities(makeOrder({ status }), OWNER, ALL_HANDLERS);
    assert.equal(caps.primary, expected[status], `primary for "${status}"`);
  }
});

test("ready_for_delivery is the one status whose primary depends on the order type", () => {
  const delivery = deriveOrderCapabilities(
    makeOrder({ status: "ready_for_delivery", order_type: "delivery" }),
    OWNER,
    ALL_HANDLERS,
  );
  assert.equal(delivery.primary, "markOutForDelivery");

  for (const type of ["pickup", "dine_in"] as const) {
    const other = deriveOrderCapabilities(
      makeOrder({ status: "ready_for_delivery", order_type: type }),
      OWNER,
      ALL_HANDLERS,
    );
    assert.equal(other.primary, "markServed", `primary for ${type}`);
  }
});

// ─── State flags ─────────────────────────────────────────────────────────────

test("terminal covers every status with nothing left to advance", () => {
  for (const status of ["served", "received", "picked_up", "delivered", "rejected"]) {
    assert.equal(deriveOrderCapabilities(makeOrder({ status }), OWNER).isTerminal, true, status);
  }
  for (const status of ["scheduled", "pending_review", "accepted", "in_kitchen", "ready"]) {
    assert.equal(deriveOrderCapabilities(makeOrder({ status }), OWNER).isTerminal, false, status);
  }
});

test("only `rejected` counts as cancelled, matching the original predicate", () => {
  // The legacy `cancelled` status shares rejected's LABEL but not this flag.
  // Pinned because changing it would silently re-enable destructive actions.
  assert.equal(deriveOrderCapabilities(makeOrder({ status: "rejected" }), OWNER).isCancelled, true);
  assert.equal(deriveOrderCapabilities(makeOrder({ status: "cancelled" }), OWNER).isCancelled, false);
});

// ─── Payment guards ──────────────────────────────────────────────────────────

test("take payment is offered until the order is paid or refunded", () => {
  assert.equal(deriveOrderCapabilities(makeOrder({ payment_status: "unpaid" }), OWNER).canTakePayment, true);
  assert.equal(deriveOrderCapabilities(makeOrder({ payment_status: "pending" }), OWNER).canTakePayment, true);
  assert.equal(deriveOrderCapabilities(makeOrder({ payment_status: "paid" }), OWNER).canTakePayment, false);
  assert.equal(deriveOrderCapabilities(makeOrder({ payment_status: "refunded" }), OWNER).canTakePayment, false);
});

test("close order needs a paid, live, non-cancelled order", () => {
  const yes = makeOrder({ status: "in_kitchen", payment_status: "paid" });
  assert.equal(deriveOrderCapabilities(yes, OWNER).canCloseOrder, true);
  // Unpaid.
  assert.equal(
    deriveOrderCapabilities(makeOrder({ status: "in_kitchen", payment_status: "unpaid" }), OWNER).canCloseOrder,
    false,
  );
  // Already terminal — clicking it was a no-op that read as a bug.
  assert.equal(
    deriveOrderCapabilities(makeOrder({ status: "served", payment_status: "paid" }), OWNER).canCloseOrder,
    false,
  );
});

test("payment correction is refused once a provider settled the money", () => {
  // isProviderSettled reads external_metadata / settlement_status.
  const settled = makeOrder({
    payment_status: "paid",
    external_metadata: { payment_method: "payplus" },
  } as Partial<Order>);
  const caps = deriveOrderCapabilities(settled, OWNER, ALL_HANDLERS);
  assert.equal(caps.providerSettled, true);
  assert.equal(caps.canCorrectPayment, false, "provider money is refunded, never data-corrected");
  assert.equal(caps.canCorrectPaymentMethod, false);
});

test("a cash order may be corrected both ways once paid", () => {
  const cash = makeOrder({ payment_status: "paid", payment_method: "cash" } as Partial<Order>);
  const caps = deriveOrderCapabilities(cash, OWNER, ALL_HANDLERS);
  assert.equal(caps.providerSettled, false);
  assert.equal(caps.canCorrectPayment, true);
  assert.equal(caps.canCorrectPaymentMethod, true);
});

test("relabelling the payment method is meaningless before anything settled", () => {
  const unpaidCash = makeOrder({ payment_status: "unpaid", payment_method: "cash" } as Partial<Order>);
  const caps = deriveOrderCapabilities(unpaidCash, OWNER, ALL_HANDLERS);
  assert.equal(caps.canCorrectPayment, true, "moving unpaid → paid is still allowed");
  assert.equal(caps.canCorrectPaymentMethod, false, "but there is no method to relabel yet");
});

// ─── Weights ─────────────────────────────────────────────────────────────────

test("confirm weights needs a held settlement AND a handler", () => {
  const held = makeOrder({ settlement_status: "held" } as Partial<Order>);
  assert.equal(deriveOrderCapabilities(held, OWNER, ALL_HANDLERS).canConfirmWeights, true);
  assert.equal(deriveOrderCapabilities(held, OWNER, {}).canConfirmWeights, false, "no handler, no action");
  const captured = makeOrder({ settlement_status: "captured" } as Partial<Order>);
  assert.equal(deriveOrderCapabilities(captured, OWNER, ALL_HANDLERS).canConfirmWeights, false);
});

// ─── Permission gates ────────────────────────────────────────────────────────

test("correction actions require the override permission", () => {
  const order = makeOrder({ status: "in_kitchen", payment_status: "paid", payment_method: "cash" } as Partial<Order>);
  const withOverride = deriveOrderCapabilities(order, OWNER, ALL_HANDLERS);
  assert.equal(withOverride.canCorrectStatus, true);
  assert.equal(withOverride.canCorrectPayment, true);
  assert.equal(withOverride.canCorrectPaymentMethod, true);

  const without = deriveOrderCapabilities(order, { canManage: true }, ALL_HANDLERS);
  assert.equal(without.canCorrectStatus, false);
  assert.equal(without.canCorrectPayment, false);
  assert.equal(without.canCorrectPaymentMethod, false);
});

test("status correction is withheld on scheduled and cancelled orders, which keep their own flows", () => {
  assert.equal(
    deriveOrderCapabilities(makeOrder({ status: "scheduled" }), OWNER, ALL_HANDLERS).canCorrectStatus,
    false,
  );
  assert.equal(
    deriveOrderCapabilities(makeOrder({ status: "rejected" }), OWNER, ALL_HANDLERS).canCorrectStatus,
    false,
  );
  // But a terminal order CAN be walked back — that is the point of the action.
  assert.equal(
    deriveOrderCapabilities(makeOrder({ status: "served" }), OWNER, ALL_HANDLERS).canCorrectStatus,
    true,
  );
});

test("delete needs both the owner permission and the handler", () => {
  const order = makeOrder();
  assert.equal(deriveOrderCapabilities(order, OWNER, ALL_HANDLERS).canDelete, true);
  assert.equal(deriveOrderCapabilities(order, { canManage: true, canOverride: true }, ALL_HANDLERS).canDelete, false);
  assert.equal(deriveOrderCapabilities(order, OWNER, { ...ALL_HANDLERS, onDelete: false }).canDelete, false);
});

// ─── The production page's reduced prop set ──────────────────────────────────

test("the production page never gets an overflow button, for any status", () => {
  // ProductionOrderDetail supplies no correction, delete or force-production
  // handlers. Every one of those must fold away, and the ⋯ button with them,
  // rather than opening an empty menu.
  for (const status of SERVER_STATUSES) {
    const caps = deriveOrderCapabilities(makeOrder({ status }), PRODUCTION_PERMS, PRODUCTION_HANDLERS);
    assert.equal(caps.canCorrectStatus, false, `${status}: correct status leaked`);
    assert.equal(caps.canCorrectPayment, false, `${status}: correct payment leaked`);
    assert.equal(caps.canCorrectPaymentMethod, false, `${status}: correct method leaked`);
    assert.equal(caps.canForceProduction, false, `${status}: force production leaked`);
    assert.equal(caps.canDelete, false, `${status}: delete leaked`);
  }
});

test("cancel alone is enough to keep the overflow button on the production page", () => {
  // canCancelOrder does not depend on a handler flag, so a live order still has
  // one overflow item. This is the current behaviour and is pinned deliberately.
  const live = deriveOrderCapabilities(makeOrder({ status: "in_kitchen" }), PRODUCTION_PERMS, PRODUCTION_HANDLERS);
  assert.equal(live.canCancelOrder, true);
  assert.equal(live.hasOverflow, true);

  const done = deriveOrderCapabilities(makeOrder({ status: "served" }), PRODUCTION_PERMS, PRODUCTION_HANDLERS);
  assert.equal(done.canCancelOrder, false);
  assert.equal(done.hasOverflow, false, "a completed order on the production page has an empty overflow");
});

test("the owner board keeps an overflow on every status except a cancelled order with no delete", () => {
  for (const status of SERVER_STATUSES) {
    const caps = deriveOrderCapabilities(makeOrder({ status }), OWNER, ALL_HANDLERS);
    assert.equal(caps.hasOverflow, true, `${status}: owner lost the overflow menu`);
  }
  // Strip delete and cancel a rejected order: nothing left to show.
  const bare = deriveOrderCapabilities(
    makeOrder({ status: "rejected" }),
    { canManage: true },
    {},
  );
  assert.equal(bare.hasOverflow, false);
});

test("never throws, whatever the combination", () => {
  for (const status of SERVER_STATUSES) {
    for (const type of ["delivery", "pickup", "dine_in"] as const) {
      for (const payment of ["unpaid", "pending", "paid", "refunded"] as const) {
        for (const perms of [OWNER, PRODUCTION_PERMS, { canManage: false }]) {
          const caps = deriveOrderCapabilities(
            makeOrder({ status, order_type: type, payment_status: payment }),
            perms,
            ALL_HANDLERS,
          );
          assert.equal(typeof caps.hasOverflow, "boolean");
        }
      }
    }
  }
});
