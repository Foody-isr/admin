import assert from "node:assert/strict";
import test from "node:test";
import { rebaseWebsiteDraft, WebsiteDraftMergeConflict } from "../draft-rebase";
import { mapWebsiteDraftError, normalizeDraftState } from "../state";

const order = { id: 6, slug: "menu", title: "Order", type: "order",
  appearance_overrides: { website_order: { content_width: "standard" } } };
const events = { tmp_id: "page-events", slug: "evenements", title: "Events", type: "content" };
const hero = { tmp_id: "section-hero", section_type: "hero_banner", page: events.slug, page_tmp_id: events.tmp_id };
const base = normalizeDraftState({ pages: [order, events], sections: [hero] });
const local = normalizeDraftState({
  pages: [{ ...order, appearance_overrides: { website_order: { content_width: "wide" } } }, events],
  sections: [hero],
});

test("reapplies menu width without reviving temporary pages and sections published by another tab", () => {
  const publishedEvent = { id: 105, slug: "evenements-prives", title: "Events", type: "content" };
  const publishedHero = { id: 300, section_type: "hero_banner", page: publishedEvent.slug, page_id: publishedEvent.id };
  const remote = normalizeDraftState({
    pages: [
      { ...order, appearance_overrides: { website_order: { content_width: "standard", columns: "3" } } },
      publishedEvent,
    ],
    sections: [publishedHero],
    config: { nav_layout: { pages: [publishedEvent.slug] } },
  });
  const merged = rebaseWebsiteDraft(base, local, remote);
  assert.deepEqual(merged.pages[0].appearance_overrides.website_order, { content_width: "wide", columns: "3" });
  assert.deepEqual(merged.pages.slice(1), remote.pages.slice(1));
  assert.deepEqual(merged.sections, remote.sections);
  assert.deepEqual(merged.config, remote.config);
});

test("refuses overlapping edits and leaves both snapshots intact", () => {
  const remote = normalizeDraftState({
    pages: [{ ...order, appearance_overrides: { website_order: { content_width: null } } }, events],
    sections: [hero],
  });
  assert.throws(() => rebaseWebsiteDraft(base, local, remote), WebsiteDraftMergeConflict);
  assert.deepEqual(local.pages[0].appearance_overrides.website_order, { content_width: "wide" });
  assert.deepEqual(remote.pages[0].appearance_overrides.website_order, { content_width: null });
});

test("directs an existing slug collision to the affected draft page", () => {
  const issue = mapWebsiteDraftError({
    details: 'invalid draft state: slug "evenements" belongs to omitted page 104; include or delete that page before reusing its slug',
  }, base.pages, "This page address is already in use.");
  assert.deepEqual(issue, {
    fieldId: "page.slug",
    pageKey: "page-events",
    sectionPanel: "settings",
    message: "This page address is already in use.",
  });
});
