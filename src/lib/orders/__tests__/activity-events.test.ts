import assert from "node:assert/strict";
import { test } from "node:test";
import { buildActivityEvents, type ActivityEvent } from "@/lib/orders/activity-events";
import type { AuditEvent, Order } from "@/lib/api";

// This suite exists for ONE property above all others: the number of rows this
// function returns is what labels the collapsed "ACTIVITÉ n" heading, and a
// wrong number there is a confident lie on a block whose contents are hidden.
// Everything else here is ordering and labelling.

// ─── Fixtures ────────────────────────────────────────────────────────────────

// `status` is widened to string on purpose: the client OrderStatus union omits
// `cancelled` and `refunded`, which foodyserver does emit.
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
    created_at: "2026-08-14T09:00:00Z",
    ...over,
  } as Order;
}

function makeAudit(over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 1,
    restaurant_id: 5,
    subject_type: "order",
    subject_id: 1,
    action: "order.fulfillment.rescheduled",
    actor_user_id: 3,
    actor_name: "Dana",
    created_at: "2026-08-14T10:00:00Z",
    ...over,
  };
}

// t() echoes the key, exactly like i18n.tsx on a miss. Labels built by
// interpolation therefore come back as the bare key — deterministic, and free
// of any timezone-dependent formatting from the interpolated dates.
const echoT = (k: string) => k;

const labels = (events: ActivityEvent[]) => events.map((e) => e.label);
const times = (events: ActivityEvent[]) => events.map((e) => e.at);

// ─── The count contract ──────────────────────────────────────────────────────

test("only the two recognised audit actions become rows — audit.length is NOT the count", () => {
  const order = makeOrder();
  const events = buildActivityEvents(
    order,
    [
      makeAudit({ id: 1, action: "order.fulfillment.rescheduled" }),
      makeAudit({ id: 2, action: "order.payment.method_corrected" }),
      // Recorded by the server, deliberately not drawn here.
      makeAudit({ id: 3, action: "order.status.overridden" }),
    ],
    echoT,
  );

  // created + rescheduled + method_corrected. The third audit event is dropped,
  // so anything that labels the collapsed block with `audit.events.length` (3)
  // would be off by one against what opening it reveals.
  assert.equal(events.length, 3);
  assert.ok(labels(events).includes("activitySerieMoved"));
  assert.ok(labels(events).includes("activityPaymentMethodCorrected"));
});

test("a payment_reference audit row is labelled apart from a method correction", () => {
  const events = buildActivityEvents(
    makeOrder(),
    [makeAudit({ action: "order.payment.method_corrected", field: "payment_reference" })],
    echoT,
  );
  assert.ok(labels(events).includes("activityPaymentReferenceRecorded"));
  assert.ok(!labels(events).includes("activityPaymentMethodCorrected"));
});

test("the reason note is appended to a recorded change", () => {
  const events = buildActivityEvents(
    makeOrder(),
    [makeAudit({ reason_note: "client absent" })],
    echoT,
  );
  assert.ok(labels(events).includes("activitySerieMoved (client absent)"));
});

// ─── The loading transient ───────────────────────────────────────────────────

test("undefined and [] audit events give the same trail, and it is never empty", () => {
  const order = makeOrder();
  const pending = buildActivityEvents(order, undefined, echoT);
  const empty = buildActivityEvents(order, [], echoT);

  assert.deepEqual(labels(pending), labels(empty));
  // created_at always yields a row, so the count shown while the audit fetch is
  // in flight can only rise — it can never read "0" and claim nothing happened.
  assert.ok(pending.length >= 1);
});

test("the in-flight count is a lower bound: the audit rows only add to it", () => {
  const order = makeOrder({ accepted_at: "2026-08-14T09:05:00Z" });
  const before = buildActivityEvents(order, undefined, echoT);
  const after = buildActivityEvents(order, [makeAudit()], echoT);
  assert.ok(after.length > before.length);
});

// ─── Ordering ────────────────────────────────────────────────────────────────

test("events are chronological, not grouped by construction order", () => {
  const order = makeOrder({
    created_at: "2026-08-14T09:00:00Z",
    accepted_at: "2026-08-14T09:30:00Z",
    in_kitchen_at: "2026-08-14T10:00:00Z",
  });
  // Pushed last (audit loop runs before the lifecycle stamps) but stamped in
  // the middle: it has to land between acceptance and kitchen.
  const events = buildActivityEvents(
    order,
    [makeAudit({ created_at: "2026-08-14T09:45:00Z" })],
    echoT,
  );

  assert.deepEqual(times(events), [
    "2026-08-14T09:00:00Z",
    "2026-08-14T09:30:00Z",
    "2026-08-14T09:45:00Z",
    "2026-08-14T10:00:00Z",
  ]);
});

// ─── Discounts: one source, never two ────────────────────────────────────────

test("discount_audit is the source when present", () => {
  const events = buildActivityEvents(
    makeOrder({
      discount_amount: 12,
      external_metadata: {
        discount_audit: [
          { action: "applied", type: "percent", value: 10, at: "2026-08-14T09:10:00Z" },
          { action: "removed", at: "2026-08-14T09:20:00Z" },
        ],
      },
    } as Partial<Order>),
    [],
    echoT,
  );

  const discountRows = labels(events).filter((l) => l.startsWith("activityDiscount"));
  // Two audited moves, and the discount_amount fallback did NOT also fire —
  // three rows here would double-count one discount.
  assert.equal(discountRows.length, 2);
  assert.ok(discountRows[0].startsWith("activityDiscountApplied"));
  assert.equal(discountRows[1], "activityDiscountRemoved");
});

test("a discount set at creation falls back to discount_amount, anchored to created_at", () => {
  const order = makeOrder({ discount_amount: 12 });
  const events = buildActivityEvents(order, [], echoT);

  const discountRows = events.filter((e) => e.label.startsWith("activityDiscount"));
  assert.equal(discountRows.length, 1);
  assert.equal(discountRows[0].at, order.created_at);
});

test("no discount, no discount row", () => {
  const events = buildActivityEvents(makeOrder({ discount_amount: 0 }), [], echoT);
  assert.equal(labels(events).filter((l) => l.startsWith("activityDiscount")).length, 0);
});

// ─── Lifecycle labelling ─────────────────────────────────────────────────────

test("completed_at on a rejected order reads as cancelled, not completed", () => {
  const events = buildActivityEvents(
    makeOrder({ status: "rejected", completed_at: "2026-08-14T11:00:00Z" }),
    [],
    echoT,
  );
  assert.ok(labels(events).includes("activityCancelled"));
  assert.ok(!labels(events).includes("activityCompleted"));
});

test("completed_at on a delivered order reads as completed", () => {
  const events = buildActivityEvents(
    makeOrder({ status: "delivered", completed_at: "2026-08-14T11:00:00Z" }),
    [],
    echoT,
  );
  assert.ok(labels(events).includes("activityCompleted"));
});

test("a scheduled slot is marked future so it can render muted", () => {
  const events = buildActivityEvents(
    makeOrder({ scheduled_for: "2026-08-16T12:00:00Z" }),
    [],
    echoT,
  );
  const scheduled = events.find((e) => e.at === "2026-08-16T12:00:00Z");
  assert.ok(scheduled);
  assert.equal(scheduled.future, true);
  // Every other row is present-tense.
  assert.equal(events.filter((e) => e.future).length, 1);
});

test("the source names where the order came from", () => {
  const withSource = buildActivityEvents(makeOrder({ order_source: "web" }), [], echoT);
  const without = buildActivityEvents(makeOrder({ order_source: undefined }), [], echoT);
  assert.ok(withSource[0].label.startsWith("activityCreatedFrom"));
  assert.equal(without[0].label, "activityCreatedSimple");
});
