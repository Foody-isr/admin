import assert from "node:assert/strict";
import test from "node:test";
import type { StockItem } from "@/lib/api";
import {
  buildOrderUnitOptions,
  orderQuantityInBase,
  preferredOrderUnit,
} from "./order-units";

function stockItem(overrides: Partial<StockItem>): StockItem {
  return {
    id: 1,
    restaurant_id: 1,
    name: "Tomato",
    unit: "kg",
    quantity: 3,
    reorder_threshold: 1,
    cost_per_unit: 7,
    supplier: "Moshe",
    category: "Produce",
    notes: "",
    pack_size: 0,
    container_type: "",
    unit_type: "",
    price_includes_vat: false,
    vat_rate_override: 0,
    image_url: "",
    sku: "",
    is_active: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

test("offers standard, custom and saved packaging units", () => {
  const item = stockItem({
    unit_conversions: [
      {
        id: 1,
        stock_item_id: 1,
        custom_unit_id: 1,
        base_quantity: 0.125,
        custom_unit: {
          id: 1,
          restaurant_id: 1,
          name: "unit",
          abbreviation: "u",
          created_at: "",
          updated_at: "",
        },
      },
    ],
  });
  const options = buildOrderUnitOptions(item, {
    packagingSet: true,
    unitsPerPack: 0,
    unitSize: 5,
    unitSizeUnit: "kg",
    containerType: "crate",
    unitType: "",
  });

  assert.deepEqual(
    options.map((option) => option.value),
    ["kg", "g", "unit", "crate"],
  );
  assert.equal(orderQuantityInBase(8, "unit", options), 1);
  assert.equal(orderQuantityInBase(2, "crate", options), 10);
});

test("uses the chef preference only while that unit remains available", () => {
  const item = stockItem({ unit: "g" });
  const options = buildOrderUnitOptions(item, {
    packagingSet: true,
    unitsPerPack: 0,
    unitSize: 80,
    unitSizeUnit: "g",
    containerType: "pack",
    unitType: "",
  });

  assert.equal(preferredOrderUnit("g", options), "g");
  assert.equal(preferredOrderUnit("old-pack", options), "pack");
  assert.equal(orderQuantityInBase(5, "pack", options), 400);
});
