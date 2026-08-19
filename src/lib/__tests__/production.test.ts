import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PORTIONING,
  makePortioner,
  needsBoxDetail,
  showsUnits,
} from "../production";
import type {
  ProductionPortioning,
  ProductionSheetItem,
  ProductionSheetOrder,
  ProductionSheetPortion,
} from "../../lib/api";

const ORDERED: ProductionPortioning = { mode: "ordered" };
const PACKED: ProductionPortioning = { mode: "packed" };

function item(over: Partial<ProductionSheetItem> = {}): ProductionSheetItem {
  return {
    menu_item_id: 1,
    name: "Patate Douce",
    category_id: 1,
    measure: "weight",
    total: 0,
    unit: "g",
    ...over,
  };
}

function order(
  portions: ProductionSheetPortion[] | undefined,
  cells?: Record<string, number>,
): ProductionSheetOrder {
  const grams = (portions ?? []).reduce((n, p) => n + p.portion_g * p.count, 0);
  return {
    order_id: 1,
    customer_name: "Ouriel",
    order_type: "pickup",
    cells: cells ?? { "1": grams },
    portions: portions ? { "1": portions } : undefined,
  };
}

// Portions available per article, as the page derives them from the size
// options plus whatever portions the day's orders actually used.
const SALAD_PORTIONS = { 1: [250, 500] };

function ordered(available: Record<number, number[]> = SALAD_PORTIONS) {
  return makePortioner(ORDERED, available);
}
function packed(
  rule: ProductionPortioning = PACKED,
  available: Record<number, number[]> = SALAD_PORTIONS,
) {
  return makePortioner(rule, available);
}

// --- The ordered rule: report the containers clients actually took -----------

test("ordered counts the containers ordered, not the summed cell", () => {
  // Two clients took 2 pots of 250 g each, five took one: 9 × 250 g. Reading
  // their 500 g cells as containers would wrongly report 2×500 · 5×250.
  const orders = [
    order([{ portion_g: 250, count: 2 }]),
    order([{ portion_g: 250, count: 2 }]),
    ...Array.from({ length: 5 }, () => order([{ portion_g: 250, count: 1 }])),
  ];
  assert.deepEqual(ordered().columnBoxes(orders, item({ total: 2250 })), [
    { portion: 250, count: 9 },
  ]);
});

test("ordered tallies mixed portion sizes, largest box first", () => {
  const orders = [
    order([{ portion_g: 250, count: 5 }]),
    order([{ portion_g: 500, count: 1 }]),
  ];
  assert.deepEqual(ordered().columnBoxes(orders, item({ total: 1750 })), [
    { portion: 500, count: 1 },
    { portion: 250, count: 5 },
  ]);
});

test("ordered rescopes to the orders it is given", () => {
  const orders = [order([{ portion_g: 250, count: 2 }])];
  assert.deepEqual(ordered().columnBoxes(orders, item({ total: 500 })), [
    { portion: 250, count: 2 },
  ]);
});

test("ordered falls back to the day aggregate when rows carry no portions", () => {
  const orders = [order(undefined, { "1": 750 })];
  const day = item({ total: 750, packaging: [{ portion_g: 250, count: 3 }] });
  assert.deepEqual(ordered().columnBoxes(orders, day), [{ portion: 250, count: 3 }]);
});

test("counted items have no packaging chips under either rule", () => {
  const orders = [order([{ portion_g: 250, count: 2 }])];
  const counted = item({ measure: "unit", total: 3 });
  assert.deepEqual(ordered().columnBoxes(orders, counted), []);
  assert.deepEqual(packed().columnBoxes(orders, counted), []);
  assert.deepEqual(packed().cellBoxes(orders[0], counted), []);
});

// --- The packed rule: fewest boxes, per client ------------------------------

test("packed repacks one client's grams into the fewest boxes", () => {
  // The complaint that started this: 750 g taken as three 250 g pots should be
  // fillable as one 500 g box plus one 250 g box.
  const o = order([{ portion_g: 250, count: 3 }]);
  assert.deepEqual(packed().cellBoxes(o, item({ total: 750 })), [
    { portion: 500, count: 1 },
    { portion: 250, count: 1 },
  ]);
});

test("packed caps the repack at the box size the restaurant chose", () => {
  const o = order([{ portion_g: 250, count: 3 }]);
  const rule: ProductionPortioning = { mode: "packed", max_box: 250 };
  assert.deepEqual(packed(rule).cellBoxes(o, item({ total: 750 })), [
    { portion: 250, count: 3 },
  ]);
});

test("packed never merges boxes across clients", () => {
  // Two clients at 250 g each are two 250 g pots, never one shared 500 g box:
  // boxes are filled per order, so a recap repacked from the day's 500 g total
  // would promise a container no client can receive.
  const orders = [
    order([{ portion_g: 250, count: 1 }]),
    order([{ portion_g: 250, count: 1 }]),
  ];
  assert.deepEqual(packed().columnBoxes(orders, item({ total: 500 })), [
    { portion: 250, count: 2 },
  ]);
});

test("packed column recap is the sum of the per-client repacks", () => {
  // One client at 750 g (1×500 + 1×250) and one at 500 g (1×500) => 2×500 · 1×250,
  // which adds back to the 1 250 g the column shows.
  const orders = [
    order([{ portion_g: 250, count: 3 }]),
    order([{ portion_g: 250, count: 2 }]),
  ];
  const boxes = packed().columnBoxes(orders, item({ total: 1250 }));
  assert.deepEqual(boxes, [
    { portion: 500, count: 2 },
    { portion: 250, count: 1 },
  ]);
  assert.equal(
    boxes.reduce((g, b) => g + b.portion * b.count, 0),
    1250,
  );
});

test("packed keeps the ordered containers when the article has no known portions", () => {
  // Nothing to repack into: inventing a box size the kitchen never sells would
  // be worse than reporting what was ordered.
  const o = order([{ portion_g: 250, count: 3 }]);
  assert.deepEqual(packed(PACKED, {}).cellBoxes(o, item({ total: 750 })), [
    { portion: 250, count: 3 },
  ]);
});

test("packed leaves an indivisible remainder as its own box", () => {
  const o = order([{ portion_g: 300, count: 1 }], { "1": 300 });
  assert.deepEqual(packed().cellBoxes(o, item({ total: 300 })), [
    { portion: 250, count: 1 },
    { portion: 50, count: 1 },
  ]);
});

test("a client with no line for the article gets no boxes", () => {
  const o: ProductionSheetOrder = {
    order_id: 1,
    customer_name: "Ouriel",
    order_type: "pickup",
    cells: {},
  };
  assert.deepEqual(packed().cellBoxes(o, item()), []);
  assert.deepEqual(ordered().cellBoxes(o, item()), []);
});

// --- The per-cell detail line ----------------------------------------------

test("a breakdown is only shown when it says more than the number above it", () => {
  assert.equal(needsBoxDetail([]), false);
  // One 500 g pot: the cell already reads 500.
  assert.equal(needsBoxDetail([{ portion: 500, count: 1 }]), false);
  // Two 250 g pots reading as "500" is exactly the ambiguity worth printing.
  assert.equal(needsBoxDetail([{ portion: 250, count: 2 }]), true);
  assert.equal(
    needsBoxDetail([
      { portion: 500, count: 1 },
      { portion: 250, count: 1 },
    ]),
    true,
  );
});

// --- Portions / units display, shared by the desktop matrix and the phone ---
// The preference used to live only in ProductionMatrix, so a weighed article
// flipped to "Unités" read as container counts on desktop and as grams on a
// phone — same sheet, same day, two portionings. These pin the decision itself.

function ids(...v: number[]): Set<number> {
  return new Set(v);
}

test("a weighed article follows the units preference; a counted one ignores it", () => {
  const weighed = item({ menu_item_id: 7, measure: "weight" });
  const counted = item({ menu_item_id: 8, measure: "unit" });
  assert.equal(showsUnits(weighed, ids(7)), true);
  assert.equal(showsUnits(weighed, ids(9)), false);
  assert.equal(showsUnits(weighed, undefined), false);
  // Counted articles already count; the preference must not touch them.
  assert.equal(showsUnits(counted, ids(8)), false);
});

test("the day total switches to ordered containers under the units preference", () => {
  const it = item({ menu_item_id: 7, total: 3000, total_units: 6 });
  assert.equal(ordered().totalValue([], it, ids(7)), 6);
  assert.equal(ordered().totalValue([], it, undefined), 3000);
});

test("a sheet served before total_units existed reads 0 containers, never grams", () => {
  // Falling through to `total` here would print 3 000 next to a "u." suffix.
  const it = item({ menu_item_id: 7, total: 3000, total_units: undefined });
  assert.equal(ordered().totalValue([], it, ids(7)), 0);
});

test("units display counts the packed boxes, not the pots ordered", () => {
  // Otherwise a repacked sheet would show "3 u." above a "1×500 · 1×250" recap.
  const it = item({ total: 750, total_units: 3 });
  const orders = [order([{ portion_g: 250, count: 3 }])];
  assert.equal(packed().totalValue(orders, it, ids(1)), 2);
  assert.equal(packed().qtyValue(orders[0], it, ids(1)), 2);
  // The ordered rule keeps counting the pots the client asked for.
  assert.equal(ordered().totalValue(orders, it, ids(1)), 3);
});

test("one client's quantity switches to containers under the same preference", () => {
  const it = item({ menu_item_id: 7, total: 3000, total_units: 6 });
  const o: ProductionSheetOrder = {
    order_id: 1,
    customer_name: "Ouriel",
    order_type: "pickup",
    cells: { "7": 500 },
    units: { "7": 2 },
  };
  assert.equal(ordered().qtyValue(o, it, ids(7)), 2);
  assert.equal(ordered().qtyValue(o, it, undefined), 500);
});

test("a client with no line for the article reads 0 in either mode", () => {
  const it = item({ menu_item_id: 7 });
  const o: ProductionSheetOrder = {
    order_id: 1,
    customer_name: "Ouriel",
    order_type: "pickup",
    cells: {},
  };
  assert.equal(ordered().qtyValue(o, it, ids(7)), 0);
  assert.equal(ordered().qtyValue(o, it, undefined), 0);
});

test("the shipped default is the ordered rule", () => {
  assert.equal(DEFAULT_PORTIONING.mode, "ordered");
});
