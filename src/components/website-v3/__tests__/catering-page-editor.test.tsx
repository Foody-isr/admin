import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { CateringService } from "@/lib/api";
import type { DraftPagePayload } from "@/lib/website-v3/types";
import { CateringPageEditor } from "../CateringPageEditor";

Object.assign(globalThis, { React });
function render(appearance: DraftPagePayload["appearance_overrides"] = {}) {
  return renderToStaticMarkup(React.createElement(LocaleProvider, null, React.createElement(CateringPageEditor, {
    restaurantId: 24,
    page: {id: 7, type: "catering", slug: "events", title: "Events", sort_order: 0, is_default: true, is_homepage: false, nav_visible: true, seo: {}, appearance_overrides: appearance, settings: {service_ids: []}},
    services: [{id: 7, name: "Weekly Event", description: "A reception", is_active: true}] as CateringService[],
    onChange: () => undefined,
  })));
}

test("catering retains copy and per-service subtitles in its contextual editor", () => {
  const markup = render();
  for (const field of ["hero_title", "hero_subtitle", "show_restaurant_name", "chooser_title", "chooser_subtitle", "service_subtitles.7", "show_steps"]) {
    assert.ok(markup.includes(`catering_page.${field}`), field);
  }
  assert.match(markup, /\/24\/catering\/services/);
  assert.doesNotMatch(markup, /page\.theme|page\.typography|page\.identity|page\.seo|Cartes associées/);
});

test("catering keeps its cover upload and an explicit removed image never inherits", () => {
  const markup = render({cover_url: "https://example.test/historical.jpg", catering_page: {cover_url: ""}});
  assert.match(markup, /data-media-field="page\.appearance_overrides\.catering_page\.cover_url"/);
  assert.match(markup, /Choose and upload a photo/);
  assert.doesNotMatch(markup, /historical\.jpg/);
});

test("catering inherits a historical cover until its own cover is authored", () => {
  assert.match(render({cover_url: "https://example.test/historical.jpg"}), /historical\.jpg/);
  assert.match(render({cover_url: "https://example.test/historical.jpg", catering_page: {cover_url: "https://example.test/current.jpg"}}), /current\.jpg/);
});
