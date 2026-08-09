import assert from "node:assert/strict";
import { test } from "node:test";
import { findTemplate, missingFromContext } from "@/lib/messages/registry";
import { renderTemplate } from "@/lib/messages/render";
import { groupOrder } from "@/lib/orders/group-order";
import {
  buildOrderRecap,
  buildRecapContext,
  RECAP_LOCALES,
  type BuildRecapOptions,
  type RecapLocale,
} from "@/lib/orders/whatsapp-recap";
import type { Order, OrderItem } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// FROZEN REFERENCE — a verbatim snapshot of whatsapp-recap.ts's buildOrderRecap
// and every private helper it relied on, exactly as they stood before Task 7's
// refactor (see `git show <pre-refactor-sha>:src/lib/orders/whatsapp-recap.ts`).
//
// This is intentionally a COPY, not an import: the whole point of Task 7 is to
// change the production STRINGS dictionary (stripping the emoji that
// `pickupOn`/`deliveryOn`/`deliveryAddress` used to embed, now that the
// template body itself supplies "🗓️ "/"📍 "), so a live import would drift the
// moment the refactor lands and this suite would stop proving anything. Do
// NOT "clean up" this duplication by importing from the live module — that
// would defeat the purpose of a frozen baseline. Do NOT edit this block; if a
// genuine spec change is ever needed here, that means the promise this task
// was built to protect ("a restaurant that never opens the editor keeps
// receiving byte-for-byte the message it receives today") no longer applies,
// which should be its own decision, not a side effect of an edit here.
// ═══════════════════════════════════════════════════════════════════════════

interface LegacyRecapStrings {
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
  toPayPickup: string;
  toPayDelivery: string;
  toPayDineIn: string;
  balanceDue: string;
  trackOrder: string;
  comboFallback: string;
  uncategorized: string;
}

const LEGACY_STRINGS: Record<RecapLocale, LegacyRecapStrings> = {
  fr: {
    orderRef: (id) => `Commande #${id}`,
    greeting: (name) => (name ? `Bonjour ${name},` : "Bonjour,"),
    confirmed: "votre commande est confirmée ✅",
    typePickup: "📦 À emporter",
    typeDelivery: "🛵 Livraison",
    typeDineIn: "🍽️ Sur place",
    pickupOn: "🗓️ Retrait",
    deliveryOn: "🗓️ Livraison",
    asap: "dès que possible",
    deliveryAddress: "📍 Adresse de livraison",
    floor: "Étage",
    apartment: "Appartement",
    buildingCode: "Code immeuble",
    itemsHeading: "Votre commande",
    subtotal: "Sous-total",
    deliveryFee: "Frais de livraison",
    discount: "Remise",
    total: "Total",
    paid: "✅ Payé",
    toPayPickup: "⚠️ Non payé, à régler au retrait",
    toPayDelivery: "⚠️ Non payé, à régler à la livraison",
    toPayDineIn: "⚠️ Non payé, à régler sur place",
    balanceDue: "Reste à payer",
    trackOrder: "Suivre votre commande",
    comboFallback: "Combo",
    uncategorized: "Autres",
  },
  he: {
    orderRef: (id) => `הזמנה #${id}`,
    greeting: (name) => (name ? `שלום ${name},` : "שלום,"),
    confirmed: "ההזמנה שלך אושרה ✅",
    typePickup: "📦 איסוף עצמי",
    typeDelivery: "🛵 משלוח",
    typeDineIn: "🍽️ בישיבה",
    pickupOn: "🗓️ איסוף",
    deliveryOn: "🗓️ משלוח",
    asap: "בהקדם האפשרי",
    deliveryAddress: "📍 כתובת למשלוח",
    floor: "קומה",
    apartment: "דירה",
    buildingCode: "קוד כניסה",
    itemsHeading: "ההזמנה שלך",
    subtotal: "סכום ביניים",
    deliveryFee: "דמי משלוח",
    discount: "הנחה",
    total: "סה״כ",
    paid: "✅ שולם",
    toPayPickup: "⚠️ טרם שולם, תשלום באיסוף",
    toPayDelivery: "⚠️ טרם שולם, תשלום במשלוח",
    toPayDineIn: "⚠️ טרם שולם, תשלום במקום",
    balanceDue: "נותר לתשלום",
    trackOrder: "מעקב אחר ההזמנה",
    comboFallback: "קומבו",
    uncategorized: "אחר",
  },
  en: {
    orderRef: (id) => `Order #${id}`,
    greeting: (name) => (name ? `Hello ${name},` : "Hello,"),
    confirmed: "your order is confirmed ✅",
    typePickup: "📦 Pickup",
    typeDelivery: "🛵 Delivery",
    typeDineIn: "🍽️ Dine-in",
    pickupOn: "🗓️ Pickup",
    deliveryOn: "🗓️ Delivery",
    asap: "as soon as possible",
    deliveryAddress: "📍 Delivery address",
    floor: "Floor",
    apartment: "Apt",
    buildingCode: "Building code",
    itemsHeading: "Your order",
    subtotal: "Subtotal",
    deliveryFee: "Delivery fee",
    discount: "Discount",
    total: "Total",
    paid: "✅ Paid",
    toPayPickup: "⚠️ Unpaid, to be paid at pickup",
    toPayDelivery: "⚠️ Unpaid, to be paid on delivery",
    toPayDineIn: "⚠️ Unpaid, to be paid at the counter",
    balanceDue: "Balance due",
    trackOrder: "Track your order",
    comboFallback: "Combo",
    uncategorized: "Other",
  },
};

const LEGACY_INTL_LOCALE: Record<RecapLocale, string> = {
  fr: "fr-FR",
  he: "he-IL",
  en: "en-GB",
};

function legacyMoney(n: number): string {
  return `₪${(n ?? 0).toFixed(2)}`;
}

function legacyFormatDate(iso: string, locale: RecapLocale): string {
  try {
    return new Date(iso).toLocaleDateString(LEGACY_INTL_LOCALE[locale], {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

function legacyFormatTime(iso: string, locale: RecapLocale): string {
  try {
    return new Date(iso).toLocaleTimeString(LEGACY_INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function legacyFormatSlot(order: Order, locale: RecapLocale): string {
  const iso = order.scheduled_for;
  if (!iso) return LEGACY_STRINGS[locale].asap;

  const date = legacyFormatDate(iso, locale);
  const start = (order.scheduled_pickup_window_start || "").trim();
  const end = (order.scheduled_pickup_window_end || "").trim();

  if (start && end) return `${date}, ${start}–${end}`;
  if (start) return `${date}, ${start}`;
  const time = legacyFormatTime(iso, locale);
  return time ? `${date}, ${time}` : date;
}

function legacyModifierLine(modifiers: { name: string; price_delta?: number }[] | undefined): string {
  if (!modifiers || modifiers.length === 0) return "";
  return modifiers
    .map((m) => {
      const extra = m.price_delta && m.price_delta > 0 ? ` (+${legacyMoney(m.price_delta)})` : "";
      return `${m.name}${extra}`;
    })
    .join(" · ");
}

/** Verbatim copy of the pre-Task-7 buildOrderRecap. This is "today" for the
 *  purposes of this suite. */
function legacyBuildOrderRecap({ order, restaurantName, locale, receiptUrl }: BuildRecapOptions): string {
  const s = LEGACY_STRINGS[locale];
  const g = groupOrder(order, { uncategorized: s.uncategorized, comboFallback: s.comboFallback });

  const lines: string[] = [];

  if (restaurantName.trim()) lines.push(`*${restaurantName.trim()}*`);
  lines.push(s.orderRef(order.id));
  lines.push("");
  lines.push(`${s.greeting((order.customer_name || "").trim())} ${s.confirmed}`);
  lines.push("");

  const isDelivery = order.order_type === "delivery";
  const typeLabel =
    order.order_type === "delivery" ? s.typeDelivery : order.order_type === "dine_in" ? s.typeDineIn : s.typePickup;
  lines.push(typeLabel);
  if (order.order_type !== "dine_in") {
    lines.push(`${isDelivery ? s.deliveryOn : s.pickupOn} : ${legacyFormatSlot(order, locale)}`);
  }

  if (isDelivery) {
    const street = [order.delivery_address, order.delivery_city].map((v) => (v || "").trim()).filter(Boolean).join(", ");
    const unit = [
      (order.delivery_floor || "").trim() ? `${s.floor} ${order.delivery_floor!.trim()}` : "",
      (order.delivery_apt || "").trim() ? `${s.apartment} ${order.delivery_apt!.trim()}` : "",
      (order.delivery_entry_code || "").trim() ? `${s.buildingCode} ${order.delivery_entry_code!.trim()}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    if (street || unit) {
      const address = unit ? `${street} (${unit})` : street;
      lines.push(`${s.deliveryAddress} : ${address}`);
    }
  }

  lines.push("");
  lines.push(`*${s.itemsHeading}*`);

  for (const item of g.regularItems) {
    const variant = (item.selected_variant_name || "").trim();
    const name = variant ? `${item.name} (${variant})` : item.name;
    lines.push(`• ${item.quantity}× ${name} · ${legacyMoney(item.price * item.quantity)}`);

    const mods = legacyModifierLine(item.modifiers);
    if (mods) lines.push(`   ↳ ${mods}`);
    if ((item.notes || "").trim()) lines.push(`   ↳ “${item.notes!.trim()}”`);
  }

  for (const combo of g.comboGroups) {
    lines.push(`• ${combo.name} · ${legacyMoney(combo.price)}`);
    for (const step of combo.items) {
      const variant = (step.selected_variant_name || "").trim();
      const name = variant ? `${step.name} (${variant})` : step.name;
      const qty = step.quantity > 1 ? `${step.quantity}× ` : "";
      lines.push(`   ↳ ${qty}${name}`);

      const mods = legacyModifierLine(step.modifiers);
      if (mods) lines.push(`      ${mods}`);
    }
  }

  lines.push("");
  if (g.deliveryFee > 0 || g.discountAmount > 0) {
    lines.push(`${s.subtotal} : ${legacyMoney(g.subtotal)}`);
    if (g.discountAmount > 0) lines.push(`${s.discount} : −${legacyMoney(g.discountAmount)}`);
    if (g.deliveryFee > 0) lines.push(`${s.deliveryFee} : ${legacyMoney(g.deliveryFee)}`);
  }
  lines.push(`*${s.total} : ${legacyMoney(g.total)}*`);

  const balanceDue = order.balance_due ?? 0;
  if (order.payment_status === "paid" && balanceDue <= 0) {
    lines.push(s.paid);
  } else if (balanceDue > 0) {
    lines.push(`⚠️ ${s.balanceDue} : ${legacyMoney(balanceDue)}`);
  } else if (order.payment_status !== "refunded") {
    lines.push(isDelivery ? s.toPayDelivery : order.order_type === "dine_in" ? s.toPayDineIn : s.toPayPickup);
  }

  if (receiptUrl) {
    lines.push("");
    lines.push(`${s.trackOrder} : ${receiptUrl}`);
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES — one Order per branch cluster. Comments note which branch(es) of
// legacyBuildOrderRecap (enumerated below) each fixture exercises.
//
// Branch enumeration of the pre-refactor buildOrderRecap:
//   1. restaurantName blank vs set (heading line omitted vs shown)
//   2. customer_name blank vs set (greeting text)
//   3. order_type: pickup | delivery | dine_in (type label, 3-way)
//   4. slot line shown for pickup/delivery, omitted for dine_in
//   5. address composed only when isDelivery
//   6. within address: street-or-unit present vs both empty (line omitted)
//   7. within unit: floor/apartment/buildingCode each independently present
//   8. items: plain item, item with variant, item with modifiers, item with
//      notes, combo group, combo step with variant/qty>1/modifiers
//   9. totals: neither fee nor discount (plain total) / discount only / fee
//      only / both
//   10. payment: paid-and-no-balance / balance-due>0 / unpaid-not-refunded
//       (3 sub-variants by order_type) / refunded-with-no-balance (silent)
//   11. tracking link present vs absent
// ═══════════════════════════════════════════════════════════════════════════

const REGULAR_ITEM: OrderItem = {
  id: 1,
  menu_item_id: 10,
  name: "Salade César",
  price: 27,
  quantity: 2,
};

const ITEM_WITH_VARIANT_AND_MODIFIERS: OrderItem = {
  id: 2,
  menu_item_id: 11,
  name: "Pizza",
  price: 45,
  quantity: 1,
  selected_variant_name: "Grande",
  modifiers: [
    { id: 1, order_item_id: 2, menu_item_modifier_id: 1, name: "Sans oignons", action: "remove", price_delta: 0 },
    { id: 2, order_item_id: 2, menu_item_modifier_id: 2, name: "Supplément fromage", action: "add", price_delta: 6 },
  ],
  notes: "Bien cuite",
};

const COMBO_ITEMS: OrderItem[] = [
  {
    id: 3,
    menu_item_id: 20,
    name: "Burger",
    price: 0,
    quantity: 2,
    combo_group: "combo-1",
    combo_name: "Menu Burger",
    combo_price: 39,
    modifiers: [
      { id: 3, order_item_id: 3, menu_item_modifier_id: 3, name: "Extra sauce", action: "add", price_delta: 2 },
    ],
  },
  {
    id: 4,
    menu_item_id: 21,
    name: "Frites",
    price: 0,
    quantity: 1,
    combo_group: "combo-1",
    combo_name: "Menu Burger",
    combo_price: 39,
    selected_variant_name: "Grande",
  },
];

function baseOrder(overrides: Partial<Order>): Order {
  return {
    id: 100,
    restaurant_id: 7,
    order_type: "pickup",
    status: "accepted",
    payment_status: "paid",
    customer_name: "Leah",
    customer_phone: "0500000000",
    total_amount: 54,
    items: [REGULAR_ITEM],
    created_at: "2026-07-10T08:00:00.000Z",
    scheduled_for: "2026-07-16T10:00:00.000Z",
    scheduled_pickup_window_start: "10:00",
    scheduled_pickup_window_end: "14:00",
    ...overrides,
  };
}

interface Fixture {
  name: string;
  order: Order;
  restaurantName: string;
  receiptUrl?: string;
}

const FIXTURES: Fixture[] = [
  {
    // Branches: 1 (name set), 2 (name set), 3/4 (pickup + slot), 8 (plain item
    // + variant/modifiers/notes item together), 9 (plain total), 10 (paid),
    // 11 (link present).
    name: "pickup, named customer, tracking link, plain + variant/modifier/notes items, paid",
    order: baseOrder({
      order_type: "pickup",
      items: [REGULAR_ITEM, ITEM_WITH_VARIANT_AND_MODIFIERS],
      payment_status: "paid",
    }),
    restaurantName: "Chez Foody",
    receiptUrl: "https://app.foody-pos.co.il/r/chez-foody/receipt/abc123",
  },
  {
    // Branches: 3/4 (delivery + slot), 5/6/7 (address with full unit info),
    // 8 (combo with qty>1 step + modifiers + variant step), 9 (both fee and
    // discount), 10 (unpaid delivery → toPayDelivery).
    name: "delivery, full address, combo items, fee+discount, unpaid",
    order: baseOrder({
      order_type: "delivery",
      items: COMBO_ITEMS,
      delivery_address: "12 rue de la Paix",
      delivery_city: "Paris",
      delivery_floor: "2",
      delivery_apt: "5B",
      delivery_entry_code: "A1234",
      delivery_fee: 12,
      discount_amount: 8,
      payment_status: "unpaid",
      total_amount: 82,
      scheduled_pickup_window_start: "",
      scheduled_pickup_window_end: "",
    }),
    restaurantName: "Chez Foody",
  },
  {
    // Branches: 2 (no name), 3/4 (dine_in → no slot, no address at all),
    // 8 (combo again with different shape), 9 (plain total), 10 (balance due
    // > 0 regardless of payment_status), 11 (no link).
    name: "dine-in, no name, no link, combo, plain total, partial balance due",
    order: baseOrder({
      order_type: "dine_in",
      customer_name: "",
      items: COMBO_ITEMS,
      payment_status: "unpaid",
      balance_due: 15,
    }),
    restaurantName: "Chez Foody",
  },
  {
    // Branches: 1 (blank restaurant name), 9 (discount only, no fee),
    // 10 (refunded + no balance due → payment line silently omitted).
    name: "blank restaurant name, discount only, refunded (silent payment line)",
    order: baseOrder({
      order_type: "pickup",
      discount_amount: 5,
      total_amount: 49,
      payment_status: "refunded",
    }),
    restaurantName: "   ",
  },
  {
    // Branches: 10 (unpaid pickup → toPayPickup).
    name: "pickup, unpaid, no balance due (toPayPickup)",
    order: baseOrder({ order_type: "pickup", payment_status: "unpaid" }),
    restaurantName: "Chez Foody",
  },
  {
    // Branches: 3/4 (dine_in), 10 (unpaid dine_in → toPayDineIn).
    name: "dine-in, unpaid (toPayDineIn)",
    order: baseOrder({ order_type: "dine_in", payment_status: "unpaid" }),
    restaurantName: "Chez Foody",
  },
  {
    // Branches: 5/6 (delivery order but every address field blank → address
    // block empty despite isDelivery).
    name: "delivery with no address content at all",
    order: baseOrder({
      order_type: "delivery",
      delivery_address: "",
      delivery_city: "",
      delivery_floor: "",
      delivery_apt: "",
      delivery_entry_code: "",
    }),
    restaurantName: "Chez Foody",
  },
  {
    // Branches: 5/6/7 (delivery, street only, no unit sub-fields at all →
    // address without the parenthesized unit part).
    name: "delivery, street only, no unit info",
    order: baseOrder({
      order_type: "delivery",
      delivery_address: "9 avenue Foch",
      delivery_city: "Lyon",
    }),
    restaurantName: "Chez Foody",
  },
  {
    // Branches: 3/4 with scheduled_for but no window at all (asap-shaped
    // fallback inside formatSlot is exercised through the real function, not
    // reimplemented here).
    name: "pickup, scheduled but no pickup window",
    order: baseOrder({
      order_type: "pickup",
      scheduled_pickup_window_start: "",
      scheduled_pickup_window_end: "",
    }),
    restaurantName: "Chez Foody",
  },
];

// ─── Fidelity: renderTemplate(registry default, buildRecapContext(...)) must
// match legacyBuildOrderRecap(...) byte for byte, for every fixture × locale. ─

for (const fixture of FIXTURES) {
  for (const locale of RECAP_LOCALES) {
    test(`fidelity: ${fixture.name} [${locale}]`, () => {
      const opts: BuildRecapOptions = {
        order: fixture.order,
        restaurantName: fixture.restaurantName,
        locale,
        receiptUrl: fixture.receiptUrl,
      };

      const expected = legacyBuildOrderRecap(opts);
      const def = findTemplate("order_recap")!;
      const ctx = buildRecapContext(opts);
      const actual = renderTemplate(def.defaults[locale], ctx);

      assert.equal(actual, expected);

      // Risk 3: missingFromContext must be silent — every token/block the
      // shipped default uses must be a declared key in this context (empty
      // string is fine; an omitted key is not).
      assert.deepEqual(
        missingFromContext(def.defaults[locale], def, ctx),
        [],
        `context omits a key the ${locale} default declares`,
      );
    });
  }
}

// ─── buildOrderRecap itself (no `body`) must equal the manual composition
// above — proves the production wrapper is wired to the registry default. ───

test("buildOrderRecap with no body composes from the registry default (fr)", () => {
  const fixture = FIXTURES[0];
  const opts: BuildRecapOptions = {
    order: fixture.order,
    restaurantName: fixture.restaurantName,
    locale: "fr",
    receiptUrl: fixture.receiptUrl,
  };
  const def = findTemplate("order_recap")!;
  const expectedViaManualComposition = renderTemplate(def.defaults.fr, buildRecapContext(opts));

  assert.equal(buildOrderRecap(opts), expectedViaManualComposition);
  assert.equal(buildOrderRecap(opts), legacyBuildOrderRecap(opts));
});

test("buildOrderRecap honors a custom body over the registry default", () => {
  const fixture = FIXTURES[0];
  const opts: BuildRecapOptions & { body?: string } = {
    order: fixture.order,
    restaurantName: fixture.restaurantName,
    locale: "fr",
    body: "Merci {{client}} pour votre commande #{{numero_commande}} !",
  };
  assert.equal(buildOrderRecap(opts), "Merci Leah pour votre commande #100 !");
});

// ─── Risk 1: the slot line's label is chosen dynamically per order, not a
// static per-locale template string. Pickup and delivery must read differently
// even though they share the same template body. ────────────────────────────

test("risk 1: pickup and delivery produce differently labeled slot lines", () => {
  const pickup = baseOrder({ order_type: "pickup" });
  const delivery = baseOrder({
    order_type: "delivery",
    delivery_address: "1 rue Test",
    delivery_city: "Paris",
  });

  const pickupOut = buildOrderRecap({ order: pickup, restaurantName: "Chez Foody", locale: "fr" });
  const deliveryOut = buildOrderRecap({ order: delivery, restaurantName: "Chez Foody", locale: "fr" });

  assert.ok(pickupOut.includes("🗓️ Retrait : "), "pickup must show the Retrait label");
  assert.ok(!pickupOut.includes("🗓️ Livraison : "), "pickup must not show the Livraison label");
  assert.ok(deliveryOut.includes("🗓️ Livraison : "), "delivery must show the Livraison label");
  assert.ok(!deliveryOut.includes("🗓️ Retrait : "), "delivery must not show the Retrait label");
});

// ─── Risk 2: emoji ownership must be consistent — never doubled, never
// dropped, regardless of whether a block/token or the template body supplies
// it. Spot check against the exact legacy strings. ──────────────────────────

test("risk 2: no doubled or missing emoji on the type/slot/address lines", () => {
  const order = baseOrder({
    order_type: "delivery",
    delivery_address: "1 rue Test",
    delivery_city: "Paris",
  });
  const out = buildOrderRecap({ order, restaurantName: "Chez Foody", locale: "fr" });

  assert.ok(out.includes("🛵 Livraison"), "type_commande must keep its emoji");
  assert.ok(!out.includes("🛵 🛵"), "type_commande emoji must not double");
  assert.ok(out.includes("🗓️ Livraison : "), "slot line must show exactly one calendar emoji + label");
  assert.ok(!out.includes("🗓️ 🗓️"), "slot emoji must not double");
  assert.ok(out.includes("📍 Adresse de livraison : "), "address line must show exactly one pin emoji + label");
  assert.ok(!out.includes("📍 📍"), "address emoji must not double");
});

// ─── buildRecapContext, tested directly (no template involved) ─────────────

test("the context declares every token and block the registry expects for order_recap", () => {
  const def = findTemplate("order_recap")!;
  const ctx = buildRecapContext({ order: baseOrder({}), restaurantName: "Mamie", locale: "fr" });

  for (const name of def.tokens) {
    assert.ok(name in ctx.tokens, `token ${name} is missing from ctx.tokens`);
  }
  for (const name of def.blocks) {
    assert.ok(name in ctx.blocks, `block ${name} is missing from ctx.blocks`);
  }
});

test("a pickup order produces an empty address block, not a bare label", () => {
  const ctx = buildRecapContext({ order: baseOrder({ order_type: "pickup" }), restaurantName: "Mamie", locale: "fr" });
  assert.equal(ctx.blocks.adresse, "");
});

test("a dine-in order produces an empty creneau token", () => {
  const ctx = buildRecapContext({ order: baseOrder({ order_type: "dine_in" }), restaurantName: "Mamie", locale: "fr" });
  assert.equal(ctx.tokens.creneau, "");
});

test("the customer name lands in the client token, trimmed", () => {
  const ctx = buildRecapContext({
    order: baseOrder({ customer_name: "  Leah  " }),
    restaurantName: "Mamie",
    locale: "fr",
  });
  assert.equal(ctx.tokens.client, "Leah");
  assert.equal(ctx.tokens.restaurant, "Mamie");
  assert.equal(ctx.tokens.numero_commande, "100");
});

test("salutation is always non-empty, with or without a name", () => {
  const withName = buildRecapContext({ order: baseOrder({ customer_name: "Leah" }), restaurantName: "M", locale: "fr" });
  const withoutName = buildRecapContext({ order: baseOrder({ customer_name: "" }), restaurantName: "M", locale: "fr" });
  assert.equal(withName.blocks.salutation, "Bonjour Leah,");
  assert.equal(withoutName.blocks.salutation, "Bonjour,");
});

test("lien_suivi carries its own leading blank line and vanishes without a URL", () => {
  const withUrl = buildRecapContext({
    order: baseOrder({}),
    restaurantName: "M",
    locale: "fr",
    receiptUrl: "https://example.com/r/1",
  });
  const withoutUrl = buildRecapContext({ order: baseOrder({}), restaurantName: "M", locale: "fr" });
  assert.equal(withUrl.blocks.lien_suivi, "\nSuivre votre commande : https://example.com/r/1");
  assert.equal(withoutUrl.blocks.lien_suivi, "");
});
