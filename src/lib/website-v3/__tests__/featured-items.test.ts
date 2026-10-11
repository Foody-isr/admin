import assert from "node:assert/strict";
import test from "node:test";
import {
  featuredPickerItems,
  moveFeaturedItem,
  toggleFeaturedItem,
} from "../featured-items";
import {
  squareDefaultContent,
  squareDefaultSettings,
  squareLayouts,
} from "../square-components";
import type { Menu, MenuItem } from "@/lib/api";

const item = (id: number, extra: Partial<MenuItem> = {}) =>
  ({ id, is_active: true, name: `Item ${id}`, ...extra }) as MenuItem;
test("picker uses web menu membership rather than internal categories", () => {
  const menu = {
    web_enabled: true,
    groups: [
      {
        web_enabled: true,
        is_hidden: false,
        items: [
          item(1),
          item(2, { is_active: false }),
          item(3, { availability_state: "hidden" }),
          item(6, { combo_only: true }),
        ],
      },
      { web_enabled: false, items: [item(4)] },
      { web_enabled: true, is_hidden: true, items: [item(5)] },
    ],
  } as Menu;
  assert.deepEqual(
    featuredPickerItems([menu, menu, { ...menu, web_enabled: false }]).map(
      (item) => item.id,
    ),
    [1],
  );
});
test("selection drafts preserve order and never mutate the saved list", () => {
  const original = [3, 1, 99];
  const draft = toggleFeaturedItem(original, 2);
  assert.deepEqual(original, [3, 1, 99]);
  assert.deepEqual(draft, [3, 1, 99, 2]);
  assert.deepEqual(toggleFeaturedItem(draft, 1), [3, 99, 2]);
  assert.deepEqual(moveFeaturedItem(original, 2, -1), [3, 99, 1]);
  assert.deepEqual(moveFeaturedItem(original, 0, -1), original);
});
test("new menu sections use text cards and preserve the section button", () => {
  const settings = squareDefaultSettings("featured_menu");
  assert.equal(settings.columns, 2);
  assert.equal(settings.show_images, false);
  assert.equal(settings.show_descriptions, true);
  assert.equal(settings.show_cta_text, true);
  assert.ok(squareDefaultContent("featured_menu").cta_text);
  assert.deepEqual(
    squareLayouts("featured_menu").map((layout) => layout.value),
    ["list"],
  );
  assert.equal(squareDefaultSettings("menu_highlights").show_images, true);
});
