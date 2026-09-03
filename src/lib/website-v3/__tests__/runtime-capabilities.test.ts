import assert from "node:assert/strict";
import { test } from "node:test";
import {
  prepareWebsiteV3StateForPublication,
  requireWebsiteV3RuntimeCapabilities,
} from "../runtime-capabilities";
import type { DraftStatePayload } from "../types";

const compatible = {
  protocol: "foody.website-v3",
  version: 1,
  page_types: ["landing", "content", "order", "catering"],
  surfaces: ["page", "checkout", "branches"],
  publication: {
    marker: "foody_renderer_version",
    version: 1,
  },
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
  await assert.rejects(
    requireWebsiteV3RuntimeCapabilities(
      "https://app.foody-pos.co.il",
      async () => Response.json({ ...compatible, publication: undefined }),
    ),
    /site public n’est pas compatible/,
  );
});

test("marks every page for explicit V3 activation without mutating the draft", () => {
  const state: DraftStatePayload = {
    config: {},
    pages: [
      {
        id: 51,
        type: "landing",
        slug: "home",
        title: "Accueil",
        sort_order: 0,
        nav_visible: true,
        is_homepage: true,
        is_default: false,
        seo: {},
        settings: {},
        appearance_overrides: { theme_id: "garden-fresh" },
      },
      {
        tmp_id: "order-new",
        type: "order",
        slug: "commander",
        title: "Commander",
        sort_order: 1,
        nav_visible: true,
        is_homepage: false,
        is_default: true,
        seo: {},
        settings: { menu_ids: [7] },
        appearance_overrides: {},
      },
    ],
    sections: [],
    deleted_section_ids: [],
    deleted_page_ids: [],
  };

  const prepared = prepareWebsiteV3StateForPublication(state);

  assert.equal(state.pages[0].appearance_overrides.foody_renderer_version, undefined);
  assert.equal(prepared.pages[0].appearance_overrides.foody_renderer_version, 1);
  assert.equal(prepared.pages[1].appearance_overrides.foody_renderer_version, 1);
  assert.notEqual(prepared, state);
  assert.notEqual(prepared.pages[0], state.pages[0]);
});
