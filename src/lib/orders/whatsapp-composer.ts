import type { Order, OrderWhatsAppPreview } from '@/lib/api';
import type { RecapLocale } from './whatsapp-recap';

export type WhatsAppChannel = 'business' | 'app';
export type WhatsAppMessageKind = OrderWhatsAppPreview['kind'] | 'receipt';

export interface WhatsAppRecipient {
  order: Order;
  state: 'loading' | 'ready' | 'unavailable' | 'sending' | 'stale';
  preview?: OrderWhatsAppPreview;
  opened?: boolean;
}

/** Only an exact, unclaimed server preview can authorize an API send. */
export function canSendWhatsApp(row: WhatsAppRecipient): boolean {
  return row.state === 'ready' && row.preview?.status === 'ready' && !row.preview.send_blocked_reason;
}

/** Deduplicate orders while rejecting records outside the active restaurant. */
export function scopeWhatsAppOrders(orders: Order[], restaurantId: number): Order[] {
  const seen = new Set<number>();
  return orders.filter(order => order.restaurant_id === restaurantId && !seen.has(order.id) && Boolean(seen.add(order.id)));
}

/** Mirror the API's supported phone normalization for editable app handoffs. */
export function whatsappPhone(value: string | undefined): string {
  let phone = (value ?? '').trim().replace(/^whatsapp:/, '').replace(/[\s()\-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^05\d{8}$/.test(phone)) phone = `+972${phone.slice(1)}`;
  if (phone.startsWith('972')) phone = `+${phone}`;
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : '';
}

/** Localized receipt introduction for an editable app message. */
export function receiptWhatsAppMessage(order: Order, locale: RecapLocale, url: string): string {
  const name = order.customer_name?.trim();
  const greeting = { fr: 'Bonjour', he: 'שלום', en: 'Hello' }[locale] + (name ? ` ${name}` : '');
  const introduction = {
    fr: `voici le reçu de votre commande n°${order.id}.`,
    he: `הנה הקבלה עבור הזמנה מס׳ ${order.id}.`,
    en: `here is the receipt for your order #${order.id}.`,
  }[locale];
  return `${greeting}, ${introduction}\n${url}`;
}
