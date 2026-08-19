// Turning an order plus its restaurant's configured pipeline into the steps the
// detail view draws.
//
// The admin used to hardcode five steps — received → accepted → in_kitchen →
// ready → served — identical for every order type, while the restaurant's own
// pipeline (settings → commandes → workflow builder) was consumed only by the
// POS. Two consequences: a delivery order had no step of its own for the
// delivery leg (out_for_delivery collapsed into "Prête"), and a renamed or
// added stage never showed up in the admin at all.
//
// This module maps the order onto the OWNER's stages instead, and falls back to
// the server's own default template when there is no workflow to read.
//
// ─── Keep in sync with foodyserver ──────────────────────────────────────────
// `statusStageKind` and `KIND_RANK` are verbatim mirrors of statusKind() and
// kindRank() in foodyserver/internal/orders/workflow.go. FALLBACK_STAGE_KINDS
// mirrors fullTemplate() in workflow_templates.go. If any of those change
// server-side, change them here in the same PR.

import type { Order, OrderWorkflow, WorkflowStage, WorkflowStageKind } from '@/lib/api';

/** Position of each stage kind along the forward pipeline. Mirror of kindRank(). */
export const KIND_RANK: Record<WorkflowStageKind, number> = {
  received: 0,
  in_progress: 1,
  ready: 2,
  out_for_delivery: 3,
  completed: 4,
};

/**
 * Which stage kind an order's status corresponds to. Mirror of statusKind().
 *
 * Everything unrecognised lands on `received`, matching the server's default
 * branch — which is also where `scheduled`, `pending_review`, `accepted`,
 * `rejected`, `cancelled` and `refunded` sit.
 */
export function statusStageKind(status: string): WorkflowStageKind {
  if (status === 'in_kitchen') return 'in_progress';
  if (status === 'ready' || status === 'ready_for_pickup' || status === 'ready_for_delivery') {
    return 'ready';
  }
  if (status === 'out_for_delivery') return 'out_for_delivery';
  if (status === 'served' || status === 'received' || status === 'picked_up' || status === 'delivered') {
    return 'completed';
  }
  return 'received';
}

/** Statuses that mean the order is dead. They get a terminal danger node. */
const CANCELLED_STATUSES = new Set(['rejected', 'cancelled']);

export type StepState = 'done' | 'current' | 'pending' | 'cancelled';

export interface StepperStage {
  /** Stable key for React. The stage id when there is one, else kind + index. */
  key: string;
  /** What to render. Owner free-text for a configured workflow, or a
   *  translated label for a fallback stage. NEVER pass this through t(). */
  label: string;
  kind: WorkflowStageKind;
  state: StepState;
  /** ISO stamp for when the order reached this stage, when one is known. */
  at?: string;
  /** Secondary line under the label, e.g. "Acceptée 09:52" on the first stage. */
  note?: string;
}

/**
 * Stage kinds of the server's "full" default template, per order type.
 * Mirror of fullTemplate(). Note there is no `accepted` stage: the server's own
 * default goes Reçue → En cuisine → Prête → [En livraison] → Livrée/Récupérée/Servie.
 */
const FALLBACK_STAGE_KINDS: Record<string, ReadonlyArray<{ kind: WorkflowStageKind; labelKey: string }>> = {
  delivery: [
    { kind: 'received', labelKey: 'orderReceived' },
    { kind: 'in_progress', labelKey: 'inKitchen' },
    { kind: 'ready', labelKey: 'statusReady' },
    { kind: 'out_for_delivery', labelKey: 'statusOutForDelivery' },
    { kind: 'completed', labelKey: 'statusDelivered' },
  ],
  pickup: [
    { kind: 'received', labelKey: 'orderReceived' },
    { kind: 'in_progress', labelKey: 'inKitchen' },
    { kind: 'ready', labelKey: 'statusReady' },
    { kind: 'completed', labelKey: 'statusPickedUp' },
  ],
  dine_in: [
    { kind: 'received', labelKey: 'orderReceived' },
    { kind: 'in_progress', labelKey: 'inKitchen' },
    { kind: 'ready', labelKey: 'statusReady' },
    { kind: 'completed', labelKey: 'served' },
  ],
};

interface ResolvedStage {
  id?: number;
  label: string;
  kind: WorkflowStageKind;
}

/** The owner's stages when there are any, else the server's default template. */
function resolveStages(
  order: Order,
  workflow: OrderWorkflow | null | undefined,
  t: (k: string) => string,
): ResolvedStage[] {
  const configured: WorkflowStage[] = workflow?.stages ?? [];
  if (configured.length > 0) {
    // Owner free-text, rendered verbatim. Passing it through t() would be the
    // dynamic-key trap that check:i18n cannot see.
    return configured.map((s) => ({ id: s.id, label: s.name, kind: s.kind }));
  }
  const fallback = FALLBACK_STAGE_KINDS[order.order_type] ?? FALLBACK_STAGE_KINDS.dine_in;
  return fallback.map((s) => ({ label: t(s.labelKey), kind: s.kind }));
}

/**
 * Which stage the order currently sits in, by decreasing confidence:
 *   1. an exact match on workflow_stage_id
 *   2. the FIRST stage whose kind matches the order's status
 *   3. the LAST stage that ranks below the order's status — covers a pickup
 *      pipeline meeting an out_for_delivery status, where no stage matches
 *   4. the first stage
 */
function findCurrentIndex(order: Order, stages: ResolvedStage[]): number {
  if (stages.length === 0) return -1;

  if (order.workflow_stage_id != null) {
    const exact = stages.findIndex((s) => s.id != null && s.id === order.workflow_stage_id);
    if (exact >= 0) return exact;
  }

  const orderRank = KIND_RANK[statusStageKind(order.status)];

  const sameRank = stages.findIndex((s) => KIND_RANK[s.kind] === orderRank);
  if (sameRank >= 0) return sameRank;

  let below = -1;
  for (let i = 0; i < stages.length; i++) {
    if (KIND_RANK[stages[i].kind] < orderRank) below = i;
  }
  if (below >= 0) return below;

  return 0;
}

/**
 * When the order reached a stage of this kind.
 *
 * The server also records received_at and prepared_at, which are not on the
 * client Order type, so out_for_delivery carries no stamp.
 */
function stampForKind(order: Order, kind: WorkflowStageKind): string | undefined {
  switch (kind) {
    case 'received':
      return order.created_at;
    case 'in_progress':
      return order.in_kitchen_at;
    case 'ready':
      return order.ready_at;
    case 'completed':
      return order.completed_at;
    default:
      return undefined;
  }
}

export interface BuildStepperOptions {
  /** Label for the terminal node on a cancelled order. */
  cancelledLabel: string;
  /** Template for the "accepted" note on the first stage. Receives {time}. */
  acceptedNote?: string;
}

/**
 * Build the steps to render for one order.
 *
 * Returns an empty array only when there are no stages at all, which cannot
 * happen through resolveStages — the fallback always yields four or five.
 */
export function buildStepperStages(
  order: Order,
  workflow: OrderWorkflow | null | undefined,
  t: (k: string) => string,
  opts: BuildStepperOptions,
): StepperStage[] {
  const resolved = resolveStages(order, workflow, t);
  if (resolved.length === 0) return [];

  const currentIdx = findCurrentIndex(order, resolved);
  const cancelled = CANCELLED_STATUSES.has(order.status);

  // Assign each timestamp to the FIRST stage of its kind, so a custom pipeline
  // with two "in_progress" stages does not show in_kitchen_at on both.
  const stampedKinds = new Set<WorkflowStageKind>();

  const steps: StepperStage[] = resolved.map((stage, i) => {
    let at: string | undefined;
    if (!stampedKinds.has(stage.kind)) {
      at = stampForKind(order, stage.kind);
      if (at) stampedKinds.add(stage.kind);
    }
    const reached = i <= currentIdx;
    return {
      key: stage.id != null ? `stage-${stage.id}` : `${stage.kind}-${i}`,
      label: stage.label,
      kind: stage.kind,
      state: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending',
      // A stamp on a stage the order has not reached would be a lie: the
      // timestamps are per-kind, not per-stage.
      at: reached ? at : undefined,
    };
  });

  // The order was accepted, but the workflow model has no "accepted" stage —
  // the server's own default template does not define one. Rather than invent a
  // stage the owner never configured, hang it off the first stage as a note.
  if (opts.acceptedNote && order.accepted_at && steps.length > 0) {
    steps[0].note = opts.acceptedNote;
  }

  if (cancelled) {
    // Keep the stages the order actually reached, then replace everything after
    // with one terminal danger node. Better than the old behaviour, which
    // returned index -1 and rendered an entirely empty progression.
    const kept = steps.slice(0, Math.max(0, currentIdx + 1)).map((s) => ({ ...s, state: 'done' as StepState }));
    return [
      ...kept,
      {
        key: 'cancelled',
        label: opts.cancelledLabel,
        kind: 'completed' as WorkflowStageKind,
        state: 'cancelled' as StepState,
        at: order.completed_at,
      },
    ];
  }

  return steps;
}
