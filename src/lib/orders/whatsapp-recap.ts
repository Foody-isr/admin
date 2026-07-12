// Builds the WhatsApp order-confirmation recap that staff send to a customer
// from the order drawer ("Envoyer au client → Confirmation de commande").
//
// This message is addressed to the CUSTOMER, not the staff member — so it is
// written in the customer's language (the locale they ordered in), which is
// often not the admin's UI language. That is why this module carries its own
// small customer-facing dictionary instead of using the admin's `t()`: `t()`
// always renders in the staff member's locale.
//
// Line items, combos and totals come from the shared groupOrder() so the recap,
// the drawer and the printed ticket can never disagree about what was ordered.

import type { Order } from '@/lib/api';
import { groupOrder } from '@/lib/orders/group-order';

/** Languages a customer can order in. Anything else falls back to FALLBACK_LOCALE. */
export const RECAP_LOCALES = ['fr', 'he', 'en'] as const;
export type RecapLocale = (typeof RECAP_LOCALES)[number];

const FALLBACK_LOCALE: RecapLocale = 'he';

/**
 * Pick the language to write the recap in: the language the customer ordered in,
 * else the restaurant's default, else Hebrew. Orders placed before customer_locale
 * existed (and every staff-created order) carry none, hence the fallbacks.
 */
export function resolveRecapLocale(
  orderLocale?: string | null,
  restaurantLocale?: string | null,
): RecapLocale {
  for (const candidate of [orderLocale, restaurantLocale]) {
    const code = (candidate || '').trim().toLowerCase().split(/[-_]/)[0];
    if ((RECAP_LOCALES as readonly string[]).includes(code)) return code as RecapLocale;
  }
  return FALLBACK_LOCALE;
}

interface RecapStrings {
  orderRef: (id: number) => string;
  greeting: (name: string) => string;
  confirmed: string;
  typePickup: string;
  typeDelivery: string;
  typeDineIn: string;
  pickupOn: string;
  deliveryOn: string;
  asap: string;
  deliveryAddress: string;
  floor: string;
  apartment: string;
  buildingCode: string;
  itemsHeading: string;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  paid: string;
  /** "to pay on pickup / on delivery / at the counter", by order type. */
  toPayPickup: string;
  toPayDelivery: string;
  toPayDineIn: string;
  balanceDue: string;
  trackOrder: string;
  comboFallback: string;
  uncategorized: string;
}

const STRINGS: Record<RecapLocale, RecapStrings> = {
  fr: {
    orderRef: (id) => `Commande #${id}`,
    greeting: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    confirmed: 'votre commande est confirmée ✅',
    typePickup: '📦 À emporter',
    typeDelivery: '🛵 Livraison',
    typeDineIn: '🍽️ Sur place',
    pickupOn: '🗓️ Retrait',
    deliveryOn: '🗓️ Livraison',
    asap: 'dès que possible',
    deliveryAddress: '📍 Adresse de livraison',
    floor: 'Étage',
    apartment: 'Appartement',
    buildingCode: 'Code immeuble',
    itemsHeading: 'Votre commande',
    subtotal: 'Sous-total',
    deliveryFee: 'Frais de livraison',
    discount: 'Remise',
    total: 'Total',
    paid: '✅ Payé',
    toPayPickup: '⚠️ Non payé, à régler au retrait',
    toPayDelivery: '⚠️ Non payé, à régler à la livraison',
    toPayDineIn: '⚠️ Non payé, à régler sur place',
    balanceDue: 'Reste à payer',
    trackOrder: 'Suivre votre commande',
    comboFallback: 'Combo',
    uncategorized: 'Autres',
  },
  he: {
    orderRef: (id) => `הזמנה #${id}`,
    greeting: (name) => (name ? `שלום ${name},` : 'שלום,'),
    confirmed: 'ההזמנה שלך אושרה ✅',
    typePickup: '📦 איסוף עצמי',
    typeDelivery: '🛵 משלוח',
    typeDineIn: '🍽️ בישיבה',
    pickupOn: '🗓️ איסוף',
    deliveryOn: '🗓️ משלוח',
    asap: 'בהקדם האפשרי',
    deliveryAddress: '📍 כתובת למשלוח',
    floor: 'קומה',
    apartment: 'דירה',
    buildingCode: 'קוד כניסה',
    itemsHeading: 'ההזמנה שלך',
    subtotal: 'סכום ביניים',
    deliveryFee: 'דמי משלוח',
    discount: 'הנחה',
    total: 'סה״כ',
    paid: '✅ שולם',
    toPayPickup: '⚠️ טרם שולם, תשלום באיסוף',
    toPayDelivery: '⚠️ טרם שולם, תשלום במשלוח',
    toPayDineIn: '⚠️ טרם שולם, תשלום במקום',
    balanceDue: 'נותר לתשלום',
    trackOrder: 'מעקב אחר ההזמנה',
    comboFallback: 'קומבו',
    uncategorized: 'אחר',
  },
  en: {
    orderRef: (id) => `Order #${id}`,
    greeting: (name) => (name ? `Hello ${name},` : 'Hello,'),
    confirmed: 'your order is confirmed ✅',
    typePickup: '📦 Pickup',
    typeDelivery: '🛵 Delivery',
    typeDineIn: '🍽️ Dine-in',
    pickupOn: '🗓️ Pickup',
    deliveryOn: '🗓️ Delivery',
    asap: 'as soon as possible',
    deliveryAddress: '📍 Delivery address',
    floor: 'Floor',
    apartment: 'Apt',
    buildingCode: 'Building code',
    itemsHeading: 'Your order',
    subtotal: 'Subtotal',
    deliveryFee: 'Delivery fee',
    discount: 'Discount',
    total: 'Total',
    paid: '✅ Paid',
    toPayPickup: '⚠️ Unpaid, to be paid at pickup',
    toPayDelivery: '⚠️ Unpaid, to be paid on delivery',
    toPayDineIn: '⚠️ Unpaid, to be paid at the counter',
    balanceDue: 'Balance due',
    trackOrder: 'Track your order',
    comboFallback: 'Combo',
    uncategorized: 'Other',
  },
};

/** Intl locale tags — region-qualified so dates read naturally per language. */
const INTL_LOCALE: Record<RecapLocale, string> = {
  fr: 'fr-FR',
  he: 'he-IL',
  en: 'en-GB',
};

function money(n: number): string {
  return `₪${(n ?? 0).toFixed(2)}`;
}

/** "jeudi 16 juillet" — day + month, no year (the recap is always near-term). */
function formatDate(iso: string, locale: RecapLocale): string {
  try {
    return new Date(iso).toLocaleDateString(INTL_LOCALE[locale], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string, locale: RecapLocale): string {
  try {
    return new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * "jeudi 16 juillet, 10:00–14:00" — the fulfillment window when the order has
 * one, else the scheduled time itself. Mirrors how the drawer's scheduled banner
 * reads, so staff and customer see the same slot.
 */
function formatSlot(order: Order, locale: RecapLocale): string {
  const iso = order.scheduled_for;
  if (!iso) return STRINGS[locale].asap;

  const date = formatDate(iso, locale);
  const start = (order.scheduled_pickup_window_start || '').trim();
  const end = (order.scheduled_pickup_window_end || '').trim();

  if (start && end) return `${date}, ${start}–${end}`;
  if (start) return `${date}, ${start}`;
  const time = formatTime(iso, locale);
  return time ? `${date}, ${time}` : date;
}

/**
 * Item modifiers as one indented line: "Sans oignons · Supplément sauce (+₪2.00)".
 * The modifier's own name already carries its verb ("Sans oignons", "Extra fromage"),
 * so it is printed as-is — exactly as the drawer chips render it. Only a paid extra
 * shows a price, because that is the part a customer can be surprised by.
 */
function modifierLine(
  modifiers: { name: string; price_delta?: number }[] | undefined,
): string {
  if (!modifiers || modifiers.length === 0) return '';
  return modifiers
    .map((m) => {
      const extra = m.price_delta && m.price_delta > 0 ? ` (+${money(m.price_delta)})` : '';
      return `${m.name}${extra}`;
    })
    .join(' · ');
}

export interface BuildRecapOptions {
  order: Order;
  restaurantName: string;
  locale: RecapLocale;
  /** Public receipt/tracking URL. Omitted from the message when empty. */
  receiptUrl?: string;
}

/**
 * Compose the full WhatsApp recap: heading, greeting, fulfillment type and slot,
 * delivery address, every line item with its variant / modifiers / notes, the
 * totals breakdown, the payment status and the tracking link.
 *
 * WhatsApp renders *asterisks* as bold; the rest is plain text with newlines,
 * which is exactly why this send goes out as a wa.me deep link rather than a
 * Meta template (template variables cannot contain newlines).
 */
export function buildOrderRecap({
  order,
  restaurantName,
  locale,
  receiptUrl,
}: BuildRecapOptions): string {
  const s = STRINGS[locale];
  const g = groupOrder(order, { uncategorized: s.uncategorized, comboFallback: s.comboFallback });

  const lines: string[] = [];

  // ─── Heading + greeting ─────────────────────────────────────────────────────
  if (restaurantName.trim()) lines.push(`*${restaurantName.trim()}*`);
  lines.push(s.orderRef(order.id));
  lines.push('');
  lines.push(`${s.greeting((order.customer_name || '').trim())} ${s.confirmed}`);
  lines.push('');

  // ─── Fulfillment: type, slot, address ───────────────────────────────────────
  const isDelivery = order.order_type === 'delivery';
  const typeLabel =
    order.order_type === 'delivery' ? s.typeDelivery : order.order_type === 'dine_in' ? s.typeDineIn : s.typePickup;
  lines.push(typeLabel);
  if (order.order_type !== 'dine_in') {
    lines.push(`${isDelivery ? s.deliveryOn : s.pickupOn} : ${formatSlot(order, locale)}`);
  }

  if (isDelivery) {
    const street = [order.delivery_address, order.delivery_city].map((v) => (v || '').trim()).filter(Boolean).join(', ');
    const unit = [
      (order.delivery_floor || '').trim() ? `${s.floor} ${order.delivery_floor!.trim()}` : '',
      (order.delivery_apt || '').trim() ? `${s.apartment} ${order.delivery_apt!.trim()}` : '',
      (order.delivery_entry_code || '').trim() ? `${s.buildingCode} ${order.delivery_entry_code!.trim()}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    if (street || unit) {
      const address = unit ? `${street} (${unit})` : street;
      lines.push(`${s.deliveryAddress} : ${address}`);
    }
  }

  // ─── Items ──────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`*${s.itemsHeading}*`);

  for (const item of g.regularItems) {
    const variant = (item.selected_variant_name || '').trim();
    const name = variant ? `${item.name} (${variant})` : item.name;
    lines.push(`• ${item.quantity}× ${name} · ${money(item.price * item.quantity)}`);

    const mods = modifierLine(item.modifiers);
    if (mods) lines.push(`   ↳ ${mods}`);
    if ((item.notes || '').trim()) lines.push(`   ↳ “${item.notes!.trim()}”`);
  }

  for (const combo of g.comboGroups) {
    lines.push(`• ${combo.name} · ${money(combo.price)}`);
    for (const step of combo.items) {
      const variant = (step.selected_variant_name || '').trim();
      const name = variant ? `${step.name} (${variant})` : step.name;
      const qty = step.quantity > 1 ? `${step.quantity}× ` : '';
      lines.push(`   ↳ ${qty}${name}`);

      const mods = modifierLine(step.modifiers);
      if (mods) lines.push(`      ${mods}`);
    }
  }

  // ─── Totals ─────────────────────────────────────────────────────────────────
  lines.push('');
  // Only break the total down when there is something to break out — a plain
  // order shows one Total line, not a subtotal that repeats it.
  if (g.deliveryFee > 0 || g.discountAmount > 0) {
    lines.push(`${s.subtotal} : ${money(g.subtotal)}`);
    if (g.discountAmount > 0) lines.push(`${s.discount} : −${money(g.discountAmount)}`);
    if (g.deliveryFee > 0) lines.push(`${s.deliveryFee} : ${money(g.deliveryFee)}`);
  }
  lines.push(`*${s.total} : ${money(g.total)}*`);

  // ─── Payment ────────────────────────────────────────────────────────────────
  const balanceDue = order.balance_due ?? 0;
  if (order.payment_status === 'paid' && balanceDue <= 0) {
    lines.push(s.paid);
  } else if (balanceDue > 0) {
    // Paid, then items were added: only the supplement is still owed.
    lines.push(`⚠️ ${s.balanceDue} : ${money(balanceDue)}`);
  } else if (order.payment_status !== 'refunded') {
    lines.push(
      isDelivery ? s.toPayDelivery : order.order_type === 'dine_in' ? s.toPayDineIn : s.toPayPickup,
    );
  }

  // ─── Tracking link ──────────────────────────────────────────────────────────
  if (receiptUrl) {
    lines.push('');
    lines.push(`${s.trackOrder} : ${receiptUrl}`);
  }

  return lines.join('\n');
}
