import assert from "node:assert/strict";
import { test } from "node:test";
import {
  squareDefaultContent,
  SQUARE_COMPONENT_GROUPS,
} from "../square-components";
import { retargetNavigationPage, addNavigationPage } from "../navigation-links";
import { normalizeDraftState } from "../state";
import { publicAddressForPage } from "../url-model";
test("section drafts never share mutable content arrays", () => {
  const one = squareDefaultContent("forms"),
    two = squareDefaultContent("forms");
  (one.fields as unknown[]).pop();
  assert.equal((two.fields as unknown[]).length, 3);
  assert.equal(
    SQUARE_COMPONENT_GROUPS.flatMap((group) => group.items).length,
    19,
  );
});
test("reservation presets contain date and guest fields", () => {
  const form = squareDefaultContent("forms", "reservation");
  assert.ok(
    (form.fields as { id: string }[]).some((field) => field.id === "guests"),
  );
});
test("renaming a page retargets links without changing their labels or anchors", () => {
  const state = normalizeDraftState({
    config: {
      nav_layout: {
        theme_pages: { about: "about", catering: "private-events" },
        links: [
          {
            id: "a",
            label: "Our story",
            page_slug: "about",
            anchor: "history",
          },
        ],
      },
    },
    pages: [],
    sections: [],
  });
  const next = retargetNavigationPage(state, "about", "story");
  assert.deepEqual((next.config.nav_layout as { links: unknown[] }).links, [
    { id: "a", label: "Our story", page_slug: "story", anchor: "history" },
  ]);
  assert.deepEqual(
    (next.config.nav_layout as { theme_pages: Record<string, string> }).theme_pages,
    { about: "story", catering: "private-events" },
  );
  assert.equal(
    (state.config.nav_layout as { links: { page_slug: string }[] }).links[0]
      .page_slug,
    "about",
  );
});
test("a single ordering homepage uses the same root URL as the public navigation", () => {
  assert.equal(
    publicAddressForPage({
      type: "order",
      slug: "menu",
      is_default: true,
      is_homepage: true,
    }),
    "/",
  );
});

test("adding a page respects its navigation checkbox after links were customized", () => {
  const state = normalizeDraftState({
    config: { nav_layout: { links: [] } },
    pages: [
      {
        id: 1,
        type: "landing",
        title: "Home",
        slug: "home",
        nav_visible: true,
      },
    ],
    sections: [],
  });
  const page = state.pages[0];
  assert.equal(
    (addNavigationPage(state, page).config.nav_layout as any).links.length,
    1,
  );
  assert.deepEqual(
    addNavigationPage(state, { ...page, nav_visible: false }),
    state,
  );
});
