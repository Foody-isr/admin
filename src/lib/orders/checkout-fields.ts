// Resolving a checkout field's display label.
//
// An order stores answers to the owner's custom checkout fields in
// `Order.custom_fields`, keyed by FIELD ID rather than by label — so anything
// rendering those answers has to reach back into the restaurant's checkout
// config to find out what "code_immeuble" is called.
//
// Moved verbatim from OrderDetailDrawer.tsx lines 220-249, with one addition:
// the label resolver now takes an optional locale. Customer-facing surfaces
// (the WhatsApp recap, the confirmation page, the receipt) must label these
// answers in the CUSTOMER's language, not the staff member's. Omitting the
// locale preserves the original staff-side behaviour exactly.

import type { CheckoutConfig, CheckoutFieldConfig, Order } from '@/lib/api';
import {
  matchBuiltinByName,
  DELIVERY_ADDRESS_BUILTIN_IDS,
} from '@/lib/website/checkout-field-conflicts';

/**
 * Turn a snake_case field id into a readable fallback label
 * ("code_immeuble" → "Code immeuble"). Used only when the owner left the
 * field's label blank in every locale.
 */
export function humanizeFieldId(id: string): string {
  return id
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

/**
 * Best display label for a checkout field.
 *
 * With a `locale`, that locale wins. Then the owner's fr label, then en, then
 * any locale present, falling back to a humanized id. fr leads the fallback
 * chain because it is the de-facto authoring language for restaurant content
 * in this product, and that ordering predates this module.
 */
export function bestFieldLabel(field: CheckoutFieldConfig, locale?: string): string {
  const l = field.label;
  return (
    (locale ? l?.[locale] : undefined) ||
    l?.fr ||
    l?.en ||
    (l && Object.values(l)[0]) ||
    humanizeFieldId(field.id)
  );
}

/**
 * Flatten a restaurant's checkout config into an id→label map across both
 * order-type forms, so any surface can label the custom-field answers stored
 * on an order.
 *
 * Pass the customer's locale on customer-facing surfaces; omit it for staff.
 */
export function buildCustomFieldLabels(
  cfg: CheckoutConfig | null | undefined,
  locale?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cfg) return out;
  for (const form of [cfg.delivery, cfg.pickup]) {
    for (const f of form?.fields ?? []) out[f.id] = bestFieldLabel(f, locale);
  }
  return out;
}

/** One answered custom checkout field, ready to render. */
export type CustomFieldAnswer = { id: string; label: string; value: string };

/**
 * Split an order's custom-field answers between the delivery-address block and
 * the customer block.
 *
 * WHY THIS EXISTS. A building code the customer typed in reaches the order one
 * of two ways. If the owner used the BUILT-IN `delivery_entry_code` field, it
 * lands in a typed column and the address formatter folds it into the address.
 * If the owner hand-rolled a custom field instead — which is what happened, and
 * what checkout-field-conflicts.ts now warns about — the answer lands in the
 * `custom_fields` bag and used to render beside the customer's NAME, four rows
 * above the address it describes. Staff reading out an address, and customers
 * checking their own confirmation, were looking in the wrong place.
 *
 * The rule is the same exact-match one the checkout editor uses, restricted to
 * the address built-ins: `customer_name` and `customer_phone` are in the
 * delivery catalogue too and belong with the customer. A genuinely
 * delivery-related field with no built-in equivalent ("Interphone") stays with
 * the customer — a miss, but an honest one. Guessing at synonyms is how
 * "Code promo" ends up filed under the address.
 *
 * Computed ONCE and handed to both panels. Two panels each applying half a
 * predicate is how an answer ends up rendered twice, or nowhere.
 */
export function splitCustomFieldAnswers(
  order: Pick<Order, 'order_type' | 'custom_fields'>,
  labels: Record<string, string>,
): { address: CustomFieldAnswer[]; customer: CustomFieldAnswer[] } {
  const address: CustomFieldAnswer[] = [];
  const customer: CustomFieldAnswer[] = [];
  // Only a delivery order HAS an address block. On pickup everything stays put
  // or it would render nowhere at all.
  const isDelivery = order.order_type === 'delivery';

  for (const [id, raw] of Object.entries(order.custom_fields ?? {})) {
    // Empty and false answers are already dropped server-side; this is the
    // belt to that braces, and it also drops nulls.
    if (raw === '' || raw === false || raw == null) continue;
    const label = labels[id] || humanizeFieldId(id);
    const answer: CustomFieldAnswer = {
      id,
      label,
      value: typeof raw === 'boolean' ? '✓' : String(raw),
    };
    // The id is matched as well as the label, so an owner who left the label
    // blank still gets the placement right.
    const belongsToAddress =
      isDelivery && matchBuiltinByName([label, id], DELIVERY_ADDRESS_BUILTIN_IDS) !== null;
    (belongsToAddress ? address : customer).push(answer);
  }

  return { address, customer };
}
