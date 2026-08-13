import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveColumns,
  visibleColumns,
  hasCustomLayout,
  type ColumnSpec,
} from "../orders/column-layout";

const COLS: ColumnSpec[] = [
  { key: "order_no", defaultVisible: true },
  { key: "customer", defaultVisible: true, mobilePrimary: true },
  { key: "date", defaultVisible: true },
  { key: "city", defaultVisible: false },
];

const keys = (cs: { key: string }[]) => cs.map((c) => c.key);

test("an uncustomised restaurant gets exactly the built-in default layout", () => {
  const resolved = resolveColumns(COLS, null);
  assert.deepEqual(keys(resolved), ["order_no", "customer", "date", "city"]);
  assert.deepEqual(
    resolved.map((c) => c.visible),
    [true, true, true, false],
  );
});

test("an explicit toggle overrides the default in both directions", () => {
  const resolved = resolveColumns(COLS, {
    order: [],
    visible: { date: false, city: true },
  });
  const byKey = Object.fromEntries(resolved.map((c) => [c.key, c.visible]));
  assert.equal(byKey.date, false);
  assert.equal(byKey.city, true);
  assert.equal(byKey.order_no, true);
});

test("a saved arrangement is applied", () => {
  const resolved = resolveColumns(COLS, {
    order: ["city", "customer", "order_no", "date"],
    visible: {},
  });
  assert.deepEqual(keys(resolved), ["city", "customer", "order_no", "date"]);
});

// The multi-tenant safety property: shipping a new column must not make it
// vanish for the restaurants that already saved a layout.
test("a column the saved layout predates still appears, with its own default", () => {
  const saved = { order: ["date", "customer", "order_no"], visible: { date: false } };
  const withNewColumn: ColumnSpec[] = [...COLS, { key: "courier", defaultVisible: false }];
  const resolved = resolveColumns(withNewColumn, saved);
  assert.ok(keys(resolved).includes("courier"));
  assert.equal(resolved.find((c) => c.key === "courier")!.visible, false);
});

test("a saved layout referencing a removed column ignores it", () => {
  const resolved = resolveColumns(COLS, { order: ["gone", "city"], visible: { gone: true } });
  assert.deepEqual(keys(resolved), ["city", "order_no", "customer", "date"]);
});

test("visibleColumns drops the hidden ones", () => {
  const shown = visibleColumns(COLS, { order: [], visible: { date: false, city: true } });
  assert.deepEqual(keys(shown), ["order_no", "customer", "city"]);
});

test("the opted-in column heads the mobile card", () => {
  const shown = visibleColumns(COLS, null);
  assert.deepEqual(
    shown.filter((c) => c.isMobilePrimary).map((c) => c.key),
    ["customer"],
  );
});

// Without a fallback, hiding the name column would leave every mobile card
// without a heading.
test("the leading visible column heads the card when the opted-in one is hidden", () => {
  const shown = visibleColumns(COLS, { order: [], visible: { customer: false } });
  assert.deepEqual(
    shown.filter((c) => c.isMobilePrimary).map((c) => c.key),
    ["order_no"],
  );
});

test("exactly one column ever heads the card", () => {
  const twoPrimaries: ColumnSpec[] = [
    { key: "a", defaultVisible: true, mobilePrimary: true },
    { key: "b", defaultVisible: true, mobilePrimary: true },
  ];
  assert.equal(visibleColumns(twoPrimaries, null).filter((c) => c.isMobilePrimary).length, 1);
});

test("hiding every column yields an empty table rather than a crash", () => {
  const shown = visibleColumns(COLS, {
    order: [],
    visible: { order_no: false, customer: false, date: false, city: false },
  });
  assert.deepEqual(shown, []);
});

test("hasCustomLayout distinguishes an untouched restaurant from a customised one", () => {
  assert.equal(hasCustomLayout(null), false);
  assert.equal(hasCustomLayout({ order: [], visible: {} }), false);
  assert.equal(hasCustomLayout({ order: ["city"], visible: {} }), true);
  assert.equal(hasCustomLayout({ order: [], visible: { date: false } }), true);
});
