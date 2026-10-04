import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
