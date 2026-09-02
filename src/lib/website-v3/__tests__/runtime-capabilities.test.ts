import assert from "node:assert/strict";
import { test } from "node:test";
import { requireWebsiteV3RuntimeCapabilities } from "../runtime-capabilities";

const compatible = {
  protocol: "foody.website-v3",
  version: 1,
  page_types: ["landing", "content", "order", "catering"],
  surfaces: ["page", "checkout", "branches"],
};

test("accepts the exact Website V3 storefront contract", async () => {
  const result = await requireWebsiteV3RuntimeCapabilities(
    "https://app.foody-pos.co.il",
    async () => Response.json(compatible),
  );
  assert.deepEqual(result, compatible);
});

test("rejects a legacy storefront before the editor can create an unusable draft", async () => {
  await assert.rejects(
    requireWebsiteV3RuntimeCapabilities(
      "https://app.foody-pos.co.il",
      async () => new Response("legacy", { status: 404 }),
    ),
    /La création et la publication sont suspendues/,
  );
});

test("rejects partial or future-incompatible renderer contracts", async () => {
  await assert.rejects(
    requireWebsiteV3RuntimeCapabilities(
      "https://app.foody-pos.co.il",
      async () =>
        Response.json({
          ...compatible,
          page_types: ["landing", "content"],
        }),
    ),
    /site public n’est pas compatible/,
  );
  await assert.rejects(
    requireWebsiteV3RuntimeCapabilities(
      "https://app.foody-pos.co.il",
      async () => Response.json({ ...compatible, version: 2 }),
    ),
    /site public n’est pas compatible/,
  );
});
