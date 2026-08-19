import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, type CateringService } from "../../api";
import { loadOptionalCateringServices } from "../catering-catalog";

test("optional catering returns an empty catalog when the plan lacks the feature", async () => {
  const services = await loadOptionalCateringServices(5, async () => {
    throw new ApiError(
      "This feature is not available on your plan",
      403,
      "upgrade_required",
    );
  });

  assert.deepEqual(services, []);
});

test("optional catering preserves a restaurant's available services", async () => {
  const expected = [{ id: 21, name: "Events" }] as CateringService[];
  const services = await loadOptionalCateringServices(5, async () => expected);

  assert.equal(services, expected);
});

test("optional catering does not hide authorization or API failures", async () => {
  const forbidden = new ApiError("forbidden", 403, "restaurant_access_denied");

  await assert.rejects(
    loadOptionalCateringServices(5, async () => {
      throw forbidden;
    }),
    (error: unknown) => error === forbidden,
  );
});
