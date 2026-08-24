import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectFieldConflict,
  normalizeFieldName,
  asBuiltinField,
  BUILTIN_LABELS,
} from "@/lib/website/checkout-field-conflicts";
import { BUILTIN_DELIVERY_FIELDS, BUILTIN_PICKUP_FIELDS, type CheckoutFieldConfig } from "@/lib/api";

const DELIVERY = BUILTIN_DELIVERY_FIELDS.map((b) => b.id);
const PICKUP = BUILTIN_PICKUP_FIELDS.map((b) => b.id);

function custom(over: Partial<CheckoutFieldConfig> = {}): CheckoutFieldConfig {
  return { id: "custom_field_1", kind: "custom", type: "text", enabled: true, required: false, ...over };
}

function builtin(id: string, over: Partial<CheckoutFieldConfig> = {}): CheckoutFieldConfig {
  return { id, kind: "builtin", enabled: true, required: false, ...over };
}

// ─── The case this was built for ─────────────────────────────────────────────

test("a hand-typed code_immeuble is flagged as shadowing delivery_entry_code", () => {
  const field = custom({ id: "code_immeuble", label: { fr: "Code immeuble" } });
  const c = detectFieldConflict(field, [field], DELIVERY);

  assert.equal(c?.kind, "shadows_builtin");
  assert.equal(c && "builtinId" in c && c.builtinId, "delivery_entry_code");
  assert.equal(c && "builtinAlreadyInForm" in c && c.builtinAlreadyInForm, false);
});

test("the id alone is enough — an owner who left the default label still gets caught", () => {
  const field = custom({ id: "code_immeuble", label: { fr: "Nouveau champ" } });
  const c = detectFieldConflict(field, [field], DELIVERY);
  assert.equal(c?.kind, "shadows_builtin");
});

test("the label alone is enough — an owner who left custom_field_1 as the id still gets caught", () => {
  const field = custom({ id: "custom_field_1", label: { fr: "Code immeuble" } });
  const c = detectFieldConflict(field, [field], DELIVERY);
  assert.equal(c?.kind, "shadows_builtin");
});

test("it says so when the built-in is ALREADY in the form — swapping would duplicate it", () => {
  const field = custom({ id: "code_immeuble", label: { fr: "Code immeuble" } });
  const c = detectFieldConflict(field, [builtin("delivery_entry_code"), field], DELIVERY);
  assert.equal(c?.kind, "shadows_builtin");
  assert.equal(c && "builtinAlreadyInForm" in c && c.builtinAlreadyInForm, true);
});

// ─── Exact match only. This is NOT a keyword heuristic ───────────────────────

test('"Code promo" is not "Code immeuble"', () => {
  const field = custom({ id: "code_promo", label: { fr: "Code promo" } });
  assert.equal(detectFieldConflict(field, [field], DELIVERY), null);
});

test("a synonym the platform does not publish is not matched", () => {
  // Deliberate: guessing that "Digicode" means the same thing is exactly the
  // fragility this rule refuses. A miss is a non-event; a false positive
  // nags the owner about a field that is genuinely theirs.
  const field = custom({ id: "digicode", label: { fr: "Digicode" } });
  assert.equal(detectFieldConflict(field, [field], DELIVERY), null);
});

test("an ordinary custom field is left alone", () => {
  const field = custom({ id: "allergies", label: { fr: "Allergies" } });
  assert.equal(detectFieldConflict(field, [field], DELIVERY), null);
});

// ─── Matching is case, accent, separator and locale insensitive ──────────────

test("case, accents and separators fold", () => {
  assert.equal(normalizeFieldName("Code immeuble"), normalizeFieldName("code_immeuble"));
  assert.equal(normalizeFieldName("CODE-IMMEUBLE"), normalizeFieldName("code immeuble"));
  assert.equal(normalizeFieldName("Étage"), normalizeFieldName("etage"));
});

test("a Hebrew label survives normalisation instead of collapsing to empty", () => {
  // An allow-list of [a-z0-9] would reduce every Hebrew label to "" and make
  // two unrelated Hebrew fields compare equal.
  const he = normalizeFieldName(BUILTIN_LABELS.delivery_entry_code.he);
  assert.ok(he.length > 0);
  assert.notEqual(he, normalizeFieldName(BUILTIN_LABELS.delivery_notes.he));
});

test("a Hebrew label matches its built-in", () => {
  const field = custom({ id: "custom_field_1", label: { he: BUILTIN_LABELS.delivery_entry_code.he } });
  const c = detectFieldConflict(field, [field], DELIVERY);
  assert.equal(c?.kind, "shadows_builtin");
  assert.equal(c && "builtinId" in c && c.builtinId, "delivery_entry_code");
});

test("an English label matches its built-in", () => {
  const field = custom({ id: "custom_field_1", label: { en: "Building code" } });
  const c = detectFieldConflict(field, [field], DELIVERY);
  assert.equal(c && "builtinId" in c && c.builtinId, "delivery_entry_code");
});

test("a field with no label and a meaningless id is not matched against anything", () => {
  const field = custom({ id: "custom_field_1" });
  assert.equal(detectFieldConflict(field, [field], DELIVERY), null);
});

// ─── Reserved ids ────────────────────────────────────────────────────────────

test("a custom field wearing a built-in id is reserved_id, not shadows_builtin", () => {
  // This one silently WORKS — foodyweb routes by id, so the answer reaches the
  // typed column — but the editor labels it "personnalisé" and the owner has
  // no way to know. Different message, so a different conflict kind.
  const field = custom({ id: "delivery_entry_code", label: { fr: "Code immeuble" } });
  const c = detectFieldConflict(field, [field], DELIVERY);
  assert.equal(c?.kind, "reserved_id");
  assert.equal(c && "builtinId" in c && c.builtinId, "delivery_entry_code");
});

test("a duplicate id outranks everything else — it breaks the payload outright", () => {
  const a = builtin("delivery_entry_code");
  const b = custom({ id: "delivery_entry_code", label: { fr: "Code immeuble" } });
  assert.equal(detectFieldConflict(b, [a, b], DELIVERY)?.kind, "duplicate_id");
});

test("built-in fields are never flagged — they cannot be misdeclared", () => {
  const f = builtin("delivery_entry_code");
  assert.equal(detectFieldConflict(f, [f], DELIVERY), null);
});

// ─── Scoped to the order type ────────────────────────────────────────────────

test("a delivery built-in is not suggested on a pickup form", () => {
  const field = custom({ id: "code_immeuble", label: { fr: "Code immeuble" } });
  assert.equal(detectFieldConflict(field, [field], PICKUP), null);
});

test('a custom "Notes" on a pickup form is caught by pickup_notes', () => {
  const field = custom({ id: "notes", label: { fr: "Notes" } });
  const c = detectFieldConflict(field, [field], PICKUP);
  assert.equal(c && "builtinId" in c && c.builtinId, "pickup_notes");
});

// ─── The swap ────────────────────────────────────────────────────────────────

test("the swap keeps the owner's form decisions and drops their one-language label", () => {
  const field = custom({
    id: "code_immeuble",
    label: { fr: "Code immeuble" },
    placeholder: { fr: "Ex. 4417B" },
    required: true,
    enabled: false,
    type: "text",
  });
  const next = asBuiltinField(field, "delivery_entry_code");

  assert.equal(next.id, "delivery_entry_code");
  assert.equal(next.kind, "builtin");
  assert.equal(next.required, true);
  assert.equal(next.enabled, false);
  // Dropped so foodyweb's own en/he/fr defaults apply. Keeping an fr-only
  // label would show French to a Hebrew customer forever.
  assert.equal(next.label, undefined);
});

test("the swap carries the visibility rule across", () => {
  const rule = { field: "delivery_city", operator: "not_empty" as const };
  const next = asBuiltinField(custom({ visible_when: rule }), "delivery_entry_code");
  assert.deepEqual(next.visible_when, rule);
});

test("the swapped field no longer conflicts", () => {
  const field = custom({ id: "code_immeuble", label: { fr: "Code immeuble" } });
  const next = asBuiltinField(field, "delivery_entry_code");
  assert.equal(detectFieldConflict(next, [next], DELIVERY), null);
});
