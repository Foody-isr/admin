import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_CONTRACTS } from "../field-contracts";
import { SiteInspector } from "../SiteInspector";
import { publicAddressForPage } from "@/lib/website-v3/url-model";

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

  for (const source of [inspector, reels]) {
    assert.match(source, /loadInstagramStoriesSettings/);
    assert.match(source, /updateInstagramStoriesEnabled/);
  }
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

  assert.match(
    inspector,
    /await updateInstagramStoriesEnabled[\s\S]*await loadInstagramStoriesSettings/,
  );
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
