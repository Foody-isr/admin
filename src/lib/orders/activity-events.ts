// The order's activity trail, assembled from three sources: the order's own
// lifecycle timestamps, the discount audit carried in external_metadata, and
// the recorded staff changes fetched from the audit endpoint.
//
// This lived inside ActivityTimeline until the appendix became collapsible. The
// collapsed heading carries a COUNT, and the count is not derivable from
// outside: `auditEvents` is filtered down to exactly two actions, so
// `audit.events.length` is NOT the number of rows the timeline will draw. The
// only honest way to label the closed block is to build the list first and
// count it, which means the building has to be callable without rendering.
//
// No 'use client': the count contract is the thing most likely to be quietly
// broken by a later refactor, so it needs a test, and the .tsx suite has a
// history of not running.

import type { AuditEvent, Order } from '@/lib/api';
import { formatMoney } from '@/lib/format-money';
import { formatScheduledFor } from '@/lib/orders/order-time';
import { localizeSource } from '@/lib/orders/status-presentation';
import { localizePaymentMethod } from '@/lib/orders/payment';
import {
  FULFILLMENT_REASON_KEY,
  type FulfillmentChangeReasonCode,
} from '@/lib/orders/fulfillment-reason';

/** One row of the trail. */
export type ActivityEvent = {
  at: string;
  label: string;
  /** Hasn't happened yet (a scheduled slot). Rendered muted and italic. */
  future?: boolean;
};

// One recorded manual-discount change, mirrored from the server's
// common.DiscountAuditEntry (external_metadata.discount_audit).
type DiscountAuditEntry = {
  action: string; // applied | removed
  type?: string; // fixed | percent
  value?: number;
  reason?: string;
  at: string;
};

// Manual status/payment corrections written to external_metadata by the
// server. Both server-side entry types share this shape.
type OverrideEntry = {
  from: string;
  to: string;
  note?: string;
  user_id?: number;
  role?: string;
  at: string;
};

const PAYMENT_STATUS_KEY: Record<string, string> = {
  paid: 'paid',
  pending: 'pending',
  unpaid: 'unpaid',
  refunded: 'refunded',
};

function localizeStatus(status: string, t: (k: string) => string): string {
  const value = t(status);
  return value === status ? status.replace(/_/g, ' ') : value;
}

function localizePaymentStatus(status: string, t: (k: string) => string): string {
  const key = PAYMENT_STATUS_KEY[status];
  if (!key) return status.replace(/_/g, ' ');
  const value = t(key);
  return value === key ? status.replace(/_/g, ' ') : value;
}

function overrideActor(entry: OverrideEntry, t: (k: string) => string): string {
  if (entry.role) {
    const key = `roleName_${entry.role}`;
    const label = t(key);
    return label === key ? entry.role : label;
  }
  return t('activityAuditUnknownActor') || 'staff';
}

function readOverrides(order: Order, key: string): OverrideEntry[] {
  const raw = (order.external_metadata ?? {})[key];
  return Array.isArray(raw) ? (raw as OverrideEntry[]) : [];
}

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

/**
 * The trail for one order, chronologically.
 *
 * Safe to call while the audit fetch is still in flight: pass `undefined` and
 * the result is the lifecycle-only trail, which can only GROW when the events
 * land. It is never empty — `created_at` always yields a row — so a count taken
 * from it never claims "nothing happened".
 */
export function buildActivityEvents(
  order: Order,
  auditEvents: AuditEvent[] | undefined,
  t: (k: string) => string,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

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

  for (const entry of readOverrides(order, 'status_overrides')) {
    const base = (t('activityStatusCorrected') || 'Status corrected from {from} to {to} by {who}')
      .replace('{from}', localizeStatus(entry.from, t))
      .replace('{to}', localizeStatus(entry.to, t))
      .replace('{who}', overrideActor(entry, t));
    events.push({ at: entry.at, label: entry.note ? `${base} (${entry.note})` : base });
  }

  for (const entry of readOverrides(order, 'payment_status_overrides')) {
    const base = (t('activityPaymentCorrected') || 'Payment corrected from {from} to {to} by {who}')
      .replace('{from}', localizePaymentStatus(entry.from, t))
      .replace('{to}', localizePaymentStatus(entry.to, t))
      .replace('{who}', overrideActor(entry, t));
    events.push({ at: entry.at, label: entry.note ? `${base} (${entry.note})` : base });
  }

  // Recorded staff changes. The label names the person, the move and the reason:
  // an entry that only said "rescheduled" would leave the same question the
  // trail exists to answer.
  //
  // NOTE — exactly two actions are recognised here. Every other action the
  // endpoint returns is dropped, which is why the caller must count THIS array
  // rather than the one it fetched.
  for (const a of auditEvents ?? []) {
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

  return events;
}
