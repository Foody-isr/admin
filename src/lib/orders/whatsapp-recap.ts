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
import { findTemplate } from '@/lib/messages/registry';
import { renderTemplate, type RenderContext } from '@/lib/messages/render';

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

// pickupOn/deliveryOn/deliveryAddress carry no emoji of their own: the
// order_recap template (registry.ts) prefixes their line with a static
// "🗓️ "/"📍 " already, unlike typePickup/typeDelivery/typeDineIn, whose line
// has no static prefix and so must keep owning theirs. Splitting it this way
// means every line's emoji lives in exactly one place, never doubled, never
// dropped — see whatsapp-recap.test.ts's "risk 2" cases.
const STRINGS: Record<RecapLocale, RecapStrings> = {
  fr: {
    orderRef: (id) => `Commande #${id}`,
    greeting: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    confirmed: 'votre commande est confirmée ✅',
    typePickup: '📦 À emporter',
    typeDelivery: '🛵 Livraison',
    typeDineIn: '🍽️ Sur place',
    pickupOn: 'Retrait',
    deliveryOn: 'Livraison',
    asap: 'dès que possible',
    deliveryAddress: 'Adresse de livraison',
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
    pickupOn: 'איסוף',
    deliveryOn: 'משלוח',
    asap: 'בהקדם האפשרי',
    deliveryAddress: 'כתובת למשלוח',
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
    pickupOn: 'Pickup',
    deliveryOn: 'Delivery',
    asap: 'as soon as possible',
    deliveryAddress: 'Delivery address',
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
 * Build the values a template needs to render the recap: simple tokens
 * (restaurant name, order number...) and Foody-composed blocks (the item
 * list, the totals breakdown, the address...). Separated from rendering so it
 * is testable on its own, with no template and no server involved.
 *
 * Every token and block `order_recap` declares (see registry.ts) is always
 * present here, even when its value is `''` — an omitted key and an empty
 * value mean different things to renderTemplate() (see render.ts's
 * RenderContext contract), and only the latter is safe: a customer must never
 * see a raw `{{token}}` because a key was forgotten.
 */
export function buildRecapContext({
  order,
  restaurantName,
  locale,
  receiptUrl,
}: BuildRecapOptions): RenderContext {
  const s = STRINGS[locale];
  const g = groupOrder(order, { uncategorized: s.uncategorized, comboFallback: s.comboFallback });
  const isDelivery = order.order_type === 'delivery';

  // ── Bloc articles ───────────────────────────────────────────────────────────
  const itemLines: string[] = [];
  for (const item of g.regularItems) {
    const variant = (item.selected_variant_name || '').trim();
    const name = variant ? `${item.name} (${variant})` : item.name;
    itemLines.push(`• ${item.quantity}× ${name} · ${money(item.price * item.quantity)}`);

    const mods = modifierLine(item.modifiers);
    if (mods) itemLines.push(`   ↳ ${mods}`);
    if ((item.notes || '').trim()) itemLines.push(`   ↳ “${item.notes!.trim()}”`);
  }

  for (const combo of g.comboGroups) {
    itemLines.push(`• ${combo.name} · ${money(combo.price)}`);
    for (const step of combo.items) {
      const variant = (step.selected_variant_name || '').trim();
      const name = variant ? `${step.name} (${variant})` : step.name;
      const qty = step.quantity > 1 ? `${step.quantity}× ` : '';
      itemLines.push(`   ↳ ${qty}${name}`);

      const mods = modifierLine(step.modifiers);
      if (mods) itemLines.push(`      ${mods}`);
    }
  }

  // ── Bloc totaux ──────────────────────────────────────────────────────────────
  // Only break the total down when there is something to break out — a plain
  // order shows one Total line, not a subtotal that repeats it.
  const totalLines: string[] = [];
  if (g.deliveryFee > 0 || g.discountAmount > 0) {
    totalLines.push(`${s.subtotal} : ${money(g.subtotal)}`);
    if (g.discountAmount > 0) totalLines.push(`${s.discount} : −${money(g.discountAmount)}`);
    if (g.deliveryFee > 0) totalLines.push(`${s.deliveryFee} : ${money(g.deliveryFee)}`);
  }
  totalLines.push(`*${s.total} : ${money(g.total)}*`);

  // ── Bloc adresse : vide hors livraison, pour que sa ligne disparaisse ────────
  let address = '';
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
      address = `${s.deliveryAddress} : ${unit ? `${street} (${unit})` : street}`;
    }
  }

  // ── Bloc statut de paiement ───────────────────────────────────────────────────
  let payment = '';
  const balanceDue = order.balance_due ?? 0;
  if (order.payment_status === 'paid' && balanceDue <= 0) {
    payment = s.paid;
  } else if (balanceDue > 0) {
    // Paid, then items were added: only the supplement is still owed.
    payment = `⚠️ ${s.balanceDue} : ${money(balanceDue)}`;
  } else if (order.payment_status !== 'refunded') {
    payment = isDelivery ? s.toPayDelivery : order.order_type === 'dine_in' ? s.toPayDineIn : s.toPayPickup;
  }

  return {
    tokens: {
      restaurant: restaurantName.trim(),
      client: (order.customer_name || '').trim(),
      numero_commande: String(order.id),
      // The label (Retrait/Livraison) depends on the order, not the locale, so
      // it cannot be static template text the way "Votre commande" is — it has
      // to travel with the value. The emoji stays owned by the template body
      // (its static "🗓️ " prefix), same split as the address block below.
      creneau:
        order.order_type === 'dine_in'
          ? ''
          : `${isDelivery ? s.deliveryOn : s.pickupOn} : ${formatSlot(order, locale)}`,
    },
    blocks: {
      type_commande: isDelivery ? s.typeDelivery : order.order_type === 'dine_in' ? s.typeDineIn : s.typePickup,
      articles: itemLines.join('\n'),
      totaux: totalLines.join('\n'),
      adresse: address,
      statut_paiement: payment,
      // Always non-empty (STRINGS.greeting renders "Bonjour," even without a
      // name) so the confirmation line it shares never gets dropped by an
      // empty customer name.
      salutation: s.greeting((order.customer_name || '').trim()),
      // Carries its own leading blank line so both vanish together when there
      // is no receipt URL — a static blank line in the template body couldn't
      // disappear on its own (a line with no token is never dropped).
      lien_suivi: receiptUrl ? `\n${s.trackOrder} : ${receiptUrl}` : '',
    },
  };
}

/**
 * Compose the full WhatsApp recap: heading, greeting, fulfillment type and slot,
 * delivery address, every line item with its variant / modifiers / notes, the
 * totals breakdown, the payment status and the tracking link.
 *
 * WhatsApp renders *asterisks* as bold; the rest is plain text with newlines,
 * which is exactly why this send goes out as a wa.me deep link rather than a
 * Meta template (template variables cannot contain newlines).
 *
 * `body` is the restaurant's own customization of the order_recap template,
 * loaded by the caller. Without it, the registry's shipped default applies,
 * and the message is exactly what it was before restaurants could edit it.
 * An empty or whitespace-only `body` falls back to the default the same way:
 * the server only caps its length, so a restaurant that clears the editor and
 * saves must not silently start sending blank WhatsApp messages.
 */
export function buildOrderRecap(opts: BuildRecapOptions & { body?: string }): string {
  const def = findTemplate('order_recap');
  const customBody = opts.body && opts.body.trim() ? opts.body : undefined;
  const body = customBody ?? def?.defaults[opts.locale] ?? '';
  return renderTemplate(body, buildRecapContext(opts));
}
