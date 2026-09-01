'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import type { Order } from '@/lib/api';
import {
  buildStepperStages,
  statusStageKind,
  type StepperStage,
  type StepState,
} from '@/lib/orders/workflow-stepper';
import { useOrderWorkflows, pickWorkflow } from '@/lib/orders/use-order-workflows';
import { formatTime } from '@/lib/orders/order-time';

/**
 * The order's progression, drawn from the restaurant's OWN pipeline.
 *
 * The admin used to hardcode five steps, identical for every order type, while
 * the pipeline the owner configured in settings → commandes fed only the POS.
 * Two things that cost: a delivery order had no step for the delivery leg
 * (out_for_delivery collapsed into "Prête"), and a renamed or added stage never
 * appeared here at all.
 *
 * Rendered as a permanent horizontal band under the head. It used to have a
 * vertical variant for a left rail; that rail is gone, and with it the second
 * scrollbar it forced on the screen.
 *
 * The workflow is fetched inside this component, behind a module-level cache,
 * so none of the three hosts needed rewiring. A missing workflow, an empty one
 * or a 403 all fall back silently to the server's own default template — never
 * an error, never a spinner on the most important element on the screen.
 */

function StepNode({ state, activeColor }: { state: StepState; activeColor: string }) {
  const done = state === 'done';
  const active = state === 'current';
  const cancelled = state === 'cancelled';
  const completed = active && activeColor === 'var(--success-500)';

  return (
    <div
      className="w-6 h-6 rounded-full grid place-items-center relative z-[1] shrink-0"
      style={{
        background: cancelled
          ? 'var(--danger-500)'
          : active
            ? activeColor
            : done
              ? 'var(--success-500)'
              : 'var(--surface-3)',
        color: done || active || cancelled ? '#fff' : 'var(--fg-muted)',
        boxShadow: active
          ? `0 0 0 4px color-mix(in oklab, ${activeColor} 22%, transparent)`
          : undefined,
      }}
    >
      {cancelled ? (
        <XIcon className="w-3.5 h-3.5" />
      ) : done || completed ? (
        <CheckIcon className="w-3.5 h-3.5" />
      ) : null}
    </div>
  );
}

function connectorColor(stage: StepperStage, next: StepperStage | undefined): string {
  if (!next) return 'transparent';
  return stage.state === 'done' ? 'var(--success-500)' : 'var(--line)';
}

function HorizontalStepper({ stages, activeColor }: { stages: StepperStage[]; activeColor: string }) {
  return (
    <div
      className="grid relative"
      style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}
    >
      {stages.map((stage, i) => {
        const next = stages[i + 1];
        return (
          <div key={stage.key} className="text-center relative min-w-0">
            {next && (
              <span
                aria-hidden
                className="absolute top-[12px] start-1/2 end-[-50%] h-[2px]"
                style={{ background: connectorColor(stage, next) }}
              />
            )}
            <div className="mx-auto mb-1 w-6">
              <StepNode state={stage.state} activeColor={activeColor} />
            </div>
            <div
              className={`text-fs-xs font-semibold leading-tight min-h-[1.2em] flex items-start justify-center px-0.5 ${
                stage.state === 'pending' ? 'text-[var(--fg-muted)]' : 'text-[var(--fg)]'
              }`}
            >
              {stage.label}
            </div>
            {(stage.at || stage.note) && (
              <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5 leading-tight truncate px-1">
                {stage.at && <span className="num">{formatTime(stage.at)}</span>}
                {stage.at && stage.note && <span className="mx-1 opacity-40">·</span>}
                {stage.note}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowStepper({
  order,
  t,
}: {
  order: Order;
  t: (k: string) => string;
}) {
  const workflows = useOrderWorkflows(order.restaurant_id);
  const workflow = pickWorkflow(workflows, order.order_type);

  const stages = buildStepperStages(order, workflow, t, {
    cancelledLabel: t('statusRejected'),
    // The workflow model has no "accepted" stage — the server's own default
    // template goes Reçue → En cuisine. Rather than invent one the owner never
    // configured, the acceptance hangs off the first stage as a note.
    acceptedNote: order.accepted_at
      ? `${t('statusAccepted')} ${formatTime(order.accepted_at)}`
      : undefined,
  });

  if (stages.length === 0) return null;

  const activeColor = order.status === 'scheduled'
    ? 'var(--info-500)'
    : statusStageKind(order.status) === 'completed'
      ? 'var(--success-500)'
      : 'var(--brand-500)';

  return <HorizontalStepper stages={stages} activeColor={activeColor} />;
}
