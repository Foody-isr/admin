'use client';

// Activity trail: order timestamps, discount audit and audit_events, merged and
// sorted.
//
// The audit fetch used to live here. It moved up to useOrderAudit for two
// reasons. The layout mounts this component twice — in the spine at large
// widths, in the context column below them — and a self-fetching component
// would issue the request twice; with events arriving as props it is pure.
// And the old code did `.catch(() => setAuditEvents([]))`, which made a server
// error indistinguishable from "this order has no history".

import { Fragment } from 'react';
import type { AuditEvent, Order } from '@/lib/api';
import { formatMoney } from '@/lib/format-money';
import { formatTime, formatEventDay, formatScheduledFor } from '@/lib/orders/order-time';
import { localizeSource } from '@/lib/orders/status-presentation';
import { localizePaymentMethod } from '@/lib/orders/payment';
import {
  FULFILLMENT_REASON_KEY,
  type FulfillmentChangeReasonCode,
} from '@/lib/orders/fulfillment-reason';

// ─── Activity timeline — events from order timestamps ────────────────────────

// One recorded manual-discount change, mirrored from the server's
// common.DiscountAuditEntry (external_metadata.discount_audit).
type DiscountAuditEntry = {
  action: string; // applied | removed
  type?: string; // fixed | percent
  value?: number;
  reason?: string;
  at: string;
};

// Builds the "Discount applied · …" label from whichever detail is available:
// a coupon code, a percentage/fixed value, or the resolved ₪ amount, plus the
// staff reason when present.
function discountAppliedLabel(
  t: (k: string) => string,
  d: { type?: string; value?: number; amount?: number; reason?: string; code?: string },
): string {
  const applied = t('activityDiscountApplied') || 'Discount applied';
  let desc = '';
  if (d.code) desc = d.code;
  else if (d.type === 'percent' && d.value != null) desc = `−${d.value}%`;
  else if (d.amount != null) desc = formatMoney(-d.amount);
  else if (d.value != null) desc = formatMoney(-d.value);
  const head = desc ? `${applied} · ${desc}` : applied;
  return d.reason ? `${head} · ${d.reason}` : head;
}

export function ActivityTimeline({
  order,
  auditEvents = [],
  auditFailed = false,
  t,
}: {
  order: Order;
  /** Recorded staff changes, fetched by the parent. */
  auditEvents?: AuditEvent[];
  /** A real failure, as opposed to a 403. A caller without orders.manage sees
   *  the trail the order itself carries and no message; anything else earns one
   *  muted line, because silently showing a shorter history is worse. */
  auditFailed?: boolean;
  t: (k: string) => string;
}) {

  const events: Array<{ at: string; label: string; future?: boolean }> = [];
  events.push({
    at: order.created_at,
    label: order.order_source
      ? (t('activityCreatedFrom') || 'Created from {source}').replace('{source}', localizeSource(order.order_source, t))
      : (t('activityCreatedSimple') || 'Order created'),
  });

  // Discount events. A discount set at creation carries no audit entry — anchor
  // it to the creation moment. Post-creation changes (apply / replace / remove
  // in "Modifier la commande") are recorded in external_metadata.discount_audit
  // with their own timestamps, so each renders where it happened.
  const discountAudit = Array.isArray(order.external_metadata?.discount_audit)
    ? (order.external_metadata!.discount_audit as DiscountAuditEntry[])
    : [];
  if (discountAudit.length > 0) {
    for (const a of discountAudit) {
      events.push({
        at: a.at,
        label:
          a.action === 'removed'
            ? t('activityDiscountRemoved') || 'Discount removed'
            : discountAppliedLabel(t, { type: a.type, value: a.value, reason: a.reason }),
      });
    }
  } else if ((order.discount_amount ?? 0) > 0) {
    events.push({
      at: order.created_at,
      label: discountAppliedLabel(t, {
        amount: order.discount_amount,
        reason: order.discount?.reason,
        code: order.discount?.code,
      }),
    });
  }
  if (order.scheduled_for) {
    events.push({
      at: order.scheduled_for,
      label: `${t('scheduledForLabel') || 'Scheduled for'} ${formatScheduledFor(order.scheduled_for)}`,
      future: true,
    });
  }
  // Recorded staff changes. The label names the person, the move and the reason:
  // an entry that only said "rescheduled" would leave the same question the
  // trail exists to answer.
  for (const a of auditEvents) {
    if (a.action === 'order.payment.method_corrected') {
      const who = a.actor_name || t('activityAuditUnknownActor') || 'staff';
      // Two shapes share this action: the method moving, and a reference being
      // attached. Label them apart — "payment corrected" on a row that only
      // recorded a slip number would misdescribe what happened.
      const base =
        a.field === 'payment_reference'
          ? (t('activityPaymentReferenceRecorded') || 'Payment reference recorded by {who}')
              .replace('{who}', who)
          : (t('activityPaymentMethodCorrected') || 'Payment method corrected from {from} to {to} by {who}')
              .replace('{from}', localizePaymentMethod(a.old_value ?? '', t))
              .replace('{to}', localizePaymentMethod(a.new_value ?? '', t))
              .replace('{who}', who);
      events.push({ at: a.created_at, label: a.reason_note ? `${base} (${a.reason_note})` : base });
      continue;
    }
    if (a.action !== 'order.fulfillment.rescheduled') continue;
    const who = a.actor_name || t('activityAuditUnknownActor') || 'staff';
    const reasonKey = a.reason_code
      ? FULFILLMENT_REASON_KEY[a.reason_code as FulfillmentChangeReasonCode]
      : undefined;
    const reason = reasonKey ? t(reasonKey) : '';
    const base = (t('activitySerieMoved') || 'Série moved from {from} to {to} by {who}')
      .replace('{from}', formatScheduledFor(a.old_value ?? ''))
      .replace('{to}', formatScheduledFor(a.new_value ?? ''))
      .replace('{who}', who);
    const detail = [reason, a.reason_note].filter(Boolean).join(' · ');
    events.push({ at: a.created_at, label: detail ? `${base} (${detail})` : base });
  }

  if (order.accepted_at) {
    events.push({ at: order.accepted_at, label: t('activityAccepted') || 'Order accepted' });
  }
  if (order.in_kitchen_at) {
    events.push({ at: order.in_kitchen_at, label: t('activityKitchen') || 'Sent to kitchen' });
  }
  if (order.ready_at) {
    events.push({ at: order.ready_at, label: t('activityReady') || 'Marked ready' });
  }
  if (order.completed_at) {
    const isCancelled = order.status === 'rejected';
    events.push({
      at: order.completed_at,
      label: isCancelled
        ? t('activityCancelled') || 'Order cancelled'
        : t('activityCompleted') || 'Order completed',
    });
  }

  // Chronological, not construction order. The events above are pushed grouped
  // by kind (creation, discounts, recorded changes, lifecycle stamps), which is
  // not the order they happened in: a correction made the next morning was
  // rendering above the acceptance from the day before. Only the timestamp
  // orders a timeline.
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // The row shows the time alone, which reads as one continuous day. Once an
  // order spans several (a scheduled order, or one corrected the next morning),
  // that is actively misleading, so each new day announces itself. A
  // single-day timeline keeps its clean, unlabelled look.
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toDateString();
  };
  const spansDays = new Set(events.map((e) => dayKey(e.at))).size > 1;

  return (
    <div className="flex flex-col gap-[var(--s-3)] text-fs-xs relative">
      {/* A 403 stays silent — a caller without orders.manage still sees the
          trail the order itself carries. Any other failure says so, because a
          silently shortened history reads as "nothing happened". */}
      {auditFailed && (
        <div className="text-[var(--fg-subtle)] italic">{t('activityLoadError')}</div>
      )}
      {events.map((e, i) => (
        <Fragment key={`${e.at}-${i}`}>
        {spansDays && (i === 0 || dayKey(e.at) !== dayKey(events[i - 1].at)) && (
          <div className="flex items-center gap-[var(--s-2)] pt-[var(--s-1)] first:pt-0">
            <span className="font-medium uppercase tracking-[.06em] text-[10px] text-[var(--fg-muted)]">
              {formatEventDay(e.at)}
            </span>
            <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
          </div>
        )}
        <div className="flex items-start gap-[var(--s-3)] relative">
          {/* Connector line. Suppressed before a day separator, which breaks the
              column anyway. */}
          {i < events.length - 1 && dayKey(events[i + 1].at) === dayKey(e.at) && (
            <span
              aria-hidden
              className="absolute start-[18px] top-3 bottom-[-12px] w-px"
              style={{ background: 'var(--line)' }}
            />
          )}
          {/* Timestamp */}
          <span className="font-mono text-[var(--fg-subtle)] text-[11px] shrink-0 w-[34px] tabular-nums pt-px">
            {formatTime(e.at)}
          </span>
          {/* Dot */}
          <span
            className="block w-1.5 h-1.5 rounded-full shrink-0 mt-[6px] relative z-[1]"
            style={{
              background: e.future
                ? 'color-mix(in oklab, var(--brand-500) 50%, var(--fg-muted))'
                : 'var(--brand-500)',
              boxShadow: e.future
                ? 'none'
                : '0 0 0 3px color-mix(in oklab, var(--brand-500) 14%, transparent)',
            }}
          />
          <div className="flex-1 min-w-0">
            <span className={e.future ? 'text-[var(--fg-muted)] italic' : 'text-[var(--fg)]'}>
              {e.label}
            </span>
          </div>
        </div>
        </Fragment>
      ))}
    </div>
  );
}
