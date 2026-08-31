// Fixture orders for the order-detail preview route.
//
// These exist so the order detail can be looked at without logging in, hitting
// the dev API, or hunting for an order that happens to be in the right state.
// Every scenario below is one the real screen has to handle and which is
// otherwise awkward to reproduce on demand: a by-weight order sitting on a card
// hold, an order edited after the customer already paid, a combo, a
// cancellation.
//
// Dev-only — the route that renders these calls notFound() in production.

import type { Order, OrderItem } from '@/lib/api';

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function item(over: Partial<OrderItem> & { name: string; price: number }): OrderItem {
  return {
    id: Math.floor(Math.random() * 1e9),
    menu_item_id: 1,
    quantity: 1,
    ...over,
  } as OrderItem;
}

const BASE: Partial<Order> = {
  restaurant_id: 5,
  payment_status: 'paid',
  customer_name: 'Yael Tajszeydler',
  customer_phone: '053 708 55 13',
  order_source: 'website_order',
  receipt_token: 'preview-token',
  created_at: iso(1559),
};

/** The order in the screenshot the redesign started from. */
const deliveryReady: Order = {
  ...BASE,
  id: 1543,
  order_type: 'delivery',
  status: 'ready_for_delivery',
  external_metadata: { document_number: 908711 },
  total_amount: 525,
  delivery_fee: 20,
  delivery_address: "Ma'on 5",
  delivery_city: 'Tel aviv',
  delivery_floor: '7',
  delivery_apt: '172',
  delivery_notes: 'Bâtiment 1',
  courier_name: 'David Cohen',
  courier_phone: '052 411 90 02',
  courier_assigned_at: iso(40),
  tour: { id: 3, name: 'Tournée Nord', delivery_date: iso(0) },
  accepted_at: iso(1558),
  in_kitchen_at: iso(1557),
  ready_at: iso(90),
  custom_fields: { code_immeuble: '4417B' },
  items: [
    item({ name: "L'OR ROUGE", price: 35, category_name: 'SALADES', selected_variant_name: '250g' }),
    item({ name: 'AUBERGINE', price: 35, category_name: 'SALADES', selected_variant_name: '250g' }),
    item({ name: 'MAÏS GRILLÉ', price: 25, category_name: 'SALADES', selected_variant_name: '250g' }),
    item({ name: 'FENOUIL', price: 25, category_name: 'SALADES', selected_variant_name: '250g' }),
    item({
      name: 'CAROTTES',
      price: 25,
      category_name: 'SALADES',
      selected_variant_name: '250g',
      notes: 'Sans coriandre merci',
      modifiers: [
        { id: 1, order_item_id: 0, menu_item_modifier_id: 1, name: 'Coriandre', action: 'remove', price_delta: 0 },
        { id: 2, order_item_id: 0, menu_item_modifier_id: 2, name: 'Citron confit', action: 'add', price_delta: 4 },
      ],
    }),
    item({ name: 'COCA COLA', price: 9, quantity: 2, category_name: 'BOISSONS' }),
    item({ name: 'PAIN PITA', price: 6, quantity: 3, category_name: 'BOULANGERIE' }),
  ],
} as Order;

/** By-weight lines on a card hold — the "Confirmer les poids" path. */
const byWeightHeld: Order = {
  ...BASE,
  id: 1544,
  order_type: 'pickup',
  status: 'in_kitchen',
  payment_status: 'paid',
  settlement_status: 'held',
  hold_amount: 220,
  total_amount: 187.4,
  accepted_at: iso(28),
  in_kitchen_at: iso(25),
  created_at: iso(30),
  items: [
    item({
      name: 'SAUMON FRAIS',
      price: 124.6,
      category_name: 'POISSONNERIE',
      pricing_mode: 'by_weight',
      price_per_kg: 89,
      estimated_weight_grams: 1400,
      actual_weight_grams: null,
    }),
    item({
      name: 'THON ROUGE',
      price: 62.8,
      category_name: 'POISSONNERIE',
      pricing_mode: 'by_weight',
      price_per_kg: 157,
      estimated_weight_grams: 400,
      actual_weight_grams: 420,
    }),
  ],
} as Order;

/** A combo plus a post-payment edit leaving an uncollected balance. */
const comboWithBalance: Order = {
  ...BASE,
  id: 1545,
  order_type: 'dine_in',
  status: 'served',
  table_number: '12',
  total_amount: 148,
  balance_due: 23,
  external_metadata: { edited_after_payment: true, paid_amount: 125 },
  accepted_at: iso(120),
  in_kitchen_at: iso(118),
  ready_at: iso(95),
  completed_at: iso(80),
  created_at: iso(125),
  items: [
    item({
      name: 'Poulet grillé',
      price: 0,
      combo_group: 'c1',
      combo_name: 'Menu Midi',
      combo_price: 68,
      category_name: 'PLATS',
    }),
    item({ name: 'Salade César', price: 6, combo_group: 'c1', combo_name: 'Menu Midi', combo_price: 68 }),
    item({ name: 'Tiramisu', price: 0, combo_group: 'c1', combo_name: 'Menu Midi', combo_price: 68 }),
    item({ name: 'Entrecôte', price: 57, category_name: 'PLATS', billed_at: null }),
    item({ name: 'Verre de rouge', price: 23, category_name: 'BOISSONS', billed_at: null }),
  ],
} as Order;

/** Cancelled with a reason — today the progression renders entirely empty. */
const cancelled: Order = {
  ...BASE,
  id: 1546,
  order_type: 'delivery',
  status: 'rejected',
  payment_status: 'refunded',
  total_amount: 96,
  completed_at: iso(200),
  created_at: iso(240),
  external_metadata: { cancellation_reason_code: 'out_of_stock', cancellation_reason_note: 'Plus de saumon' },
  delivery_address: 'Dizengoff 120',
  delivery_city: 'Tel aviv',
  items: [item({ name: 'POKE SAUMON', price: 48, quantity: 2, category_name: 'POKE' })],
} as Order;

/** Scheduled for a future collection day. */
const scheduled: Order = {
  ...BASE,
  id: 1547,
  order_type: 'pickup',
  status: 'scheduled',
  payment_status: 'unpaid',
  is_scheduled: true,
  scheduled_for: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  scheduled_pickup_window_start: '14:00',
  scheduled_pickup_window_end: '18:00',
  total_amount: 240,
  created_at: iso(15),
  items: [
    item({ name: 'PLATEAU MEZZE', price: 180, category_name: 'TRAITEUR' }),
    item({ name: 'HOUMOUS 1KG', price: 60, category_name: 'TRAITEUR' }),
  ],
} as Order;

export const PREVIEW_ORDERS = [
  { key: 'delivery', label: 'Livraison · prête', order: deliveryReady },
  { key: 'weight', label: 'Au poids · empreinte', order: byWeightHeld },
  { key: 'combo', label: 'Combo · solde dû', order: comboWithBalance },
  { key: 'cancelled', label: 'Annulée', order: cancelled },
  { key: 'scheduled', label: 'Programmée', order: scheduled },
] as const;

export type PreviewKey = (typeof PREVIEW_ORDERS)[number]['key'];

export const PREVIEW_RESTAURANT = {
  name: 'Mamie Claude',
  address: 'Rothschild 42, Tel Aviv',
  phone: '03 555 12 34',
};

export const PREVIEW_CUSTOM_FIELD_LABELS: Record<string, string> = {
  code_immeuble: 'Code immeuble',
};
