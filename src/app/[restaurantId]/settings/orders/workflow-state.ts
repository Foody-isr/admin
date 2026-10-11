import type { OrderWorkflow, WorkflowGuidedActions, WorkflowOrderType, WorkflowStage, WorkflowStageKind } from '@/lib/api';

export const ORDER_TYPES: WorkflowOrderType[] = ['pickup', 'dine_in', 'delivery'];
export const STAGE_KINDS: WorkflowStageKind[] = ['received', 'in_progress', 'ready', 'out_for_delivery', 'completed'];
export const TRIGGERS = ['trigger_payment_confirmed', 'trigger_production_done', 'trigger_courier_assigned', 'trigger_courier_delivered'] as const;
export const ACTIONS = ['accept_sends_to_kitchen', 'accept_adds_to_production', 'accept_prompts_whatsapp', 'delivery_reminder_enabled'] as const;
export type WorkflowDraft = { stages: WorkflowStage[]; actions: WorkflowGuidedActions };
export type WorkflowIssue = { index: number; field: 'name' | 'kind' | typeof TRIGGERS[number]; key: string };

/** Create an empty draft without inventing persisted stages. */
export function emptyWorkflow(): WorkflowDraft {
  return { stages: [], actions: { accept_sends_to_kitchen: false, accept_adds_to_production: false, accept_prompts_whatsapp: false, delivery_reminder_enabled: false } };
}

/** Check the editable response and retain stage identities and historical colors. */
export function readWorkflow(value: OrderWorkflow, expectedType?: WorkflowOrderType): WorkflowDraft {
  if (!value || !ORDER_TYPES.includes(value.order_type) || (expectedType && value.order_type !== expectedType) || !Array.isArray(value.stages) || typeof value.template_source !== 'string') throw new Error('Incomplete workflow');
  const ids = new Set<number>();
  for (const stage of value.stages) {
    if (!stage || typeof stage.name !== 'string' || !STAGE_KINDS.includes(stage.kind) || [...TRIGGERS, 'notify_customer'].some(key => typeof stage[key as keyof WorkflowStage] !== 'boolean') || (stage.color != null && typeof stage.color !== 'string') || (stage.customer_message != null && typeof stage.customer_message !== 'string')) throw new Error('Incomplete stage');
    if (stage.id != null && (!Number.isSafeInteger(stage.id) || stage.id <= 0 || ids.has(stage.id))) throw new Error('Invalid stage identity');
    if (stage.id != null) ids.add(stage.id);
  }
  const actions = emptyWorkflow().actions;
  for (const key of ACTIONS) {
    if (value[key] != null && typeof value[key] !== 'boolean') throw new Error('Incomplete guided actions');
    actions[key] = value[key] ?? false;
  }
  return { stages: value.stages.map(stage => ({ ...stage })), actions };
}

/** Compare editable fields, optionally allowing the server to trim names and assign IDs. */
export function workflowSignature(draft: WorkflowDraft, semantic = false): string {
  return JSON.stringify({
    stages: draft.stages.map(stage => ({
      id: semantic ? undefined : stage.id,
      name: semantic ? stage.name.trim() : stage.name,
      kind: stage.kind, color: stage.color ?? '', customer_message: stage.customer_message ?? '',
      notify_customer: stage.notify_customer,
      ...Object.fromEntries(TRIGGERS.map(key => [key, stage[key]])),
    })),
    actions: ACTIONS.map(key => draft.actions[key]),
  });
}

/** Match backend ordering and uniqueness constraints before replacing a whole flow. */
export function validateWorkflow(draft: WorkflowDraft, type: WorkflowOrderType): WorkflowIssue | null {
  if (draft.stages.length < 1 || draft.stages.length > 12) return { index: 0, field: 'name', key: 'wfStageLimit' };
  const seen = new Set<string>();
  let previousRank = -1;
  for (let index = 0; index < draft.stages.length; index++) {
    const stage = draft.stages[index];
    if (!stage.name.trim()) return { index, field: 'name', key: 'wfNameRequired' };
    const rank = STAGE_KINDS.indexOf(stage.kind);
    if (rank < previousRank || rank < 0 || (stage.kind === 'out_for_delivery' && type !== 'delivery')) return { index, field: 'kind', key: 'wfOrderRequired' };
    previousRank = rank;
    for (const key of TRIGGERS) {
      if (!stage[key]) continue;
      if (seen.has(key)) return { index, field: key, key: 'wfUniqueTrigger' };
      seen.add(key);
    }
  }
  return null;
}
