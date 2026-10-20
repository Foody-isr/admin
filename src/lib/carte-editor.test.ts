import { test } from "node:test";
import assert from "node:assert/strict";
import { stockLimit, stockErrors, moveEntry } from "./carte-editor";
import type { SaleStockRow } from "./api";
const row = {
  item: { id: 1, availability_override: "auto" },
  managed: true,
  config: {
    revision: 4,
    override: "auto",
    counters: [{ option_id: 0, initial_quantity: 30, committed: 8 }],
    mode: "count",
    unit: "",
  },
  previous: {
    revision: 1,
    override: "force_sold_out",
    counters: [{ option_id: 0, initial_quantity: 20, committed: 18 }],
    mode: "count",
    unit: "",
  },
  sizes: [],
  availability: { availability_state: "available", buildable_count: 22 },
} as unknown as SaleStockRow;
test("copying a series uses initial capacity and retains current operational override and revision", () => {
  const copied = stockLimit(row, row.previous);
  assert.equal(copied.quantity, 20);
  assert.equal(copied.expected_revision, 4);
  assert.equal(copied.override, "auto");
  assert.equal(stockErrors(copied, row), false);
});
test("a prepared allowance cannot erase commitments or accept fractions", () => {
  assert.equal(stockErrors({ ...stockLimit(row), quantity: 7 }, row), true);
  assert.equal(stockErrors({ ...stockLimit(row), quantity: 8 }, row), false);
  assert.equal(stockErrors({ ...stockLimit(row), quantity: 8.2 }, row), true);
  assert.equal(
    stockErrors({ ...stockLimit(row), mode: "", quantity: null }, row),
    false,
  );
});
test("moving groups does not mutate saved draft state", () => {
  const saved = ["a", "b"];
  assert.deepEqual(moveEntry(saved, 0, 1), ["b", "a"]);
  assert.deepEqual(saved, ["a", "b"]);
  assert.deepEqual(moveEntry(saved, 0, -1), saved);
});
