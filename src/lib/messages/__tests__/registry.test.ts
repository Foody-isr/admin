import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATE_REGISTRY, findTemplate, unknownTokens, missingFromContext } from "../registry";
import { renderTemplate, type RenderContext } from "../render";
import { buildOrderRecap } from "@/lib/orders/whatsapp-recap";
import { groupOrder } from "@/lib/orders/group-order";
import type { Order } from "@/lib/api";

test("the order recap template is registered with its tokens and blocks", () => {
  const def = findTemplate("order_recap");
  assert.ok(def, "order_recap must be in the registry");
  assert.ok(def!.blocks.includes("articles"));
  assert.ok(def!.tokens.includes("client"));
});

test("every registered template ships a default in all three locales", () => {
  for (const def of TEMPLATE_REGISTRY) {
    for (const locale of ["fr", "he", "en"] as const) {
      assert.ok(
        def.defaults[locale] && def.defaults[locale].trim().length > 0,
        `${def.key} has no ${locale} default`,
      );
    }
  }
});

// Every token used by a shipped default must be declared, or the editor would
// flag Foody's own text as invalid.
test("shipped defaults only use declared tokens", () => {
  for (const def of TEMPLATE_REGISTRY) {
    for (const locale of ["fr", "he", "en"] as const) {
      assert.deepEqual(
        unknownTokens(def.defaults[locale], def),
        [],
        `${def.key}/${locale} uses an undeclared token`,
      );
    }
  }
});

test("unknownTokens reports what the editor must flag", () => {
  const def = findTemplate("order_recap")!;
  assert.deepEqual(unknownTokens("{{client}} {{nawak}}", def), ["nawak"]);
});

test("unknownTokens returns each unknown token once", () => {
  const def = findTemplate("order_recap")!;
  assert.deepEqual(unknownTokens("{{nawak}} {{nawak}}", def), ["nawak"]);
});

// The four shapes that used to slip past every guard at once: not substituted,
// not flagged, not protected before translation. Only the preview caught them.
// The editor's live validation is the one signal the owner sees WHILE typing,
// so it has to fire on anything brace-shaped, not just on well-formed names.
test("unknownTokens flags a malformed placeholder while it is being typed", () => {
  const def = findTemplate("order_recap")!;
  assert.deepEqual(unknownTokens("Bonjour {{Client}}", def), ["Client"]);
  assert.deepEqual(unknownTokens("Bonjour {{ CLIENT }}", def), ["CLIENT"]);
  assert.deepEqual(unknownTokens("Bonjour {{numéro}}", def), ["numéro"]);
  assert.deepEqual(unknownTokens("Bonjour {{client-name}}", def), ["client-name"]);
});

// The inner spacing the renderer tolerates must not be reported as a typo, or
// the editor would cry wolf over text that works perfectly.
test("unknownTokens does not flag a declared token written with inner spacing", () => {
  const def = findTemplate("order_recap")!;
  assert.deepEqual(unknownTokens("Bonjour {{ client }}", def), []);
});

// ─── Fidelity: renderTemplate(default, ctx) vs buildOrderRecap(...) ─────────
//
// buildOrderRecap() in whatsapp-recap.ts is still the message that actually
// ships today; nothing in Task 6 rewires it yet. These tests do not invent
// their own idea of what the message should look like: they call the real
// buildOrderRecap() as ground truth and check that the registry's shipped
// default, fed a context built the same way a future Task 7 builder would,
// reproduces it byte for byte. `fakeContextFr` below is a minimal stand-in
// for that builder (fr only) — Task 7 owns the real one and its own broader
// comparison suite; this only needs to prove the two cases the review found.

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 42,
    restaurant_id: 7,
    order_type: "pickup",
    status: "accepted",
    payment_status: "unpaid",
    customer_name: "Leah",
    customer_phone: "0500000000",
    total_amount: 54,
    items: [{ id: 1, menu_item_id: 10, name: "Salade César", price: 27, quantity: 2 }],
    created_at: "2026-08-06T10:00:00.000Z",
    scheduled_for: "2026-08-13T10:00:00.000Z",
    scheduled_pickup_window_start: "10:00",
    scheduled_pickup_window_end: "14:00",
    ...overrides,
  };
}

function money(n: number): string {
  return `₪${(n ?? 0).toFixed(2)}`;
}

// Same Intl call, same options, same locale tag as whatsapp-recap.ts's private
// formatDate/formatTime: calling the identical built-in with identical
// arguments is guaranteed byte-identical, so this does not need to import
// (or duplicate the risk of drifting from) those private functions.
function slotTextFr(order: Order): string {
  const iso = order.scheduled_for;
  if (!iso) return "dès que possible";
  const date = new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const start = (order.scheduled_pickup_window_start || "").trim();
  const end = (order.scheduled_pickup_window_end || "").trim();
  if (start && end) return `${date}, ${start}–${end}`;
  if (start) return `${date}, ${start}`;
  return date;
}

function articlesFr(order: Order): string {
  const g = groupOrder(order, { uncategorized: "Autres", comboFallback: "Combo" });
  const lines: string[] = [];
  for (const item of g.regularItems) {
    lines.push(`• ${item.quantity}× ${item.name} · ${money(item.price * item.quantity)}`);
  }
  for (const combo of g.comboGroups) {
    lines.push(`• ${combo.name} · ${money(combo.price)}`);
    for (const step of combo.items) {
      const qty = step.quantity > 1 ? `${step.quantity}× ` : "";
      lines.push(`   ↳ ${qty}${step.name}`);
    }
  }
  return lines.join("\n");
}

function totauxFr(order: Order): string {
  const g = groupOrder(order, { uncategorized: "Autres", comboFallback: "Combo" });
  const lines: string[] = [];
  if (g.deliveryFee > 0 || g.discountAmount > 0) {
    lines.push(`Sous-total : ${money(g.subtotal)}`);
    if (g.discountAmount > 0) lines.push(`Remise : −${money(g.discountAmount)}`);
    if (g.deliveryFee > 0) lines.push(`Frais de livraison : ${money(g.deliveryFee)}`);
  }
  lines.push(`*Total : ${money(g.total)}*`);
  return lines.join("\n");
}

function statutPaiementFr(order: Order): string {
  const balanceDue = order.balance_due ?? 0;
  if (order.payment_status === "paid" && balanceDue <= 0) return "✅ Payé";
  if (balanceDue > 0) return `⚠️ Reste à payer : ${money(balanceDue)}`;
  if (order.payment_status !== "refunded") {
    return order.order_type === "delivery"
      ? "⚠️ Non payé, à régler à la livraison"
      : order.order_type === "dine_in"
        ? "⚠️ Non payé, à régler sur place"
        : "⚠️ Non payé, à régler au retrait";
  }
  return "";
}

// Fixed case (Finding 2): the shipped default no longer places {{client}} next
// to the confirmation text. `salutation` assembles the whole "Bonjour X," /
// "Bonjour," phrase, guaranteed non-empty, matching STRINGS.fr.greeting.
function salutationFr(name: string | undefined): string {
  const trimmed = (name || "").trim();
  return trimmed ? `Bonjour ${trimmed},` : "Bonjour,";
}

// Fixed case (Finding 1): the value itself carries the separating blank line,
// so it disappears together with the link when there is no receipt URL.
function lienSuiviFr(receiptUrl: string | undefined): string {
  return receiptUrl ? `\nSuivre votre commande : ${receiptUrl}` : "";
}

function fakeContextFr(order: Order, restaurantName: string, receiptUrl: string | undefined): RenderContext {
  const isDelivery = order.order_type === "delivery";
  return {
    tokens: {
      restaurant: restaurantName,
      client: (order.customer_name || "").trim(),
      numero_commande: String(order.id),
      creneau:
        order.order_type === "dine_in"
          ? ""
          : `${isDelivery ? "Livraison" : "Retrait"} : ${slotTextFr(order)}`,
    },
    blocks: {
      type_commande: isDelivery ? "🛵 Livraison" : order.order_type === "dine_in" ? "🍽️ Sur place" : "📦 À emporter",
      articles: articlesFr(order),
      totaux: totauxFr(order),
      adresse: "", // fixture never uses delivery; not what Findings 1/2 are about
      // Declared, not omitted: an omitted key renders in place and leaves a
      // bare "ℹ️" on the line, an empty one lets the line vanish. That is the
      // whole point of missingFromContext, which flagged this fixture.
      infos_client: "",
      statut_paiement: statutPaiementFr(order),
      salutation: salutationFr(order.customer_name),
      lien_suivi: lienSuiviFr(receiptUrl),
    },
  };
}

test("order_recap default reproduces buildOrderRecap exactly (name + tracking link)", () => {
  const order = makeOrder({ customer_name: "Leah" });
  const restaurantName = "Chez Foody";
  const receiptUrl = "https://app.foody-pos.co.il/r/chez-foody/receipt/abc123";

  const expected = buildOrderRecap({ order, restaurantName, locale: "fr", receiptUrl });
  const actual = renderTemplate(findTemplate("order_recap")!.defaults.fr, fakeContextFr(order, restaurantName, receiptUrl));

  assert.equal(actual, expected);
});

// Finding 1: buildOrderRecap only pushes the blank separator together with the
// tracking line, inside `if (receiptUrl)`; an order with no receipt URL gets
// neither. Before the fix, the static blank template line survived (a line
// with no tokens is never dropped) leaving an orphan trailing blank line.
test("no tracking link: no orphan trailing blank line, matches buildOrderRecap exactly", () => {
  const order = makeOrder({ customer_name: "Leah" });
  const restaurantName = "Chez Foody";

  const expected = buildOrderRecap({ order, restaurantName, locale: "fr" });
  const actual = renderTemplate(findTemplate("order_recap")!.defaults.fr, fakeContextFr(order, restaurantName, undefined));

  assert.equal(actual, expected);
  assert.ok(!actual.endsWith("\n"), "must not end with a trailing blank line");
});

// Finding 2: STRINGS.fr.greeting always renders something ("Bonjour," with no
// name), so buildOrderRecap's confirmation line is never empty. Before the
// fix, {{client}} was the greeting line's only declared token: an empty name
// made the drop rule remove the whole line, confirmation text included.
test("no customer name: confirmation text survives, matches buildOrderRecap exactly", () => {
  const order = makeOrder({ customer_name: "" });
  const restaurantName = "Chez Foody";
  const receiptUrl = "https://app.foody-pos.co.il/r/chez-foody/receipt/abc123";

  const expected = buildOrderRecap({ order, restaurantName, locale: "fr", receiptUrl });
  const actual = renderTemplate(findTemplate("order_recap")!.defaults.fr, fakeContextFr(order, restaurantName, receiptUrl));

  assert.equal(actual, expected);
  assert.ok(actual.includes("votre commande est confirmée"), "confirmation text must survive with no name");
});

// ─── Finding 3: the declared-versus-omitted contract ────────────────────────

test("missingFromContext catches a key the template uses that the context omits entirely", () => {
  const def = findTemplate("order_recap")!;
  // Omits everything except `restaurant` (not set to "", genuinely absent).
  const partial: RenderContext = { tokens: { restaurant: "Chez Foody" }, blocks: {} };
  const missing = missingFromContext(def.defaults.fr, def, partial);

  assert.ok(missing.includes("salutation"), "an omitted block must be reported");
  assert.ok(missing.includes("numero_commande"), "an omitted token must be reported");
  assert.ok(!missing.includes("restaurant"), "a key that IS present must not be reported");
});

test("missingFromContext is silent on a complete context, even with legitimate empty values", () => {
  const def = findTemplate("order_recap")!;
  const order = makeOrder();
  const ctx = fakeContextFr(order, "Chez Foody", undefined); // adresse/lien_suivi are "" on purpose
  assert.deepEqual(missingFromContext(def.defaults.fr, def, ctx), []);
});
