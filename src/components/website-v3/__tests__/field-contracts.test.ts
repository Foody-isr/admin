import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_CONTRACTS } from "../field-contracts";
import { showsInspectorGroup } from "@/lib/website-v3/inspector-scope";
import type { InspectorGroupId } from "@/lib/website-v3/inspector-scope";
import { SiteInspector } from "../SiteInspector";
import { publicAddressForPage } from "@/lib/website-v3/url-model";
import { LocaleProvider } from "@/lib/i18n";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("every statically rendered field ID has a registered contract", () => {
  const ids = new Set(FIELD_CONTRACTS.map((contract) => contract.id));
  const sources = sourceFiles(
    resolve(process.cwd(), "src/components/website-v3"),
  ).filter((source) => !source.includes("every statically rendered field ID"));
  const rendered = new Set<string>();
  sources.forEach((source) => {
    for (const match of Array.from(
      source.matchAll(/(?:data-field-id|fieldId)="([^"]+)"/g),
    )) {
      if (!match[1].includes("${")) rendered.add(match[1]);
    }
  });
  rendered.forEach((id) => assert.equal(ids.has(id), true, id));
  assert.equal(ids.has("section.page_id"), true);
  assert.equal(ids.size, FIELD_CONTRACTS.length, "field IDs must be unique");
  FIELD_CONTRACTS.forEach((contract) => {
    assert.notEqual(contract.testValue, undefined, `${contract.id}: testValue`);
    assert.ok(contract.editor.tab, `${contract.id}: editor tab`);
    assert.ok(contract.preview.expected.length > 0, `${contract.id}: preview expected`);
    assert.ok(contract.public.expected.length > 0, `${contract.id}: public expected`);
  });
});

test("every custom contract selector is backed by a foodyweb renderer hook", () => {
  const webSources = [
    ...sourceFiles(resolve(process.cwd(), "../foodyweb/components")),
    ...sourceFiles(resolve(process.cwd(), "../foodyweb/lib")),
  ].join("\n");
  assert.match(webSources, /websiteV3PageFieldHooks/);
  assert.match(webSources, /websiteV3SectionFieldHooks/);
  FIELD_CONTRACTS.forEach((contract) => {
    if (contract.id === "page.seo.title") {
      assert.equal(contract.preview.selector, "title");
      assert.equal(contract.preview.assertion, "text");
      assert.equal(contract.public.selector, "title");
      return;
    }
    if (contract.id === "page.seo.description") {
      assert.equal(contract.preview.selector, 'meta[name="description"]');
      assert.equal(contract.preview.name, "content");
      assert.equal(contract.public.selector, 'meta[name="description"]');
      return;
    }
    if (contract.id === "page.seo.share_image_url") {
      assert.equal(contract.preview.selector, 'meta[property="og:image"]');
      assert.equal(contract.preview.name, "content");
      assert.equal(contract.public.selector, 'meta[property="og:image"]');
      return;
    }
    if (contract.id === "section.is_visible") return;
    [contract.preview.selector, contract.public.selector].forEach((selector) => {
      if (contract.editor.kind === "action") return;
      const expected = `data-field-${contract.id
        .replace(/[._]/g, "-")
        .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
      assert.equal(selector, `[${expected}]`, contract.id);
      assert.equal(contract.preview.name, expected, contract.id);
      assert.equal(contract.public.name, expected, contract.id);
    });
  });
});

// The contract registry (keyed by field id) and the inspector scope table
// (keyed by group) must agree, or a driver navigates to a page or surface where
// the control does not render — which is exactly how the checkout colour
// contracts sat broken while still "passing" their static checks.
test("every contract is reachable on the page type and surface it declares", () => {
  FIELD_CONTRACTS.forEach((contract) => {
    if (contract.scope !== "page") return;
    if (contract.editor.kind === "action") return;

    const orderOnly =
      contract.pageTypes !== "all" &&
      contract.pageTypes.length === 1 &&
      contract.pageTypes[0] === "order";
    if (orderOnly) {
      assert.equal(
        contract.editor.pageTitle,
        "Brunch Order",
        `${contract.id}: an order-only field must be edited on an order page`,
      );
    }

    const surface = contract.editor.surface ?? "page";
    if (surface === "checkout") {
      assert.equal(
        orderOnly,
        true,
        `${contract.id}: only an order page has a checkout surface`,
      );
    }

    // The group the field belongs to must actually render for EVERY page type
    // the contract claims, on the surface it claims.
    const groupId = groupForField(contract.id);
    if (!groupId) return;
    const tab =
      contract.editor.tab === "Contenu"
        ? "content"
        : contract.editor.tab === "Apparence"
          ? "appearance"
          : "settings";
    const pageTypes =
      contract.pageTypes === "all"
        ? (["landing", "content", "order", "catering"] as const)
        : contract.pageTypes;
    pageTypes.forEach((pageType) => {
      assert.equal(
        showsInspectorGroup(groupId, { pageType, tab, surface }),
        true,
        `${contract.id}: ${groupId} does not render on ${pageType}/${tab}/${surface}`,
      );
    });
  });
});

/** Maps a field id to the inspector group that renders it. Only the families
 *  whose visibility this change moved need an entry; anything else is skipped
 *  rather than guessed. */
function groupForField(id: string): InspectorGroupId | null {
  if (id.startsWith("page.appearance_overrides.checkout_text_colors."))
    return "checkout.text_colors";
  if (id.startsWith("page.appearance_overrides.cart_text_colors."))
    return "cart.text";
  if (id.startsWith("page.appearance_overrides.section_colors.categoryBar"))
    return "page.category_bar";
  if (id.startsWith("page.appearance_overrides.order_type_selector."))
    return "page.order_type_selector";
  if (id === "page.title") return "page.identity";
  if (id === "page.slug" || id === "page.type" || id === "page.nav_visible")
    return "page.address";
  if (id.startsWith("page.seo.")) return "page.seo";
  if (id.startsWith("page.settings.")) return "page.commerce";
  return null;
}

test("navigation text colors have editor-to-renderer contracts", () => {
  const contracts = new Map(
    FIELD_CONTRACTS.map((contract) => [contract.id, contract]),
  );

  assert.deepEqual(
    contracts.get("site.navbar_overlay_text_color")?.statePath,
    ["config", "navbar_overlay_text_color"],
  );
  assert.deepEqual(contracts.get("site.navbar_text_color")?.statePath, [
    "config",
    "navbar_text_color",
  ]);
});

test("page navigation visuals have editor-to-renderer contracts", () => {
  const contracts = new Map(
    FIELD_CONTRACTS.map((contract) => [contract.id, contract]),
  );

  const expected = [
    ["page.appearance_overrides.navbar_style", "navbar_style", "overlay"],
    ["page.appearance_overrides.navbar_color", "navbar_color", "#FAF1D2"],
    ["page.appearance_overrides.navbar_text_color", "navbar_text_color", "#253265"],
    [
      "page.appearance_overrides.navbar_overlay_text_color",
      "navbar_overlay_text_color",
      "#F8FAFC",
    ],
  ] as const;

  expected.forEach(([id, field, testValue]) => {
    const contract = contracts.get(id);
    assert.deepEqual(contract?.statePath, ["appearance_overrides", field]);
    assert.equal(contract?.editor.tab, "Apparence");
    assert.equal(contract?.editor.commit, "change");
    assert.equal(contract?.testValue, testValue);
  });
});

test("component appearance fields map to exact normalized draft paths", () => {
  const contracts = new Map(
    FIELD_CONTRACTS.map((contract) => [contract.id, contract]),
  );
  const expected = task4FieldPaths();
  const task4ContractIds = Array.from(contracts.keys()).filter(isTask4Field);

  assert.deepEqual(
    task4ContractIds.sort(),
    Array.from(expected.keys()).sort(),
    "every Task 4 contract must declare its exact normalized path",
  );

  expected.forEach((path, id) => {
    assert.deepEqual(contracts.get(id)?.statePath, path, id);
  });
  assert.equal(
    contracts.get("site.footer.settings.custom_bg")?.editor.scope,
    "site",
  );
  assert.deepEqual(
    contracts.get(
      "page.appearance_overrides.navbar_cta.transparent.variant",
    )?.editor.prerequisite,
    { id: "page.appearance_overrides.navbar_cta", value: true },
  );
  assert.equal(
    contracts.get(
      "page.appearance_overrides.section_colors.categoryBar.bg",
    )?.editor.pageTitle,
    "Brunch Order",
  );
  assert.equal(
    contracts.get("section.settings.card_bg")?.editor.sectionLabel,
    "Menu highlights",
  );
  for (const network of ["instagram", "facebook", "tiktok", "whatsapp"]) {
    const contract = contracts.get(`site.footer.content.social_links.${network}`);
    assert.equal(
      contract?.preview.expected,
      JSON.stringify([{ platform: network, url: contract?.testValue }]),
      network,
    );
    assert.equal(contract?.public.expected, contract?.preview.expected, network);
  }
});

function task4FieldPaths(): Map<string, readonly (string | number)[]> {
  const paths = new Map<string, readonly (string | number)[]>();
  for (const field of ["enabled", "text", "link", "shape", "size"]) {
    paths.set(`site.navbar_cta.${field}`, ["config", "navbar_cta", field]);
  }
  for (const surface of ["transparent", "solid"]) {
    for (const field of ["variant", "bg", "text_color", "border_color"]) {
      paths.set(`site.navbar_cta.${surface}.${field}`, [
        "config",
        "navbar_cta",
        surface,
        field,
      ]);
      paths.set(`page.appearance_overrides.navbar_cta.${surface}.${field}`, [
        "appearance_overrides",
        "navbar_cta",
        surface,
        field,
      ]);
    }
  }
  paths.set("page.appearance_overrides.navbar_cta", [
    "appearance_overrides",
    "navbar_cta",
  ]);
  for (const field of [
    "custom_text",
    "show_logo",
    "show_description",
    "show_address",
    "show_phone",
    "show_hours",
  ]) {
    paths.set(`site.footer.content.${field}`, ["content", field]);
  }
  for (const network of ["instagram", "facebook", "tiktok", "whatsapp"]) {
    paths.set(`site.footer.content.social_links.${network}`, [
      "content",
      "social_links",
    ]);
  }
  paths.set("site.footer.layout", ["layout"]);
  for (const field of [
    "color_style",
    "custom_bg",
    "custom_text",
    "custom_muted",
    "custom_accent",
    "custom_divider",
  ]) {
    paths.set(`site.footer.settings.${field}`, ["settings", field]);
  }
  for (const field of [
    "bg",
    "text",
    "accent",
    "divider",
    "activeBg",
    "activeText",
    "searchBg",
    "searchText",
    "iconBg",
    "icon",
    "cartBg",
    "cartText",
  ]) {
    paths.set(
      `page.appearance_overrides.section_colors.categoryBar.${field}`,
      ["appearance_overrides", "section_colors", "categoryBar", field],
    );
  }
  for (const field of [
    "custom_bg",
    "custom_text",
    "card_bg",
    "card_text",
    "card_muted",
    "price_color",
    "accent_color",
  ]) {
    paths.set(`section.settings.${field}`, ["settings", field]);
  }
  return paths;
}

function isTask4Field(id: string): boolean {
  return (
    id.startsWith("site.navbar_cta") ||
    id.startsWith("page.appearance_overrides.navbar_cta") ||
    id.startsWith("site.footer") ||
    id.startsWith("page.appearance_overrides.section_colors.categoryBar") ||
    [
      "section.settings.custom_bg",
      "section.settings.custom_text",
      "section.settings.card_bg",
      "section.settings.card_text",
      "section.settings.card_muted",
      "section.settings.price_color",
      "section.settings.accent_color",
    ].includes(id)
  );
}

test("builder public addresses present one route for every page kind", () => {
  assert.deepEqual(
    [
      publicAddressForPage({ type: "order", slug: "commander", is_default: true }),
      publicAddressForPage({ type: "catering", slug: "traiteur", is_default: true }),
      publicAddressForPage({ type: "order", slug: "brunch", is_default: false }),
      publicAddressForPage({ type: "content", slug: "notre-histoire", is_default: false }),
      publicAddressForPage({ type: "landing", slug: "accueil", is_default: false }),
    ],
    ["/order", "/catering", "/brunch", "/notre-histoire", "/"],
  );
});

test("builder exposes system links without inventing rail pages", () => {
  const contracts = new Map(
    FIELD_CONTRACTS.map((contract) => [contract.id, contract]),
  );
  assert.deepEqual(contracts.get("site.show_orders_link")?.statePath, [
    "config",
    "show_orders_link",
  ]);
  assert.deepEqual(contracts.get("site.stories_enabled")?.statePath, [
    "live",
    "stories_enabled",
  ]);

  const html = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(SiteInspector, {
        tab: "settings",
        config: { show_orders_link: true, stories_enabled: true },
        restaurantId: 24,
        pages: [],
        footer: null,
        onChange: () => undefined,
        onPageVisibilityChange: () => undefined,
        onFooterChange: () => undefined,
        onStoriesNavigationAvailabilityChange: () => undefined,
        onRestaurantLogoUpload: async () => undefined,
        onRestaurantLogoRemove: async () => undefined,
      }),
    ),
  );

  assert.match(html, /Liens système/);
  assert.match(html, /Instagram non connecté/);
  assert.match(html, /data-field-id="site.show_orders_link"/);
  const storiesToggle = html.match(
    /<input[^>]*data-field-id="site.stories_enabled"[^>]*>/,
  )?.[0];
  assert.ok(storiesToggle, "Stories toggle is rendered");
  assert.match(storiesToggle, /disabled/);
  assert.match(html, /href="\/24\/reels"/);
  assert.doesNotMatch(html, /site\.navigation-page\.(?:home|stories)/);
});

test("builder and Reels share the live Instagram Stories owner", () => {
  const inspector = readFileSync(
    resolve(process.cwd(), "src/components/website-v3/SiteInspector.tsx"),
    "utf8",
  );
  const reels = readFileSync(
    resolve(process.cwd(), "src/app/[restaurantId]/reels/page.tsx"),
    "utf8",
  );

  assert.match(inspector, /loadInstagramStoriesSettings/);
  assert.match(inspector, /updateInstagramStoriesWithRefresh/);
  assert.match(reels, /loadInstagramStoriesSettings/);
  assert.match(reels, /updateInstagramStoriesEnabled/);
  assert.doesNotMatch(inspector, /onChange\(\["stories_enabled"\]/);
});

test("builder refreshes and injects server-owned Stories preview eligibility", () => {
  const inspector = readFileSync(
    resolve(process.cwd(), "src/components/website-v3/SiteInspector.tsx"),
    "utf8",
  );
  const builder = readFileSync(
    resolve(process.cwd(), "src/components/website-v3/WebsiteV3Builder.tsx"),
    "utf8",
  );

  assert.match(inspector, /await updateInstagramStoriesWithRefresh/);
  assert.match(inspector, /setStoriesEnabled\(result\.storiesEnabled\)/);
  assert.match(inspector, /onStoriesNavigationAvailabilityChange\(undefined\)/);
  assert.match(inspector, /Réessayer la vérification/);
  assert.match(inspector, /onStoriesNavigationAvailabilityChange/);
  assert.match(builder, /withWebsiteV3PreviewNavigationState/);
  assert.match(builder, /getPublicRestaurantNavigationState/);
  assert.match(builder, /onStoriesNavigationAvailabilityChange/);
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === "__tests__" ? [] : sourceFiles(path);
    }
    return path.endsWith(".tsx") || path.endsWith(".ts")
      ? [readFileSync(path, "utf8")]
      : [];
  });
}
