import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  CateringService,
  Menu,
  Restaurant,
  ThemeCatalog,
} from "@/lib/api";
import type { DraftPagePayload } from "@/lib/website-v3/types";
import * as PageDialogModule from "../PageDialog";
import { PageInspector } from "../PageInspector";
import { PageRail } from "../PageRail";

Object.assign(globalThis, { React });

const addressStates: Array<{
  name: string;
  page: DraftPagePayload;
  publicAddress: string;
  editable: boolean;
}> = [
  {
    name: "default order",
    page: commercePage("order", "commander", true),
    publicAddress: "/order",
    editable: false,
  },
  {
    name: "default catering",
    page: commercePage("catering", "traiteur", true),
    publicAddress: "/catering",
    editable: false,
  },
  {
    name: "non-default commerce",
    page: commercePage("order", "brunch", false),
    publicAddress: "/brunch",
    editable: true,
  },
  {
    name: "content",
    page: contentPage(),
    publicAddress: "/notre-histoire",
    editable: true,
  },
  {
    name: "landing",
    page: landingPage(),
    publicAddress: "/",
    editable: false,
  },
];

test("page address UI renders one address across inspector, dialog, and rail", () => {
  const AddressField = (
    PageDialogModule as Record<string, unknown>
  ).PageDialogAddressField;
  assert.equal(typeof AddressField, "function");
  if (typeof AddressField !== "function") return;

  for (const addressState of addressStates) {
    const inspector = renderInspector(addressState.page);
    const dialog = renderToStaticMarkup(
      React.createElement(
        AddressField as React.ComponentType<{
          addressIsEditable: boolean;
          publicAddress: string;
          slug: string;
          error?: string;
          onChange: (value: string) => void;
        }>,
        {
          addressIsEditable: addressState.editable,
          publicAddress: addressState.publicAddress,
          slug: addressState.page.slug,
          onChange: () => undefined,
        },
      ),
    );
    const rail = renderRail(addressState.page);

    if (addressState.editable) {
      assert.match(inspector, /data-field-id="page\.slug"/, addressState.name);
      assert.doesNotMatch(inspector, /data-page-address-readonly/, addressState.name);
      assert.match(dialog, /data-field-id="page\.create\.slug"/, addressState.name);
      assert.doesNotMatch(dialog, /data-page-address-readonly/, addressState.name);
    } else {
      assert.doesNotMatch(inspector, /data-field-id="page\.slug"/, addressState.name);
      assert.match(inspector, new RegExp(`>${addressState.publicAddress}</div>`), addressState.name);
      assert.doesNotMatch(dialog, /data-field-id="page\.create\.slug"/, addressState.name);
      assert.match(dialog, new RegExp(`>${addressState.publicAddress}</div>`), addressState.name);
      assert.doesNotMatch(inspector, new RegExp(`/${addressState.page.slug}`), addressState.name);
      assert.doesNotMatch(dialog, new RegExp(`/${addressState.page.slug}`), addressState.name);
      assert.doesNotMatch(rail, new RegExp(`/${addressState.page.slug}`), addressState.name);
    }

    assert.match(rail, new RegExp(`>${addressState.publicAddress}</span>`), addressState.name);
  }
});

test("default commerce titles preserve their generated internal slug", () => {
  const nextSlugForPageTitle = (
    PageDialogModule as Record<string, unknown>
  ).nextSlugForPageTitle;
  assert.equal(typeof nextSlugForPageTitle, "function");
  if (typeof nextSlugForPageTitle !== "function") return;

  const nextSlug = nextSlugForPageTitle as (input: {
    currentSlug: string;
    slugEdited: boolean;
    addressIsEditable: boolean;
    title: string;
  }) => string;

  assert.equal(
    nextSlug({
      currentSlug: "commander",
      slugEdited: false,
      addressIsEditable: false,
      title: "Order",
    }),
    "commander",
  );
  assert.equal(
    nextSlug({
      currentSlug: "traiteur",
      slugEdited: false,
      addressIsEditable: false,
      title: "Catering",
    }),
    "traiteur",
  );
  assert.equal(
    nextSlug({
      currentSlug: "about",
      slugEdited: false,
      addressIsEditable: true,
      title: "Notre histoire",
    }),
    "notre-histoire",
  );
});

test("reserved aliases only explain an explicit visible address entry", () => {
  const pageDialogAddressError = (
    PageDialogModule as Record<string, unknown>
  ).pageDialogAddressError;
  assert.equal(typeof pageDialogAddressError, "function");
  if (typeof pageDialogAddressError !== "function") return;

  const addressError = pageDialogAddressError as (input: {
    addressIsEditable: boolean;
    duplicate: boolean;
    reserved: boolean;
    slugEdited: boolean;
    normalizedSlug: string;
  }) => string | undefined;

  assert.equal(
    addressError({
      addressIsEditable: false,
      duplicate: false,
      reserved: true,
      slugEdited: false,
      normalizedSlug: "order",
    }),
    undefined,
  );
  assert.equal(
    addressError({
      addressIsEditable: true,
      duplicate: false,
      reserved: true,
      slugEdited: false,
      normalizedSlug: "order",
    }),
    undefined,
  );
  assert.equal(
    addressError({
      addressIsEditable: true,
      duplicate: false,
      reserved: true,
      slugEdited: true,
      normalizedSlug: "catering",
    }),
    "/catering est attribuée automatiquement à la page traiteur principale.",
  );
});

test("page inspector exposes overlay colors when the page inherits overlay", () => {
  const inspector = renderInspector(contentPage(), { navbar_style: "overlay" });

  assert.match(inspector, /Couleur de fond au survol/);
  assert.match(inspector, /Couleur du texte normale/);
  assert.match(inspector, /Couleur du texte au survol/);
});

function renderInspector(
  page: DraftPagePayload,
  config: Record<string, unknown> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(PageInspector, {
      page,
      tab: "settings",
      restaurantId: 24,
      restaurant: {} as Restaurant,
      config,
      catalog: {} as ThemeCatalog,
      menus: [] as Menu[],
      services: [] as CateringService[],
      errors: [],
      onChange: () => undefined,
      onReplace: () => undefined,
      onMakeDefault: () => undefined,
    }),
  );
}

function renderRail(page: DraftPagePayload): string {
  return renderToStaticMarkup(
    React.createElement(PageRail, {
      pages: [page],
      selection: { kind: "site" },
      onSelectSite: () => undefined,
      onSelectPage: () => undefined,
      onCreate: () => undefined,
      onDuplicate: () => undefined,
      onMove: () => undefined,
      onDelete: () => undefined,
    }),
  );
}

function commercePage(
  type: "order" | "catering",
  slug: string,
  isDefault: boolean,
): DraftPagePayload {
  const base = {
    tmp_id: `${type}-${slug}`,
    slug,
    title: `${type} page`,
    sort_order: 0,
    nav_visible: true,
    is_default: isDefault,
    seo: {},
    appearance_overrides: {},
  };
  return type === "order"
    ? { ...base, type, settings: { menu_ids: [] } }
    : { ...base, type, settings: { service_ids: [] } };
}

function contentPage(): DraftPagePayload {
  return {
    tmp_id: "content-notre-histoire",
    type: "content",
    slug: "notre-histoire",
    title: "Notre histoire",
    sort_order: 0,
    nav_visible: true,
    is_default: false,
    seo: {},
    appearance_overrides: {},
    settings: {},
  };
}

function landingPage(): DraftPagePayload {
  return {
    tmp_id: "landing-home",
    type: "landing",
    slug: "home",
    title: "Accueil",
    sort_order: 0,
    nav_visible: true,
    is_default: false,
    seo: {},
    appearance_overrides: {},
    settings: {},
  };
}
