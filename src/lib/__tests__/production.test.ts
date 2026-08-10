import assert from "node:assert/strict";
import { test } from "node:test";
import {
  itemTotalValue,
  orderQtyValue,
  productionBoxes,
  showsUnits,
} from "../production";
import type {
  ProductionSheetItem,
  ProductionSheetOrder,
  ProductionSheetPortion,
} from "../../lib/api";

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

function order(portions: ProductionSheetPortion[] | undefined): ProductionSheetOrder {
  return {
    order_id: 1,
    customer_name: "Ouriel",
    order_type: "pickup",
    cells: {},
    portions: portions ? { "1": portions } : undefined,
  };
}

test("auto mode counts the containers ordered, not the summed cell", () => {
  // Two clients took 2 pots of 250 g each, five took one: 9 × 250 g. Reading
  // their 500 g cells as containers would wrongly report 2×500 · 5×250.
  const orders = [
    order([{ portion_g: 250, count: 2 }]),
    order([{ portion_g: 250, count: 2 }]),
    ...Array.from({ length: 5 }, () => order([{ portion_g: 250, count: 1 }])),
  ];
  assert.deepEqual(productionBoxes(orders, item({ total: 2250 }), null, []), [
    { portion: 250, count: 9 },
  ]);
});

test("auto mode tallies mixed portion sizes, largest box first", () => {
  const orders = [
    order([{ portion_g: 250, count: 5 }]),
    order([{ portion_g: 500, count: 1 }]),
  ];
  assert.deepEqual(productionBoxes(orders, item({ total: 1750 }), null, []), [
    { portion: 500, count: 1 },
    { portion: 250, count: 5 },
  ]);
});

test("auto mode rescopes to the orders it is given", () => {
  const orders = [order([{ portion_g: 250, count: 2 }])];
  assert.deepEqual(productionBoxes(orders, item({ total: 500 }), null, []), [
    { portion: 250, count: 2 },
  ]);
});

test("auto mode falls back to the day aggregate when rows carry no portions", () => {
  const orders = [order(undefined)];
  const day = item({ total: 750, packaging: [{ portion_g: 250, count: 3 }] });
  assert.deepEqual(productionBoxes(orders, day, null, []), [{ portion: 250, count: 3 }]);
});

test("a chosen box size repacks the column total instead", () => {
  const orders = [order([{ portion_g: 250, count: 9 }])];
  assert.deepEqual(productionBoxes(orders, item({ total: 2250 }), 500, [250, 500]), [
    { portion: 500, count: 4 },
    { portion: 250, count: 1 },
  ]);
});

test("counted items have no packaging chips", () => {
  const orders = [order([{ portion_g: 250, count: 2 }])];
  assert.deepEqual(productionBoxes(orders, item({ measure: "unit", total: 3 }), null, []), []);
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
  assert.equal(itemTotalValue(it, ids(7)), 6);
  assert.equal(itemTotalValue(it, undefined), 3000);
});

test("a sheet served before total_units existed reads 0 containers, never grams", () => {
  // Falling through to `total` here would print 3 000 next to a "u." suffix.
  const it = item({ menu_item_id: 7, total: 3000, total_units: undefined });
  assert.equal(itemTotalValue(it, ids(7)), 0);
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
  assert.equal(orderQtyValue(o, it, ids(7)), 2);
  assert.equal(orderQtyValue(o, it, undefined), 500);
});

test("a client with no line for the article reads 0 in either mode", () => {
  const it = item({ menu_item_id: 7 });
  const o: ProductionSheetOrder = {
    order_id: 1,
    customer_name: "Ouriel",
    order_type: "pickup",
    cells: {},
  };
  assert.equal(orderQtyValue(o, it, ids(7)), 0);
  assert.equal(orderQtyValue(o, it, undefined), 0);
});
