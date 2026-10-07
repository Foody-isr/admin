import assert from "node:assert/strict";
import { test } from "node:test";
import { previousOrderPresentation } from "../order-design";
import { normalizeDraftState, updateWebsitePageAtPath } from "../state";

test("restoring the previous presentation preserves commerce and authored colors in the draft only", () => {
  const published = normalizeDraftState({
    config: { custom_palette: { bg: "#de5328", surface: "#6d1f13" } },
    pages: [
      {
        id: 1,
        type: "order",
        slug: "menu",
        title: "Menu",
        settings: { menu_ids: [4] },
        appearance_overrides: {
          website_order: {
            prompt_on_entry: false,
            card_price_color: "#e7cb5e",
          },
        },
      },
    ],
  });
  const before = structuredClone(published);
  const design = previousOrderPresentation(
    published.pages[0].appearance_overrides.website_order!,
  );
  const draft = updateWebsitePageAtPath(
    published,
    "1",
    ["appearance_overrides", "website_order"],
    design,
  );
  assert.deepEqual(published, before);
  assert.deepEqual(draft.config, published.config);
  assert.equal(draft.pages[0].id, 1);
  assert.deepEqual(draft.pages[0].settings, { menu_ids: [4] });
  assert.equal(design.card_price_color, "#e7cb5e");
  assert.equal(design.prompt_on_entry, false);
  assert.equal(design.image_radius, "rounded");
  assert.equal(design.category_title_style, "inherit");
  assert.deepEqual(previousOrderPresentation(design), design);
});
