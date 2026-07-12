import type { Discount } from './api';

export type DiscountStatus = 'active' | 'scheduled' | 'expired' | 'inactive' | 'exhausted';

export function discountStatus(d: Discount, now: Date = new Date()): DiscountStatus {
  if (!d.is_active) return 'inactive';
  if (d.total_cap != null && d.redemption_count >= d.total_cap) return 'exhausted';
  if (d.starts_at && new Date(d.starts_at) > now) return 'scheduled';
  if (d.ends_at && new Date(d.ends_at) < now) return 'expired';
  return 'active';
}

export function formatDiscountValue(d: Pick<Discount, 'type' | 'value'>): string {
  if (d.type === 'free_delivery') return 'freeDelivery'; // caller resolves via t()
  if (d.type === 'percent') return `${d.value}%`;
  return `₪${d.value.toFixed(2)}`;
}

// Maps a server validation reason to an i18n key for a localized message.
export function reasonKey(reason: string): string {
  switch (reason) {
    case 'expired': return 'codeExpired';
    case 'not_started': return 'codeNotStarted';
    case 'min_purchase': return 'minPurchaseNotMet';
    case 'total_cap': return 'capReached';
    case 'per_customer_cap': return 'perCustomerReached';
    case 'no_discount': return 'noDiscountValue';
    default: return 'invalidCode'; // not_found / inactive / anything else
  }
}
