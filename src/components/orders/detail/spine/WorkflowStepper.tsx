'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import type { Order } from '@/lib/api';
import { buildStepperStages, type StepperStage, type StepState } from '@/lib/orders/workflow-stepper';
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
 * The workflow is fetched inside this component, behind a module-level cache,
 * so none of the three hosts needed rewiring. A missing workflow, an empty one
 * or a 403 all fall back silently to the server's own default template — never
 * an error, never a spinner on the most important element on the screen.
 */

function StepNode({ state }: { state: StepState }) {
  const done = state === 'done';
  const active = state === 'current';
  const cancelled = state === 'cancelled';

  return (
    <div
      className="w-7 h-7 rounded-full grid place-items-center relative z-[1] shrink-0"
      style={{
        background: cancelled
          ? 'var(--danger-500)'
          : active
            ? 'var(--brand-500)'
            : done
              ? 'var(--success-500)'
              : 'var(--surface-3)',
        color: done || active || cancelled ? '#fff' : 'var(--fg-muted)',
        boxShadow: active
          ? '0 0 0 4px color-mix(in oklab, var(--brand-500) 22%, transparent)'
          : undefined,
      }}
    >
      {cancelled ? (
        <XIcon className="w-3.5 h-3.5" />
      ) : done ? (
        <CheckIcon className="w-3.5 h-3.5" />
      ) : null}
      {active && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full opacity-50 motion-safe:animate-ping"
          style={{ background: 'var(--brand-500)' }}
        />
      )}
    </div>
  );
}

function connectorColor(stage: StepperStage, next: StepperStage | undefined): string {
  if (!next) return 'transparent';
  return stage.state === 'done' ? 'var(--brand-500)' : 'var(--line)';
}

function VerticalStepper({ stages }: { stages: StepperStage[] }) {
  return (
    <ol className="flex flex-col">
      {stages.map((stage, i) => {
        const next = stages[i + 1];
        return (
          <li
            key={stage.key}
            className="relative flex items-start gap-[var(--s-3)] pb-[var(--s-4)] last:pb-0"
          >
            {next && (
              <span
                aria-hidden
                className="absolute top-7 bottom-0 start-[13px] w-[2px]"
                style={{ background: connectorColor(stage, next) }}
              />
            )}
            <StepNode state={stage.state} />
            <div className="min-w-0 flex-1 pt-1">
              <div
                className={`text-fs-sm font-medium leading-tight ${
                  stage.state === 'pending' ? 'text-[var(--fg-subtle)]' : 'text-[var(--fg)]'
                }`}
              >
                {stage.label}
              </div>
              {stage.note && (
                <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{stage.note}</div>
              )}
              {stage.at && (
                <div className="num text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                  {formatTime(stage.at)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HorizontalStepper({ stages }: { stages: StepperStage[] }) {
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
                className="absolute top-[14px] start-1/2 end-[-50%] h-[2px]"
                style={{ background: connectorColor(stage, next) }}
              />
            )}
            <div className="mx-auto mb-2 w-7">
              <StepNode state={stage.state} />
            </div>
            {/* A constant two-line box so a wrapping label does not push this
                step's timestamp out of line with its neighbours'. */}
            <div
              className={`text-fs-xs font-medium leading-tight min-h-[2.4em] flex items-start justify-center px-0.5 ${
                stage.state === 'pending' ? 'text-[var(--fg-muted)]' : 'text-[var(--fg)]'
              }`}
            >
              {stage.label}
            </div>
            {stage.at && (
              <div className="num text-[10px] text-[var(--fg-subtle)] mt-0.5">
                {formatTime(stage.at)}
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
  orientation = 'vertical',
  t,
}: {
  order: Order;
  /** 'vertical' for the spine, 'horizontal' for the ribbon below lg. */
  orientation?: 'vertical' | 'horizontal';
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

  return orientation === 'vertical' ? (
    <VerticalStepper stages={stages} />
  ) : (
    <HorizontalStepper stages={stages} />
  );
}
