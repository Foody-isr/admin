import assert from "node:assert/strict";
import { test } from "node:test";
import { API_URL, removeOrderItem } from "../api";

test("removeOrderItem uses the server's non-nested delete route", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init };
    return new Response(null, { status: 204 });
  };

  await removeOrderItem(5, 4120);

  assert.equal(request?.url, `${API_URL}/api/v1/orders/items/4120?restaurant_id=5`);
  assert.equal(request?.init?.method, "DELETE");
  assert.equal(new Headers(request?.init?.headers).get("X-Restaurant-ID"), "5");
});
