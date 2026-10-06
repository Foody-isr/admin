import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canDeleteSection,
  duplicateSection,
  insertSection,
  reorderSection,
} from "../section-operations";
import type {
  DraftPagePayload,
  DraftSectionPayload,
  DraftStatePayload,
} from "../types";
import { sectionsForPage } from "../section-operations";

const page: DraftPagePayload = {
  id: 1,
  type: "content",
  title: "About",
  slug: "about",
  sort_order: 0,
  nav_visible: true,
  is_homepage: false,
  is_default: false,
  settings: {},
  seo: {},
  appearance_overrides: {},
};
const section = (
  id: number,
  type = "text_and_image",
  pageId = 1,
): DraftSectionPayload => ({
  id,
  section_type: type,
  page_id: pageId,
  page: pageId === 1 ? "about" : "other",
  sort_order: id,
  is_visible: true,
  layout: "default",
  content: { title: "Story" },
  settings: {},
});
const state: DraftStatePayload = {
  config: {},
  pages: [page],
  sections: [
    section(1),
    section(2),
    section(3, "footer"),
    section(4, "text_and_image", 2),
  ],
  deleted_page_ids: [],
  deleted_section_ids: [],
};

test("preview insertion leaves the draft unchanged and places the candidate before the footer", () => {
  const before = JSON.stringify(state);
  const result = insertSection(state, page, section(5));
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(
    sectionsForPage(result, page).map((s) => s.id),
    [1, 2, 5, 3],
  );
  assert.deepEqual(
    sectionsForPage(result, page).map((s) => s.sort_order),
    [0, 1, 2, 3],
  );
  assert.strictEqual(
    result.sections.find((s) => s.id === 4),
    state.sections[3],
  );
});

test("duplication generates a new identity and independent content next to the source", () => {
  const result = duplicateSection(state, page, "1", "copy");
  const copy = result.sections.find((s) => s.tmp_id === "copy")!;
  assert.equal(copy.id, undefined);
  assert.notStrictEqual(copy.content, state.sections[0].content);
  assert.deepEqual(
    sectionsForPage(result, page).map((s) => s.id ?? s.tmp_id),
    [1, "copy", 2, 3],
  );
  assert.strictEqual(duplicateSection(state, page, "3", "copy"), state);
});

test("dragging cannot move a section between pages or move the footer into content", () => {
  assert.strictEqual(reorderSection(state, page, "4", "1"), state);
  assert.strictEqual(reorderSection(state, page, "1", "3"), state);
  assert.deepEqual(
    sectionsForPage(reorderSection(state, page, "2", "1"), page).map(
      (s) => s.id,
    ),
    [2, 1, 3],
  );
});


test("retired theme blocks stay out of outlines and insertion/reorder operations", () => {
  const retired = { ...section(5), settings: { theme_retired: true } };
  const draft = { ...state, sections: [...state.sections, retired] };
  assert.deepEqual(sectionsForPage(draft, page).map((s) => s.id), [1, 2, 3]);
  assert.equal(sectionsForPage(insertSection(draft, page, section(6)), page).length, 4);
  assert.strictEqual(reorderSection(draft, page, "5", "1"), draft);
});

test("ordinary sections are removable while shared footer and main banner are hideable only", () => {
  assert.equal(canDeleteSection(section(1)), true);
  assert.equal(canDeleteSection(section(2, "hero_banner")), false);
  assert.equal(canDeleteSection(section(3, "footer")), false);
});
