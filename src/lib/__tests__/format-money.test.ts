import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney } from "@/lib/format-money";

// The migration contract: for every value the printed ticket can pass (finite,
// non-negative, or null), formatMoney must be byte-identical to the private
// money() it replaces — `'₪' + (n ?? 0).toFixed(2)`. print-ticket.ts only ever
// passes line totals, combo prices, subtotal, delivery fee and the grand total,
// none of which can be negative, so this equivalence covers the whole surface.
const legacyTicketMoney = (n: number | null | undefined): string => "₪" + (n ?? 0).toFixed(2);

test("matches the printed ticket's legacy formatter for every value it can pass", () => {
  const values = [0, 0.5, 1, 3.5, 12.34, 25, 35, 99.99, 100, 505, 1234.5, 99999.999, null, undefined];
  for (const v of values) {
    assert.equal(
      formatMoney(v),
      legacyTicketMoney(v),
      `formatMoney(${String(v)}) must equal the legacy ticket output`,
    );
  }
});

test("defaults to two decimals and the shekel symbol", () => {
  assert.equal(formatMoney(120), "₪120.00");
  assert.equal(formatMoney(0), "₪0.00");
  assert.equal(formatMoney(1234.5), "₪1234.50");
});

test("renders negatives with a real minus sign before the symbol", () => {
  assert.equal(formatMoney(-12), "−₪12.00");
  assert.equal(formatMoney(-0.5), "−₪0.50");
  // U+2212, not the hyphen-minus U+002D.
  assert.ok(formatMoney(-12).startsWith("−"));
  assert.ok(!formatMoney(-12).includes("-"));
});

test("signed shows a plus on positives and nothing on zero", () => {
  assert.equal(formatMoney(3.5, { signed: true }), "+₪3.50");
  assert.equal(formatMoney(-3.5, { signed: true }), "−₪3.50");
  assert.equal(formatMoney(0, { signed: true }), "₪0.00");
});

test("a value that rounds to zero never renders a sign", () => {
  // The bug this guards: Math.abs(-0.004).toFixed(2) is "0.00", so a naive
  // `n < 0` check would render "−₪0.00".
  assert.equal(formatMoney(-0.004), "₪0.00");
  assert.equal(formatMoney(-0.004, { signed: true }), "₪0.00");
  assert.equal(formatMoney(0.004, { signed: true }), "₪0.00");
});

test("decimals: 0 matches the orders table cell", () => {
  assert.equal(formatMoney(505, { decimals: 0 }), "₪505");
  assert.equal(formatMoney(505.4, { decimals: 0 }), "₪505");
  assert.equal(formatMoney(505.6, { decimals: 0 }), "₪506");
  assert.equal(formatMoney(null, { decimals: 0 }), "₪0");
});

test("non-finite input renders as zero rather than ₪NaN", () => {
  // A deliberate improvement on the legacy helper, which produced "₪NaN".
  assert.equal(formatMoney(NaN), "₪0.00");
  assert.equal(formatMoney(Infinity), "₪0.00");
  assert.equal(formatMoney(-Infinity), "₪0.00");
});

test("currency is overridable without touching call sites", () => {
  assert.equal(formatMoney(12, { currency: "€" }), "€12.00");
  assert.equal(formatMoney(-12, { currency: "€" }), "−€12.00");
});
