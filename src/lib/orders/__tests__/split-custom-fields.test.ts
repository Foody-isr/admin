import assert from "node:assert/strict";
import { test } from "node:test";
import { splitCustomFieldAnswers } from "@/lib/orders/checkout-fields";
import type { Order } from "@/lib/api";

// The order screen puts custom checkout answers in one of two blocks. Getting
// this wrong is not cosmetic: a building code filed under the customer's name
// is four rows above the address it describes, which is where staff and
// customers both look for it.

type Fields = NonNullable<Order["custom_fields"]>;

function order(order_type: string, custom_fields: Fields): Pick<Order, "order_type" | "custom_fields"> {
  return { order_type, custom_fields } as Pick<Order, "order_type" | "custom_fields">;
}

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

// ─── The case this was built for ─────────────────────────────────────────────

test("a hand-rolled code_immeuble is filed with the address", () => {
  const { address, customer } = splitCustomFieldAnswers(
    order("delivery", { code_immeuble: "4417B" }),
    { code_immeuble: "Code immeuble" },
  );
  assert.deepEqual(ids(address), ["code_immeuble"]);
  assert.deepEqual(ids(customer), []);
  assert.equal(address[0].label, "Code immeuble");
  assert.equal(address[0].value, "4417B");
});

test("the id alone places it, even with an unhelpful label", () => {
  const { address } = splitCustomFieldAnswers(
    order("delivery", { code_immeuble: "4417B" }),
    { code_immeuble: "Nouveau champ" },
  );
  assert.deepEqual(ids(address), ["code_immeuble"]);
});

test("the label alone places it, even with a generated id", () => {
  const { address } = splitCustomFieldAnswers(
    order("delivery", { custom_field_1: "4417B" }),
    { custom_field_1: "Code immeuble" },
  );
  assert.deepEqual(ids(address), ["custom_field_1"]);
});

test("with no label map at all, the humanized id still places it", () => {
  // A failed checkout-config fetch leaves labels empty. The answer must still
  // land in the right block, labelled from its id.
  const { address } = splitCustomFieldAnswers(order("delivery", { code_immeuble: "4417B" }), {});
  assert.deepEqual(ids(address), ["code_immeuble"]);
  assert.equal(address[0].label, "Code Immeuble");
});

// ─── What must NOT move ──────────────────────────────────────────────────────

test("an answer about the customer stays with the customer", () => {
  const { address, customer } = splitCustomFieldAnswers(
    order("delivery", { allergies: "arachides", code_promo: "ETE10" }),
    { allergies: "Allergies", code_promo: "Code promo" },
  );
  assert.deepEqual(ids(address), []);
  assert.deepEqual(ids(customer), ["allergies", "code_promo"]);
});

test("the customer's own built-in fields are not treated as address fields", () => {
  // customer_name and customer_phone are in BUILTIN_DELIVERY_FIELDS, so a
  // naive "is it a delivery built-in" test would file the customer's name
  // under the address.
  const { address, customer } = splitCustomFieldAnswers(
    order("delivery", { nom_complet: "Yael" }),
    { nom_complet: "Nom complet" },
  );
  assert.deepEqual(ids(address), []);
  assert.deepEqual(ids(customer), ["nom_complet"]);
});

test("a delivery-ish field with no built-in equivalent stays put", () => {
  // A deliberate miss. Guessing that "Interphone" means the entry code is the
  // same guesswork that would file "Code promo" under the address.
  const { address, customer } = splitCustomFieldAnswers(
    order("delivery", { interphone: "B12" }),
    { interphone: "Interphone" },
  );
  assert.deepEqual(ids(address), []);
  assert.deepEqual(ids(customer), ["interphone"]);
});

// ─── Order type ──────────────────────────────────────────────────────────────

test("nothing moves on a pickup order — there is no address block to move into", () => {
  const { address, customer } = splitCustomFieldAnswers(
    order("pickup", { code_immeuble: "4417B" }),
    { code_immeuble: "Code immeuble" },
  );
  assert.deepEqual(ids(address), []);
  assert.deepEqual(ids(customer), ["code_immeuble"]);
});

test("nothing moves on a dine-in order either", () => {
  const { address, customer } = splitCustomFieldAnswers(
    order("dine_in", { code_immeuble: "4417B" }),
    { code_immeuble: "Code immeuble" },
  );
  assert.deepEqual(ids(address), []);
  assert.deepEqual(ids(customer), ["code_immeuble"]);
});

// ─── Values and emptiness ────────────────────────────────────────────────────

test("empty, false and null answers are dropped from both blocks", () => {
  const { address, customer } = splitCustomFieldAnswers(
    order("delivery", {
      code_immeuble: "",
      allergies: "",
      cadeau: false,
      note: null as unknown as string,
    }),
    {},
  );
  assert.deepEqual(address, []);
  assert.deepEqual(customer, []);
});

test("a ticked checkbox renders as a mark, not as \"true\"", () => {
  const { customer } = splitCustomFieldAnswers(
    order("delivery", { cadeau: true }),
    { cadeau: "Emballage cadeau" },
  );
  assert.equal(customer[0].value, "✓");
});

test("a numeric answer survives as text", () => {
  const { customer } = splitCustomFieldAnswers(
    order("delivery", { convives: 4 as unknown as string }),
    { convives: "Nombre de convives" },
  );
  assert.equal(customer[0].value, "4");
});

test("an order with no custom fields yields two empty blocks", () => {
  const { address, customer } = splitCustomFieldAnswers(
    { order_type: "delivery" } as Pick<Order, "order_type" | "custom_fields">,
    {},
  );
  assert.deepEqual(address, []);
  assert.deepEqual(customer, []);
});

// ─── The partition is total ──────────────────────────────────────────────────

test("every answer lands in exactly one block, never both, never neither", () => {
  const fields: Fields = {
    code_immeuble: "4417B",
    etage: "7",
    allergies: "arachides",
    interphone: "B12",
    notes_livraison: "sonner fort",
  };
  const labels = {
    code_immeuble: "Code immeuble",
    etage: "Étage",
    allergies: "Allergies",
    interphone: "Interphone",
    notes_livraison: "Notes de livraison",
  };
  const { address, customer } = splitCustomFieldAnswers(order("delivery", fields), labels);

  const seen = [...ids(address), ...ids(customer)].sort();
  assert.deepEqual(seen, Object.keys(fields).sort());
  // Accents fold, so "Étage" finds delivery_floor.
  assert.deepEqual(ids(address).sort(), ["code_immeuble", "etage", "notes_livraison"]);
  assert.deepEqual(ids(customer).sort(), ["allergies", "interphone"]);
});
