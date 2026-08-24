// Catches a checkout field that duplicates one the platform already knows how
// to handle.
//
// WHY THIS EXISTS. A restaurant hand-typed a custom field with the id
// `code_immeuble` and the label "Code immeuble", while the BUILT-IN field
// `delivery_entry_code` — labelled "Code immeuble" in French, and offered as a
// one-click chip in this very editor — sat unused. Nothing warned them.
//
// The two are not interchangeable. Routing is by field ID: foodyweb checks
// `BUILTIN_FIELD_IDS` and sends a built-in answer to its own typed Order
// column, and everything else into the `custom_fields` jsonb bag. So the
// customer's building code never reached `orders.delivery_entry_code`, and is
// therefore invisible to the delivery-address block, the dispatcher, the
// customers page, the WhatsApp address line and the guest-account autofill.
// It is not lost — just filed under the customer's name instead of the
// address the driver reads.
//
// A warning, never a block. The owner may have a real reason, and refusing to
// save would strand them mid-edit. What it gives them is the one-click swap.
//
// Deliberately not 'use client': the matching rule is the part worth testing,
// and the .tsx suite has a history of not running.

import type { CheckoutFieldConfig } from '@/lib/api';

/**
 * The platform's own labels for the built-in fields, in the three locales the
 * product ships. Mirrors foodyweb's BUILTIN_DEFAULT_LABELS (a separate
 * service, so the duplication is expected) and is the source for the editor's
 * chips.
 */
export const BUILTIN_LABELS: Record<string, { en: string; fr: string; he: string }> = {
  customer_first_name: { en: 'First name',     fr: 'Prénom',            he: 'שם פרטי' },
  customer_name:    { en: 'Full name',         fr: 'Nom complet',       he: 'שם מלא' },
  customer_phone:   { en: 'Phone number',      fr: 'Téléphone',         he: 'טלפון' },
  delivery_address: { en: 'Delivery address',  fr: 'Adresse de livraison', he: 'כתובת למשלוח' },
  delivery_city:    { en: 'City',              fr: 'Ville',             he: 'עיר' },
  delivery_floor:   { en: 'Floor',             fr: 'Étage',             he: 'קומה' },
  delivery_apt:     { en: 'Apartment / unit',  fr: 'Appartement',       he: 'דירה' },
  delivery_entry_code: { en: 'Building code',  fr: 'Code immeuble',     he: 'קוד כניסה' },
  delivery_notes:   { en: 'Delivery notes',    fr: 'Notes de livraison', he: 'הערות למשלוח' },
  pickup_notes:     { en: 'Notes',             fr: 'Notes',             he: 'הערות' },
  whatsapp_number:  { en: 'WhatsApp number',   fr: 'Numéro WhatsApp',   he: 'מספר וואטסאפ' },
};

/** The built-in's French label, for the editor's chips and messages. */
export function builtinLabel(id: string): string {
  return BUILTIN_LABELS[id]?.fr ?? id;
}

/**
 * Strip a label or id down to the letters that carry its meaning, so
 * "Code immeuble", "code_immeuble" and "CODE IMMEUBLE" all compare equal.
 *
 * Separators and punctuation are removed by DENY-list, not by allow-listing
 * [a-z0-9]: an allow-list would erase a Hebrew label completely and make two
 * unrelated Hebrew fields compare equal as "". Diacritics fold so "Étage"
 * meets "etage". No unicode property escapes — tsconfig targets es5 and the
 * `u` flag is not available.
 */
export function normalizeFieldName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-_'’.,:;/\\()[\]{}"«»]+/g, '');
}

/**
 * The built-in fields that describe WHERE the order goes, as opposed to who
 * placed it. A subset of BUILTIN_DELIVERY_FIELDS: that catalogue also carries
 * customer_name and customer_phone, which belong with the customer.
 *
 * Used twice — to warn an owner in the checkout editor, and to decide which
 * answers the order screen files under the address.
 */
export const DELIVERY_ADDRESS_BUILTIN_IDS: ReadonlyArray<string> = [
  'delivery_address',
  'delivery_city',
  'delivery_floor',
  'delivery_apt',
  'delivery_entry_code',
  'delivery_notes',
];

/**
 * The built-in one of these names stands for, or null.
 *
 * Exact normalised equality against the platform's OWN labels in en/fr/he plus
 * the built-in id. Deliberately not a keyword rule: "Code promo" does not match
 * "Code immeuble", and nothing tries to guess that "Digicode" means the same
 * thing. A miss is a non-event; a false positive files someone's real field
 * under the wrong heading.
 */
export function matchBuiltinByName(
  names: ReadonlyArray<string | undefined>,
  builtinIds: ReadonlyArray<string>,
): string | null {
  const candidates = names.map((s) => normalizeFieldName(s ?? '')).filter(Boolean);
  if (candidates.length === 0) return null;

  for (const builtinId of builtinIds) {
    const known = [
      builtinId,
      BUILTIN_LABELS[builtinId]?.fr,
      BUILTIN_LABELS[builtinId]?.en,
      BUILTIN_LABELS[builtinId]?.he,
    ]
      .map((s) => normalizeFieldName(s ?? ''))
      .filter(Boolean);
    if (candidates.some((c) => known.indexOf(c) !== -1)) return builtinId;
  }
  return null;
}

export type FieldConflict =
  /** Two fields in this form carry the same id. The later one wins in the
   *  submitted payload, silently. */
  | { kind: 'duplicate_id'; builtinId?: undefined }
  /** A custom field has taken a built-in's id. foodyweb routes by ID, so the
   *  answer WILL land in the typed column — it works, but the editor shows it
   *  as "personnalisé" and the owner has no idea. */
  | { kind: 'reserved_id'; builtinId: string; builtinAlreadyInForm: boolean }
  /** A custom field asks the same question as a built-in, under a different
   *  id. This is the one that bit us: it silently forfeits the typed column. */
  | { kind: 'shadows_builtin'; builtinId: string; builtinAlreadyInForm: boolean };

/**
 * What is wrong with one field, given the form it sits in and the built-ins
 * available for that order type. Null when nothing is.
 *
 * Ordered hardest-first: a duplicate id breaks the payload outright, so it
 * outranks a merely redundant field.
 *
 * `shadows_builtin` matches ONLY on an exact normalised equality against the
 * platform's own labels in en/fr/he, plus the built-in's id. It is not a
 * keyword heuristic: "Code promo" does not match "Code immeuble", and nothing
 * tries to guess that "Digicode" means the same thing. Authoring-time
 * suggestion the owner can ignore, not a runtime routing decision.
 */
export function detectFieldConflict(
  field: CheckoutFieldConfig,
  allFields: ReadonlyArray<CheckoutFieldConfig>,
  builtinIds: ReadonlyArray<string>,
): FieldConflict | null {
  if (allFields.filter((f) => f.id === field.id).length > 1) {
    return { kind: 'duplicate_id' };
  }

  // Built-ins are added from the chip list, so they cannot be misdeclared.
  if (field.kind !== 'custom') return null;

  const inForm = (id: string) => allFields.some((f) => f !== field && f.id === id);

  if (builtinIds.indexOf(field.id) !== -1) {
    return { kind: 'reserved_id', builtinId: field.id, builtinAlreadyInForm: inForm(field.id) };
  }

  const builtinId = matchBuiltinByName(
    [field.label?.fr, field.label?.en, field.label?.he, field.id],
    builtinIds,
  );
  if (builtinId) {
    return { kind: 'shadows_builtin', builtinId, builtinAlreadyInForm: inForm(builtinId) };
  }

  return null;
}

/**
 * The custom field, rewritten as the built-in it was imitating.
 *
 * The owner's label is DROPPED on purpose. The editor only ever writes `fr`
 * (CheckoutEditor's FieldEditor has one label input), so keeping it would show
 * French to a Hebrew-speaking customer forever. With no label, foodyweb falls
 * back to its own BUILTIN_DEFAULT_LABELS, which are translated — so the swap
 * gains the customer two languages.
 *
 * `enabled`, `required` and the visibility rule survive: those are the owner's
 * decisions about their form, not about this field's identity.
 */
export function asBuiltinField(field: CheckoutFieldConfig, builtinId: string): CheckoutFieldConfig {
  return {
    id: builtinId,
    kind: 'builtin',
    enabled: field.enabled,
    required: field.required,
    visible_when: field.visible_when ?? null,
  };
}
