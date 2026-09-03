import test from "node:test";
import assert from "node:assert/strict";
import { websiteManagementMode } from "../chain-mode";
import type { ChainOverview } from "@/lib/api";

function overview(primaryRestaurantId?: number): ChainOverview {
  return {
    chain_id: 1,
    chain_name: "Moulin Dorée",
    primary_restaurant_id: primaryRestaurantId,
    public_enabled: true,
    branches: [],
  };
}

test("the primary restaurant keeps the full website builder", () => {
  assert.deepEqual(websiteManagementMode(24, overview(24)), { kind: "global" });
  assert.deepEqual(websiteManagementMode(24, null), { kind: "global" });
});

test("a secondary branch receives the local presence editor", () => {
  assert.deepEqual(websiteManagementMode(26, overview(24)), {
    kind: "local",
    primaryRestaurantId: 24,
  });
});
