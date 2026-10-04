import type { Discount } from './api';
import { formatMoney } from '@/lib/currency';

export type DiscountStatus = 'active' | 'scheduled' | 'expired' | 'inactive' | 'exhausted';

/** Resolve the restaurant calendar, matching the platform timezone fallback. */
export function discountDay(now: Date, timeZone = 'Asia/Jerusalem'): string {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone.trim() || 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }); }
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Describe availability while preserving the inclusive restaurant-local end day. */
export function discountStatus(d: Discount, now: Date = new Date(), timeZone = 'Asia/Jerusalem'): DiscountStatus {
  if (!d.is_active) return 'inactive';
  if (d.total_cap != null && d.redemption_count >= d.total_cap) return 'exhausted';
  const today = discountDay(now, timeZone), dayOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (d.starts_at && (dayOnly.test(d.starts_at) ? d.starts_at > today : new Date(d.starts_at) > now)) return 'scheduled';
  if (d.ends_at && (dayOnly.test(d.ends_at) ? d.ends_at < today : new Date(d.ends_at) < now)) return 'expired';
  return 'active';
}

export function formatDiscountValue(
  d: Pick<Discount, 'type' | 'value'>,
  currency?: string,
): string {
  if (d.type === 'free_delivery') return 'freeDelivery'; // caller resolves via t()
  if (d.type === 'percent') return `${d.value}%`;
  return formatMoney(d.value, currency);
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
