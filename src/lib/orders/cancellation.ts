import type { Order } from '@/lib/api';

// Staff-selectable cancellation reasons. Kept in sync with the server-side codes
// in foodyserver internal/common/models.go (CancellationReasonCode /
// ManualCancellationReasons). "payment_abandoned" is system-only and therefore
// not offered here.
export const MANUAL_CANCELLATION_REASONS = [
  'out_of_stock',
  'customer_unreachable',
  'data_entry_error',
  'customer_changed_mind',
  'delivery_issue',
  'other',
] as const;

export type CancellationReasonCode =
  | (typeof MANUAL_CANCELLATION_REASONS)[number]
  | 'payment_abandoned';

// i18n key per reason code (see src/lib/i18n.tsx).
export const CANCELLATION_REASON_KEY: Record<CancellationReasonCode, string> = {
  out_of_stock: 'cancelReasonOutOfStock',
  customer_unreachable: 'cancelReasonCustomerUnreachable',
  data_entry_error: 'cancelReasonDataEntryError',
  customer_changed_mind: 'cancelReasonCustomerChangedMind',
  delivery_issue: 'cancelReasonDeliveryIssue',
  other: 'cancelReasonOther',
  payment_abandoned: 'cancelReasonPaymentAbandoned',
};

// cancellationInfo reads the structured cancellation reason off an order's
// metadata, if present. Returns nulls when the order carries no reason.
export function cancellationInfo(order: Pick<Order, 'external_metadata'>): {
  code: CancellationReasonCode | null;
  note: string;
} {
  const meta = (order.external_metadata ?? {}) as Record<string, unknown>;
  const code = meta.cancellation_reason_code;
  const note = meta.cancellation_reason_note;
  return {
    code: typeof code === 'string' ? (code as CancellationReasonCode) : null,
    note: typeof note === 'string' ? note : '',
  };
}
