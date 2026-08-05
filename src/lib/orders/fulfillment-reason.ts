// Staff-selectable reasons for moving an order to a different collection day.
// Kept in sync with the server-side codes in foodyserver
// internal/common/models.go (FulfillmentChangeReasonCode /
// FulfillmentChangeReasons). The server rejects a série change carrying none of
// these, so this list is a contract, not a UI convenience.
export const FULFILLMENT_CHANGE_REASONS = [
  'customer_request',
  'out_of_stock',
  'production_capacity',
  'data_entry_error',
  'other',
] as const;

export type FulfillmentChangeReasonCode = (typeof FULFILLMENT_CHANGE_REASONS)[number];

// i18n key per reason code (see src/lib/i18n.tsx).
export const FULFILLMENT_REASON_KEY: Record<FulfillmentChangeReasonCode, string> = {
  customer_request: 'serieReasonCustomerRequest',
  out_of_stock: 'serieReasonOutOfStock',
  production_capacity: 'serieReasonProductionCapacity',
  data_entry_error: 'serieReasonDataEntryError',
  other: 'serieReasonOther',
};

/** Whole days between two "YYYY-MM-DD" dates. Negative when `to` is earlier.
 *  Parsed as UTC midnight on both sides so DST never shifts the count. */
export function dayGap(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}
