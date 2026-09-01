import type { Order } from '@/lib/api';
import type { RecapLocale } from '@/lib/orders/whatsapp-recap';
import { findTemplate } from '@/lib/messages/registry';
import { renderTemplate, type RenderContext } from '@/lib/messages/render';

const INTL_LOCALE: Record<RecapLocale, string> = {
  fr: 'fr-FR',
  he: 'he-IL',
  en: 'en-GB',
};

const LABELS: Record<RecapLocale, { address: string; instructions: string; floor: string; apartment: string; code: string }> = {
  fr: { address: 'Adresse de livraison', instructions: 'Consignes', floor: 'Étage', apartment: 'Appartement', code: 'Code' },
  he: { address: 'כתובת למשלוח', instructions: 'הנחיות', floor: 'קומה', apartment: 'דירה', code: 'קוד' },
  en: { address: 'Delivery address', instructions: 'Instructions', floor: 'Floor', apartment: 'Apartment', code: 'Code' },
};

function deliveryDate(order: Order): string {
  return order.scheduled_for || order.tour?.delivery_date || '';
}

function formatSlot(order: Order, locale: RecapLocale): string {
  const iso = deliveryDate(order);
  if (!iso) return '';
  const date = new Date(iso).toLocaleDateString(INTL_LOCALE[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const start = (order.scheduled_pickup_window_start || '').trim();
  const end = (order.scheduled_pickup_window_end || '').trim();
  if (start && end) return `${date}, ${start}–${end}`;
  if (start) return `${date}, ${start}`;
  return date;
}

/** True on the local calendar day immediately before the delivery. */
export function isDeliveryReminderDue(order: Order, now = new Date()): boolean {
  if (order.order_type !== 'delivery') return false;
  const raw = deliveryDate(order);
  if (!raw) return false;
  const target = new Date(raw);
  if (Number.isNaN(target.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delivery = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((delivery.getTime() - today.getTime()) / 86_400_000) === 1;
}

export function buildDeliveryReminderContext(
  order: Order,
  restaurantName: string,
  locale: RecapLocale,
): RenderContext {
  const labels = LABELS[locale];
  const street = [order.delivery_address, order.delivery_city]
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .join(', ');
  const unit = [
    order.delivery_floor ? `${labels.floor} ${order.delivery_floor}` : '',
    order.delivery_apt ? `${labels.apartment} ${order.delivery_apt}` : '',
    order.delivery_entry_code ? `${labels.code} ${order.delivery_entry_code}` : '',
  ].filter(Boolean).join(', ');
  const address = street ? `${labels.address} : ${street}${unit ? ` (${unit})` : ''}` : '';
  const notes = (order.delivery_notes || '').trim();

  return {
    tokens: {
      restaurant: restaurantName.trim(),
      client: (order.customer_name || '').trim(),
      creneau: formatSlot(order, locale),
      telephone: (order.customer_phone || '').trim(),
    },
    blocks: {
      adresse: address,
      consignes: notes ? `${labels.instructions} : ${notes}` : '',
    },
  };
}

export function buildDeliveryReminder(options: {
  order: Order;
  restaurantName: string;
  locale: RecapLocale;
  body?: string;
}): string {
  const definition = findTemplate('delivery_reminder');
  const body = options.body ?? definition?.defaults[options.locale] ?? '';
  return renderTemplate(body, buildDeliveryReminderContext(options.order, options.restaurantName, options.locale));
}
