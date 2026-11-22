import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const newOrderPage = readFileSync(
  join(process.cwd(), "src", "app", "[restaurantId]", "orders", "new", "page.tsx"),
  "utf8",
);

test("manual order creation loads staff-visible séries for checkout and rotating cartes", () => {
  assert.match(newOrderPage, /getStaffBatchFulfillmentConfig\(restaurantId\)/);
  assert.match(newOrderPage, /getMenu\(restaurantId, currentDay\)/);
  assert.match(newOrderPage, /getMenu\(restaurantId, alternateDay\)/);
  assert.match(newOrderPage, /batchConfig=\{fulfillmentBatchConfig\}/);
  assert.doesNotMatch(
    newOrderPage,
    /getBatchFulfillmentConfig/,
    "the internal creation page must not use the customer-facing series config",
  );
});
