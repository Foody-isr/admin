import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapWebsiteDraftError,
  validateDraftForPublish,
} from "../state";
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
