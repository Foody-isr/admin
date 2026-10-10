import assert from "node:assert/strict";
import { test } from "node:test";
import { addSiteFooter, resolveSiteFooter } from "../footer";
import { normalizeDraftResponse, reconcileLegacyWebsiteDraft, validateDraftForPublish } from "../state";
import { recordDraftEdit, travelDraftHistory } from "../history";
import type { DraftSectionPayload, DraftStatePayload } from "../types";

const state: DraftStatePayload = {
  config: { custom_palette: { footer_branding: { enabled: false, background: "#123456" } } },
  pages: [{
    id: 1, type: "landing", slug: "home", title: "Home", sort_order: 0,
    nav_visible: true, is_homepage: true, is_default: false,
    settings: {}, seo: {}, appearance_overrides: { footer_mode: "hidden" },
  }],
  sections: [], deleted_page_ids: [], deleted_section_ids: [9],
};

const existing = (overrides: Partial<DraftSectionPayload> = {}): DraftSectionPayload => ({
  id: 42, section_type: "footer", page: "_site", sort_order: 0,
  is_visible: true, layout: "centered", content: { custom_text: "Keep me" },
  settings: { color_style: "style-2" }, ...overrides,
});

test("creating a shared footer preserves branding, page overrides and deletion history", () => {
  const before = structuredClone(state);
  const next = addSiteFooter(state, "new-footer");
  const footer = resolveSiteFooter(next.sections)!;
  assert.deepEqual(state, before);
  assert.strictEqual(next.config, state.config);
  assert.strictEqual(next.pages, state.pages);
  assert.strictEqual(next.deleted_section_ids, state.deleted_section_ids);
  assert.equal(footer.tmp_id, "new-footer");
  assert.equal(footer.id, undefined);
  assert.equal(footer.page, "_site");
  assert.equal(footer.page_id, undefined);
  assert.equal(footer.page_tmp_id, undefined);
  assert.equal(footer.is_visible, true);
  assert.equal(footer.layout, "columns");
  assert.equal(footer.content.show_logo, true);
  assert.equal(footer.settings.color_style, "site");
  assert.deepEqual(validateDraftForPublish(next), []);
  assert.strictEqual(addSiteFooter(next, "duplicate"), next);
});

test("saved, hidden and legacy footers retain their identity and authored content", () => {
  for (const footer of [existing(), existing({ is_visible: false }), existing({ page: "home", page_id: 1 })]) {
    const draft = { ...state, sections: [footer] };
    assert.strictEqual(resolveSiteFooter(draft.sections), footer);
    assert.strictEqual(addSiteFooter(draft, "duplicate"), draft);
  }
});

test("selection matches the public renderer and ignores retired theme sections", () => {
  const legacy = existing({ id: 11, page: "home", page_id: 1 });
  const shared = existing();
  const retired = existing({ id: 12, settings: { theme_retired: true } });
  assert.strictEqual(resolveSiteFooter([legacy, retired, shared]), shared);
  assert.strictEqual(resolveSiteFooter([retired, legacy]), legacy);
  assert.strictEqual(resolveSiteFooter([{ ...shared, is_visible: false }, legacy]), legacy);
  assert.equal(resolveSiteFooter([retired]), null);
  const next = addSiteFooter({ ...state, sections: [retired] }, "new-footer");
  assert.strictEqual(next.sections[0], retired);
  assert.equal(resolveSiteFooter(next.sections)?.tmp_id, "new-footer");
});

test("creation survives autosave normalization, legacy reconciliation and undo/redo", () => {
  const next = addSiteFooter(state, "new-footer");
  const saved = normalizeDraftResponse({ state: JSON.parse(JSON.stringify(next)), draft_dirty: true }).state;
  assert.deepEqual(resolveSiteFooter(saved.sections), { ...next.sections[0], id: undefined, page_id: undefined, page_tmp_id: undefined });
  const reconciled = reconcileLegacyWebsiteDraft(saved, { menuIds: [], serviceIds: [] }).state;
  assert.equal(resolveSiteFooter(reconciled.sections)?.tmp_id, "new-footer");
  assert.equal(reconciled.sections.length, 1);
  const history = recordDraftEdit({ past: [], future: [] }, state, next);
  const undo = travelDraftHistory(history, next, "undo")!;
  assert.strictEqual(undo.state, state);
  assert.strictEqual(travelDraftHistory(undo.history, undo.state, "redo")?.state, next);
});
