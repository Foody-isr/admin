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

import type { CheckoutConfig, CheckoutFieldConfig } from '@/lib/api';

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
