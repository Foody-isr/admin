import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KIND_RANK,
  statusStageKind,
  buildStepperStages,
  type StepperStage,
} from "@/lib/orders/workflow-stepper";
import type { Order, OrderWorkflow, WorkflowStage, WorkflowStageKind } from "@/lib/api";

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

const ORDER_TYPES = ["delivery", "pickup", "dine_in"] as const;

// t() echoes the key, exactly like i18n.tsx on a miss. Fallback stage labels
// therefore come back as their key, which makes them easy to assert on.
const echoT = (k: string) => k;

const OPTS = { cancelledLabel: "Annulée" };

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

function stage(name: string, kind: WorkflowStageKind, id?: number): WorkflowStage {
  return {
    id,
    name,
    kind,
    trigger_payment_confirmed: false,
    trigger_production_done: false,
    trigger_courier_assigned: false,
    trigger_courier_delivered: false,
    notify_customer: false,
  };
}

function workflow(stages: WorkflowStage[], order_type: OrderWorkflow["order_type"] = "delivery"): OrderWorkflow {
  return { id: 1, order_type, template_source: "custom", stages };
}

const labels = (steps: StepperStage[]) => steps.map((s) => s.label);
const states = (steps: StepperStage[]) => steps.map((s) => s.state);
const currentLabel = (steps: StepperStage[]) => steps.find((s) => s.state === "current")?.label;

// ─── Mirror of the server ────────────────────────────────────────────────────

test("statusStageKind mirrors foodyserver statusKind() for every server status", () => {
  const expected: Record<string, WorkflowStageKind> = {
    in_kitchen: "in_progress",
    ready: "ready",
    ready_for_pickup: "ready",
    ready_for_delivery: "ready",
    out_for_delivery: "out_for_delivery",
    served: "completed",
    received: "completed",
    picked_up: "completed",
    delivered: "completed",
    // The server's default branch.
    scheduled: "received",
    pending_review: "received",
    accepted: "received",
    rejected: "received",
    cancelled: "received",
    refunded: "received",
  };
  for (const s of SERVER_STATUSES) {
    assert.equal(statusStageKind(s), expected[s], `statusStageKind("${s}")`);
  }
});

test("KIND_RANK mirrors foodyserver kindRank()", () => {
  assert.deepEqual(KIND_RANK, {
    received: 0,
    in_progress: 1,
    ready: 2,
    out_for_delivery: 3,
    completed: 4,
  });
});

// ─── Fallback template ───────────────────────────────────────────────────────

test("with no workflow, delivery falls back to the server's five-stage default", () => {
  const steps = buildStepperStages(makeOrder({ order_type: "delivery" }), null, echoT, OPTS);
  assert.deepEqual(labels(steps), [
    "orderReceived",
    "inKitchen",
    "statusReady",
    "statusOutForDelivery",
    "statusDelivered",
  ]);
});

test("with no workflow, pickup and dine_in fall back to four stages and differ only at the end", () => {
  const pickup = buildStepperStages(makeOrder({ order_type: "pickup" }), null, echoT, OPTS);
  assert.deepEqual(labels(pickup), ["orderReceived", "inKitchen", "statusReady", "statusPickedUp"]);

  const dineIn = buildStepperStages(makeOrder({ order_type: "dine_in" }), null, echoT, OPTS);
  assert.deepEqual(labels(dineIn), ["orderReceived", "inKitchen", "statusReady", "served"]);
});

test("the delivery leg finally has a step of its own", () => {
  // The old hardcoded model collapsed out_for_delivery into "Prête", so an
  // order being driven to the customer looked identical to one on the pass.
  const steps = buildStepperStages(
    makeOrder({ order_type: "delivery", status: "out_for_delivery" }),
    null,
    echoT,
    OPTS,
  );
  assert.equal(currentLabel(steps), "statusOutForDelivery");
});

test("`accepted` is not a stage — the server's own template has none", () => {
  const steps = buildStepperStages(makeOrder({ status: "accepted" }), null, echoT, OPTS);
  assert.ok(!labels(steps).includes("statusAccepted"));
  // It sits at "received", like every pre-production status.
  assert.equal(currentLabel(steps), "orderReceived");
});

test("an empty stage list is treated as no workflow at all", () => {
  const steps = buildStepperStages(makeOrder(), workflow([]), echoT, OPTS);
  assert.deepEqual(labels(steps), [
    "orderReceived",
    "inKitchen",
    "statusReady",
    "statusOutForDelivery",
    "statusDelivered",
  ]);
});

test("an unknown order type degrades to the dine_in shape rather than throwing", () => {
  const steps = buildStepperStages(
    makeOrder({ order_type: "catering" as Order["order_type"] }),
    null,
    echoT,
    OPTS,
  );
  assert.deepEqual(labels(steps), ["orderReceived", "inKitchen", "statusReady", "served"]);
});

// ─── Every status × every order type ─────────────────────────────────────────

test("every status on every order type yields exactly one current stage and never throws", () => {
  for (const type of ORDER_TYPES) {
    for (const status of SERVER_STATUSES) {
      const order = makeOrder({ order_type: type, status });
      for (const wf of [null, workflow(SEEDED_DELIVERY), workflow(TWO_IN_PROGRESS)]) {
        const steps = buildStepperStages(order, wf, echoT, OPTS);
        assert.ok(steps.length > 0, `${type}/${status}: no steps`);
        const currents = steps.filter((s) => s.state === "current");
        const cancelledNodes = steps.filter((s) => s.state === "cancelled");
        if (status === "rejected" || status === "cancelled") {
          assert.equal(cancelledNodes.length, 1, `${type}/${status}: expected one cancelled node`);
          assert.equal(currents.length, 0, `${type}/${status}: cancelled orders have no current`);
        } else {
          assert.equal(currents.length, 1, `${type}/${status}: expected exactly one current`);
        }
      }
    }
  }
});

const SEEDED_DELIVERY: WorkflowStage[] = [
  stage("Reçue", "received", 10),
  stage("En cuisine", "in_progress", 11),
  stage("Prête", "ready", 12),
  stage("En livraison", "out_for_delivery", 13),
  stage("Livrée", "completed", 14),
];

const TWO_IN_PROGRESS: WorkflowStage[] = [
  stage("Reçue", "received", 20),
  stage("Préparation froide", "in_progress", 21),
  stage("Cuisson", "in_progress", 22),
  stage("Prête", "ready", 23),
  stage("Livrée", "completed", 24),
];

// ─── The owner's own pipeline ────────────────────────────────────────────────

test("a configured workflow renders the owner's names verbatim, never through t()", () => {
  const steps = buildStepperStages(
    makeOrder({ status: "in_kitchen" }),
    workflow([stage("Reçue", "received"), stage("Sur le feu", "in_progress"), stage("Partie", "completed")]),
    // A t() that would corrupt any label it touched, proving none are passed to it.
    () => "TRANSLATED",
    OPTS,
  );
  assert.deepEqual(labels(steps), ["Reçue", "Sur le feu", "Partie"]);
});

test("workflow_stage_id wins over the status-derived guess", () => {
  // Status says in_progress, which would land on the FIRST in_progress stage
  // (id 21). The stage id pins it to the second one instead.
  const steps = buildStepperStages(
    makeOrder({ status: "in_kitchen", workflow_stage_id: 22 }),
    workflow(TWO_IN_PROGRESS),
    echoT,
    OPTS,
  );
  assert.equal(currentLabel(steps), "Cuisson");
  assert.deepEqual(states(steps), ["done", "done", "current", "pending", "pending"]);
});

test("without a stage id, two stages of the same kind resolve to the first", () => {
  const steps = buildStepperStages(
    makeOrder({ status: "in_kitchen" }),
    workflow(TWO_IN_PROGRESS),
    echoT,
    OPTS,
  );
  assert.equal(currentLabel(steps), "Préparation froide");
});

test("a stale workflow_stage_id that matches nothing falls back to the status", () => {
  const steps = buildStepperStages(
    makeOrder({ status: "ready", workflow_stage_id: 9999 }),
    workflow(SEEDED_DELIVERY),
    echoT,
    OPTS,
  );
  assert.equal(currentLabel(steps), "Prête");
});

test("a status ranking above every stage lands on the last stage below it", () => {
  // A pickup pipeline has no out_for_delivery stage. An order somehow sitting
  // at out_for_delivery must not fall back to stage 0 — it belongs at "Prête".
  const pickupPipeline = workflow(
    [
      stage("Reçue", "received"),
      stage("En cuisine", "in_progress"),
      stage("Prête", "ready"),
      stage("Récupérée", "completed"),
    ],
    "pickup",
  );
  const steps = buildStepperStages(
    makeOrder({ order_type: "pickup", status: "out_for_delivery" }),
    pickupPipeline,
    echoT,
    OPTS,
  );
  assert.equal(currentLabel(steps), "Prête");
});

test("a pipeline whose every stage outranks the status lands on the first stage", () => {
  const noReceived = workflow([stage("Prête", "ready"), stage("Livrée", "completed")]);
  const steps = buildStepperStages(makeOrder({ status: "pending_review" }), noReceived, echoT, OPTS);
  assert.equal(currentLabel(steps), "Prête");
  assert.deepEqual(states(steps), ["current", "pending"]);
});

// ─── States and timestamps ───────────────────────────────────────────────────

test("stages before the current are done, after it are pending", () => {
  const steps = buildStepperStages(
    makeOrder({ status: "ready_for_delivery" }),
    workflow(SEEDED_DELIVERY),
    echoT,
    OPTS,
  );
  assert.deepEqual(states(steps), ["done", "done", "current", "pending", "pending"]);
});

test("each timestamp lands on the first stage of its kind only", () => {
  const order = makeOrder({
    status: "ready",
    created_at: "2026-08-14T09:51:00Z",
    in_kitchen_at: "2026-08-14T09:53:00Z",
    ready_at: "2026-08-14T10:22:00Z",
  });
  const steps = buildStepperStages(order, workflow(TWO_IN_PROGRESS), echoT, OPTS);
  assert.equal(steps[0].at, "2026-08-14T09:51:00Z"); // received
  assert.equal(steps[1].at, "2026-08-14T09:53:00Z"); // first in_progress
  assert.equal(steps[2].at, undefined); // second in_progress must NOT reuse it
  assert.equal(steps[3].at, "2026-08-14T10:22:00Z"); // ready
});

test("a stage the order has not reached carries no timestamp", () => {
  // completed_at is absent anyway here, but the guard also protects against a
  // server that stamps a later field early.
  const order = makeOrder({ status: "in_kitchen", completed_at: "2026-08-14T11:00:00Z" });
  const steps = buildStepperStages(order, workflow(SEEDED_DELIVERY), echoT, OPTS);
  const completed = steps[steps.length - 1];
  assert.equal(completed.state, "pending");
  assert.equal(completed.at, undefined);
});

test("out_for_delivery carries no stamp because the client type has no field for it", () => {
  const order = makeOrder({ status: "out_for_delivery", ready_at: "2026-08-14T10:22:00Z" });
  const steps = buildStepperStages(order, workflow(SEEDED_DELIVERY), echoT, OPTS);
  const leg = steps.find((s) => s.kind === "out_for_delivery");
  assert.equal(leg?.state, "current");
  assert.equal(leg?.at, undefined);
});

test("accepted_at becomes a note on the first stage instead of an invented stage", () => {
  const order = makeOrder({ status: "in_kitchen", accepted_at: "2026-08-14T09:52:00Z" });
  const steps = buildStepperStages(order, workflow(SEEDED_DELIVERY), echoT, {
    ...OPTS,
    acceptedNote: "Acceptée 09:52",
  });
  assert.equal(steps[0].note, "Acceptée 09:52");
  assert.equal(steps.length, SEEDED_DELIVERY.length, "no stage was invented");
});

test("no note when the order was never accepted", () => {
  const steps = buildStepperStages(makeOrder({ status: "pending_review" }), null, echoT, {
    ...OPTS,
    acceptedNote: "Acceptée 09:52",
  });
  assert.equal(steps[0].note, undefined);
});

// ─── Cancellation ────────────────────────────────────────────────────────────

test("a cancelled order keeps what it reached and ends on a danger node", () => {
  const order = makeOrder({ status: "rejected", completed_at: "2026-08-14T10:00:00Z" });
  const steps = buildStepperStages(order, workflow(SEEDED_DELIVERY), echoT, OPTS);
  // rejected maps to `received`, so only the first stage was reached.
  assert.deepEqual(labels(steps), ["Reçue", "Annulée"]);
  assert.deepEqual(states(steps), ["done", "cancelled"]);
  assert.equal(steps[1].at, "2026-08-14T10:00:00Z");
});

test("an order cancelled deeper in the pipeline keeps the stages it reached", () => {
  // workflow_stage_id pins it past the kitchen before it was cancelled.
  const order = makeOrder({ status: "cancelled", workflow_stage_id: 12 });
  const steps = buildStepperStages(order, workflow(SEEDED_DELIVERY), echoT, OPTS);
  assert.deepEqual(labels(steps), ["Reçue", "En cuisine", "Prête", "Annulée"]);
  assert.deepEqual(states(steps), ["done", "done", "done", "cancelled"]);
});

test("the legacy `cancelled` status behaves exactly like `rejected`", () => {
  const a = buildStepperStages(makeOrder({ status: "rejected" }), null, echoT, OPTS);
  const b = buildStepperStages(makeOrder({ status: "cancelled" }), null, echoT, OPTS);
  assert.deepEqual(labels(a), labels(b));
  assert.deepEqual(states(a), states(b));
});

test("keys are unique so React never sees a duplicate", () => {
  for (const wf of [null, workflow(SEEDED_DELIVERY), workflow(TWO_IN_PROGRESS)]) {
    for (const status of SERVER_STATUSES) {
      const steps = buildStepperStages(makeOrder({ status }), wf, echoT, OPTS);
      const keys = steps.map((s) => s.key);
      assert.equal(new Set(keys).size, keys.length, `duplicate key for status ${status}`);
    }
  }
});
