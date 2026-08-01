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

function mamieLegacyDraft(): DraftStatePayload {
  return normalizeDraftState({
    config: { landing_enabled: false },
    pages: [
      {
        id: 5,
        type: "content",
        slug: "menu",
        title: "Menu",
        sort_order: 0,
        nav_visible: false,
        is_default: false,
        appearance_overrides: { brand_color: "#123456" },
      },
    ],
    sections: [
      {
        id: 50,
        section_type: "hero_banner",
        page: "menu",
        page_id: 5,
        sort_order: 0,
        is_visible: true,
        layout: "centered",
        content: {},
        settings: {},
      },
    ],
  });
}

function dualLegacyOrderDraft(): DraftStatePayload {
  return normalizeDraftState({
    config: { landing_enabled: false },
    pages: [
      {
        id: 10,
        type: "content",
        slug: "order",
        title: "Commande legacy",
        sort_order: 0,
      },
      {
        id: 20,
        type: "content",
        slug: "menu",
        title: "Menu legacy",
        sort_order: 1,
      },
    ],
    sections: [
      {
        id: 100,
        section_type: "hero_banner",
        page: "order",
        page_id: 10,
        sort_order: 0,
        is_visible: true,
        layout: "centered",
        content: {},
        settings: {},
      },
      {
        id: 200,
        section_type: "menu_highlights",
        page: "menu",
        page_id: 20,
        sort_order: 0,
        is_visible: true,
        layout: "default",
        content: {},
        settings: {},
      },
    ],
  });
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

test("address controls only edit specific non-default page addresses", () => {
  const pageAddressIsEditable = (
    stateModule as Record<string, unknown>
  ).pageAddressIsEditable;
  assert.equal(typeof pageAddressIsEditable, "function");
  if (typeof pageAddressIsEditable !== "function") return;

  const isEditable = pageAddressIsEditable as (page: {
    type: "landing" | "content" | "order" | "catering";
    is_default: boolean;
  }) => boolean;

  assert.equal(isEditable({ type: "order", is_default: true }), false);
  assert.equal(isEditable({ type: "catering", is_default: true }), false);
  assert.equal(isEditable({ type: "order", is_default: false }), true);
  assert.equal(isEditable({ type: "catering", is_default: false }), true);
  assert.equal(isEditable({ type: "content", is_default: false }), true);
  assert.equal(isEditable({ type: "landing", is_default: false }), false);
});

test("changing the default preserves each commerce page internal slug", () => {
  const state = validState();
  state.pages.push({
    id: 4,
    type: "order",
    slug: "brunch",
    title: "Brunch",
    sort_order: 3,
    nav_visible: true,
    is_default: false,
    seo: {},
    appearance_overrides: {},
    settings: { menu_ids: [11] },
  });

  const next = stateModule.makeDefaultPage(state, "4");

  assert.deepEqual(
    next.pages
      .filter((page) => page.type === "order")
      .map((page) => [page.slug, page.is_default]),
    [
      ["commander", false],
      ["brunch", true],
    ],
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

test("order-first legacy pages reconcile to one default order page", () => {
  const result = stateModule.reconcileLegacyWebsiteDraft(mamieLegacyDraft(), {
    menuIds: [42],
    serviceIds: [],
  });
  const orders = result.state.pages.filter((page) => page.type === "order");

  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, 5);
  assert.equal(orders[0].is_default, true);
  assert.equal(orders[0].nav_visible, false);
  assert.deepEqual(orders[0].appearance_overrides, { brand_color: "#123456" });
  assert.deepEqual(orders[0].settings.menu_ids, [42]);
  assert.equal(result.state.sections[0].page_id, 5);
  assert.equal(result.state.sections[0].page, "menu");

  const repeated = stateModule.reconcileLegacyWebsiteDraft(result.state, {
    menuIds: [42],
    serviceIds: [],
  });
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.state, result.state);
});

test("legacy order reconciliation prefers menu and repairs unselected order", () => {
  const result = stateModule.reconcileLegacyWebsiteDraft(
    dualLegacyOrderDraft(),
    { menuIds: [42], serviceIds: [] },
  );
  const recoveredOrder = result.state.pages.find((page) => page.id === 20);
  const repairedLegacyOrder = result.state.pages.find((page) => page.id === 10);

  assert.equal(recoveredOrder?.type, "order");
  assert.equal(recoveredOrder?.is_default, true);
  assert.equal(recoveredOrder?.slug, "menu");
  assert.deepEqual(recoveredOrder?.settings.menu_ids, [42]);
  assert.equal(repairedLegacyOrder?.type, "content");
  assert.notEqual(repairedLegacyOrder?.slug, "order");
  const repairedSection = result.state.sections.find((section) => section.id === 100);
  assert.equal(repairedSection?.page_id, 10);
  assert.equal(repairedSection?.page, repairedLegacyOrder?.slug);
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

test("legacy builder reconciliation removes title-based technical pages and preserves the site footer", () => {
  const source = normalizeDraftState({
    config: {},
    pages: [
      {
        id: 18,
        tmp_id: "technical-site",
        type: "content",
        slug: "site",
        title: "_site",
        sort_order: 0,
      },
    ],
    sections: [
      {
        id: 92,
        section_type: "footer",
        page: "site",
        page_id: 18,
        sort_order: 0,
        is_visible: true,
        layout: "columns",
        content: {},
        settings: {},
      },
      {
        id: 93,
        section_type: "footer",
        page: "legacy-site",
        page_tmp_id: "technical-site",
        sort_order: 1,
        is_visible: true,
        layout: "columns",
        content: {},
        settings: {},
      },
      {
        id: 94,
        section_type: "footer",
        page: "site",
        sort_order: 2,
        is_visible: true,
        layout: "columns",
        content: {},
        settings: {},
      },
    ],
    deleted_page_ids: [],
    deleted_section_ids: [],
  });

  const result = stateModule.reconcileLegacyWebsiteDraft(source, {
    menuIds: [],
    serviceIds: [],
  });

  assert.deepEqual(
    result.state.pages.map((page) => [page.type, page.slug]),
    [["landing", "home"]],
  );
  assert.deepEqual(result.state.deleted_page_ids, [18]);
  for (const section of result.state.sections) {
    assert.equal(section.page, "_site");
    assert.equal(section.page_id, undefined);
    assert.equal(section.page_tmp_id, undefined);
  }
  assert.deepEqual(validateDraftForPublish(result.state), []);
});

test("legacy builder reconciliation prefers real published pages to a synthetic home", () => {
  const source = normalizeDraftState({
    config: {},
    pages: [
      {
        id: 18,
        type: "content",
        slug: "site",
        title: "_site",
        sort_order: 0,
      },
    ],
    sections: [],
  });
  const publishedPages = normalizeDraftState({
    pages: [
      {
        id: 25,
        type: "landing",
        slug: "home",
        title: "Accueil publié",
        sort_order: 0,
      },
    ],
  }).pages;

  const result = stateModule.reconcileLegacyWebsiteDraft(
    source,
    { menuIds: [], serviceIds: [] },
    publishedPages,
  );

  assert.deepEqual(
    result.state.pages.map((page) => [page.id, page.tmp_id, page.slug]),
    [[25, undefined, "home"]],
  );
  assert.deepEqual(result.state.deleted_page_ids, [18]);
});

test("legacy navbar styles normalize to a supported editor value", () => {
  assert.equal(stateModule.normalizeNavbarStyle("solid"), "solid");
  assert.equal(stateModule.normalizeNavbarStyle("transparent"), "transparent");
  assert.equal(stateModule.normalizeNavbarStyle("overlay"), "overlay");
  assert.equal(stateModule.normalizeNavbarStyle("custom"), "solid");
  assert.equal(stateModule.normalizeNavbarStyle("hidden"), "solid");
  assert.equal(stateModule.normalizeNavbarStyle(undefined), "solid");
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

test("legacy builder reconciliation repairs all static route collisions uniquely", () => {
  const source = normalizeDraftState({
    config: { stories_enabled: true },
    pages: [
      { id: 1, type: "landing", slug: "home", title: "Accueil", sort_order: 0 },
      { id: 2, type: "content", slug: "stories", title: "Stories", sort_order: 1 },
      { id: 3, type: "content", slug: "orders", title: "Orders", sort_order: 2 },
      { id: 4, type: "content", slug: "orders-page", title: "Archive", sort_order: 3 },
    ],
    sections: [
      { id: 20, section_type: "about", page: "stories", page_id: 2 },
      { id: 30, section_type: "about", page: "orders", page_id: 3 },
    ],
  });

  assert.equal(Object.hasOwn(source.config, "stories_enabled"), false);
  const result = stateModule.reconcileLegacyWebsiteDraft(source, {
    menuIds: [],
    serviceIds: [],
  });

  assert.deepEqual(
    result.state.pages.map((page) => page.slug),
    ["home", "stories-page", "orders-page-2", "orders-page"],
  );
  assert.deepEqual(
    result.state.sections.map((section) => section.page),
    ["stories-page", "orders-page-2"],
  );
  assert.deepEqual(validateDraftForPublish(result.state), []);
});
