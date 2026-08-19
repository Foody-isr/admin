import assert from "node:assert/strict";
import { test } from "node:test";
import { formatGrams, formatPricePerKg, weightDrift } from "@/lib/orders/format-weight";

test("shows grams below a kilo and kilos at or above", () => {
  assert.equal(formatGrams(620), "620 g");
  assert.equal(formatGrams(999), "999 g");
  assert.equal(formatGrams(1000), "1 kg");
  assert.equal(formatGrams(1240), "1.24 kg");
  assert.equal(formatGrams(2000), "2 kg");
  assert.equal(formatGrams(0), "0 g");
});

test("rounds grams to a whole number and kilos to two places", () => {
  assert.equal(formatGrams(620.4), "620 g");
  assert.equal(formatGrams(620.6), "621 g");
  assert.equal(formatGrams(1236), "1.24 kg");
});

test("returns null for absent or non-finite weights so callers can skip the row", () => {
  assert.equal(formatGrams(null), null);
  assert.equal(formatGrams(undefined), null);
  assert.equal(formatGrams(NaN), null);
});

test("per-kilo price goes through formatMoney", () => {
  assert.equal(formatPricePerKg(89), "₪89.00/kg");
  assert.equal(formatPricePerKg(12.5), "₪12.50/kg");
});

test("no per-kilo price for zero, negative or absent input", () => {
  assert.equal(formatPricePerKg(0), null);
  assert.equal(formatPricePerKg(-5), null);
  assert.equal(formatPricePerKg(null), null);
  assert.equal(formatPricePerKg(undefined), null);
});

test("drift reports the signed gram gap and whether it crosses the threshold", () => {
  const heavier = weightDrift(600, 640);
  assert.equal(heavier?.grams, 40);
  assert.ok(Math.abs((heavier?.ratio ?? 0) - 40 / 600) < 1e-9);
  assert.equal(heavier?.significant, true); // 6.7% > 5%

  const lighter = weightDrift(600, 580);
  assert.equal(lighter?.grams, -20);
  assert.equal(lighter?.significant, false); // 3.3% < 5%
});

test("drift is exactly at the threshold, not over it", () => {
  // 5% of 600 is 30 g. The threshold is exclusive, so 30 g is not significant.
  assert.equal(weightDrift(600, 630)?.significant, false);
  assert.equal(weightDrift(600, 631)?.significant, true);
});

test("drift threshold is overridable", () => {
  assert.equal(weightDrift(600, 620, 0.01)?.significant, true);
  assert.equal(weightDrift(600, 620, 0.5)?.significant, false);
});

test("no drift without both figures, or when the estimate is zero", () => {
  assert.equal(weightDrift(null, 640), null);
  assert.equal(weightDrift(600, null), null);
  assert.equal(weightDrift(600, undefined), null);
  // A zero estimate would make the ratio meaningless rather than infinite.
  assert.equal(weightDrift(0, 640), null);
});
