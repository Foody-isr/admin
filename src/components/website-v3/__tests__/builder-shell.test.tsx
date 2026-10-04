import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuilderShell } from "../BuilderShell";
import { LocaleProvider } from "@/lib/i18n";
import { publicURLForPage } from "@/lib/website-v3/url-model";
Object.assign(globalThis, { React });
const noop = () => undefined;
function render(
  patch: Partial<React.ComponentProps<typeof BuilderShell>> = {},
) {
  return renderToStaticMarkup(
    <LocaleProvider>
      {React.createElement(BuilderShell, {
        status: "idle",
        previewStatus: "synced",
        device: "desktop",
        publicUrl: null,
        publishBlockedReason: null,
        busy: false,
        onDeviceChange: noop,
        onDiscard: noop,
        onPublish: noop,
        onUndo: noop,
        onRedo: noop,
        canUndo: false,
        canRedo: false,
        sidebar: React.createElement("div", null, "Pages and settings"),
        preview: React.createElement("div", null, "Live site"),
        previewOnly: false,
        onPreviewChange: noop,
        ...patch,
      })}
    </LocaleProvider>,
  );
}
function publishButtonTag(markup: string) {
  const start = markup.lastIndexOf("<button", markup.indexOf("Publish"));
  return markup.slice(start, markup.indexOf(">", start) + 1);
}
test("one contextual sidebar accompanies the persistent site preview", () => {
  const markup = render();
  assert.equal((markup.match(/<aside/g) ?? []).length, 1);
  assert.match(markup, /Pages and settings/);
  assert.match(markup, /Live site/);
});
test("preview hides editing controls while retaining the site", () => {
  const markup = render({ previewOnly: true });
  assert.match(markup, /<aside[^>]+hidden=""/);
  assert.match(markup, /Live site/);
  assert.doesNotMatch(markup, /aria-label="Undo"/);
});
test("publishing states why it would refuse and stays clickable outside a lifecycle", () => {
  const markup = render({ publishBlockedReason: "Check the mobile preview." });
  assert.doesNotMatch(publishButtonTag(markup), /disabled=""/);
  assert.match(markup, /Check the mobile preview/);
  assert.match(publishButtonTag(render({ busy: true })), /disabled=""/);
});
test("public links preserve canonical commerce routes", () => {
  for (const [type, slug, isDefault, expected] of [
    ["landing", "accueil", false, ""],
    ["order", "menu", true, "/order"],
    ["catering", "traiteur", true, "/catering"],
    ["order", "brunch", false, "/brunch"],
  ] as const) {
    const url = publicURLForPage({
      webOrigin: "https://app.foody-pos.co.il",
      restaurantSlug: "mamie",
      page: { type, slug, is_default: isDefault },
    });
    assert.match(
      render({ publicUrl: url }),
      new RegExp(`href="https://app.foody-pos.co.il/r/mamie${expected}"`),
    );
  }
});
