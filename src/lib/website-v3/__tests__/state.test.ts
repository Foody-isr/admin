import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapWebsiteDraftError,
  normalizeDraftState,
  validateDraftForPublish,
} from "../state";
import * as stateModule from "../state";
import { ApiError } from "../../api";
import type { DraftStatePayload } from "../types";

function validState(): DraftStatePayload {
  return {
    config: {},
    pages: [
      {
        id: 1,
        type: "landing",
        slug: "accueil",
        title: "Accueil",
        sort_order: 0,
        nav_visible: true,
        is_default: false,
        seo: {},
        appearance_overrides: {},
        settings: {},
      },
      {
        id: 2,
        type: "order",
        slug: "commander",
        title: "Commander",
        sort_order: 1,
        nav_visible: true,
        is_default: true,
        seo: {},
        appearance_overrides: {},
        settings: { menu_ids: [11] },
      },
      {
        id: 3,
        type: "catering",
        slug: "evenements",
        title: "Événements",
        sort_order: 2,
        nav_visible: true,
        is_default: true,
        seo: {},
        appearance_overrides: {},
        settings: { service_ids: [21] },
      },
    ],
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  };
}

test("publication validation blocks unavailable menu and service references", () => {
  const errors = validateDraftForPublish(validState(), {
    menuIds: new Set([12]),
    serviceIds: new Set([22]),
  });

  assert.deepEqual(
    errors.map((error) => error.fieldId),
    ["page.settings.menu_ids", "page.settings.service_ids"],
  );
  assert.match(errors[0].message, /11/);
  assert.match(errors[1].message, /21/);
});

test("publication validation accepts references available to the public renderer", () => {
  assert.deepEqual(
    validateDraftForPublish(validState(), {
      menuIds: new Set([11]),
      serviceIds: new Set([21]),
    }),
    [],
  );
});

test("production ApiError details map to the primary-page field", () => {
  const error = new ApiError(
    "invalid draft",
    400,
    "at most one default order page is allowed",
  );
  assert.equal(
    mapWebsiteDraftError(error)?.fieldId,
    "page.is_default",
  );
  assert.equal(
    mapWebsiteDraftError(error)?.message,
    "at most one default order page is allowed",
  );
});

test("site footer remains valid without a page identity", () => {
  const state = validState();
  state.sections.push({
    tmp_id: "footer",
    section_type: "footer",
    page: "_site",
    sort_order: 0,
    is_visible: true,
    layout: "columns",
    content: {},
    settings: {},
  });

  assert.equal(
    validateDraftForPublish(state).some(
      (error) =>
        error.fieldId === "section.page_id" &&
        error.sectionKey === "footer",
    ),
    false,
  );
});

test("legacy classic commerce settings restore an order page association", () => {
  const state = normalizeDraftState({
    config: {},
    pages: [
      {
        id: 13,
        type: "content",
        slug: "boutiques",
        title: "Boutiques",
        sort_order: 0,
        settings: {
          commerce: "classic",
          menu_ids: [13],
          service_ids: [],
        },
      },
    ],
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  });

  assert.equal(state.pages[0].type, "order");
  assert.deepEqual(state.pages[0].settings, { menu_ids: [13] });
});

test("legacy builder reconciliation removes technical pages and repairs commerce defaults", () => {
  const reconcile = (
    stateModule as Record<string, unknown>
  ).reconcileLegacyWebsiteDraft;
  assert.equal(typeof reconcile, "function");
  if (typeof reconcile !== "function") return;

  const source = normalizeDraftState({
    config: {},
    pages: [
      {
        id: 17,
        type: "landing",
        slug: "home",
        title: "Accueil",
        sort_order: 0,
      },
      {
        id: 12,
        type: "content",
        slug: "_site",
        title: "_site",
        sort_order: 1,
      },
      {
        id: 9,
        type: "catering",
        slug: "catering",
        title: "Traiteur",
        sort_order: 2,
        settings: null,
      },
    ],
    sections: [
      {
        id: 90,
        section_type: "footer",
        page: "_site",
        page_id: 12,
        sort_order: 0,
        is_visible: true,
        layout: "columns",
        content: {},
        settings: {},
      },
      {
        id: 91,
        section_type: "hero_banner",
        page: "catering",
        page_id: 9,
        sort_order: 0,
        is_visible: true,
        layout: "centered",
        content: {},
        settings: {},
      },
    ],
    deleted_page_ids: [],
    deleted_section_ids: [],
  });

  const result = (
    reconcile as (
      state: DraftStatePayload,
      references: { menuIds: number[]; serviceIds: number[] },
    ) => { state: DraftStatePayload; changed: boolean }
  )(source, { menuIds: [13], serviceIds: [1, 2] });

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.state.pages.map((page) => page.slug),
    ["home", "traiteur"],
  );
  assert.deepEqual(result.state.deleted_page_ids, [12]);
  assert.deepEqual(result.state.pages[1].settings, { service_ids: [1, 2] });
  assert.equal(result.state.pages[1].is_default, true);
  assert.equal(result.state.sections[0].page_id, undefined);
  assert.equal(result.state.sections[1].page, "traiteur");
  assert.deepEqual(validateDraftForPublish(result.state), []);
});

test("legacy builder reconciliation restores published pages missing from the draft snapshot", () => {
  const publishedPages = validState().pages;
  const source = normalizeDraftState({
    config: {},
    sections: [],
    deleted_page_ids: [],
    deleted_section_ids: [],
  });

  const result = stateModule.reconcileLegacyWebsiteDraft(
    source,
    { menuIds: [11], serviceIds: [21] },
    publishedPages,
  );

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.state.pages.map((page) => page.id),
    [1, 2, 3],
  );
  assert.deepEqual(validateDraftForPublish(result.state), []);
});

test("legacy builder reconciliation bootstraps pages from sections as a final fallback", () => {
  const source = normalizeDraftState({
    config: {},
    sections: [
      {
        id: 71,
        section_type: "hero_banner",
        page: "home",
        sort_order: 0,
        is_visible: true,
        layout: "centered",
        content: {},
        settings: {},
      },
      {
        id: 72,
        section_type: "menu_highlights",
        page: "order",
        sort_order: 0,
        is_visible: true,
        layout: "grid",
        content: {},
        settings: {},
      },
    ],
  });

  const result = stateModule.reconcileLegacyWebsiteDraft(source, {
    menuIds: [11],
    serviceIds: [],
  });

  assert.deepEqual(
    result.state.pages.map((page) => [page.type, page.slug]),
    [
      ["landing", "home"],
      ["order", "commander"],
    ],
  );
  assert.equal(result.state.sections[0].page_tmp_id, "legacy-page-home");
  assert.equal(result.state.sections[1].page_tmp_id, "legacy-page-order");
  assert.deepEqual(validateDraftForPublish(result.state), []);
});
