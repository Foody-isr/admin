import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuilderShell } from "../BuilderShell";
import { publicURLForPage } from "@/lib/website-v3/url-model";

Object.assign(globalThis, { React });

/** The opening tag of the Publier button, so `disabled:` utility classes in the
 *  className cannot be mistaken for the disabled attribute. */
function publishButtonTag(markup: string): string {
  const end = markup.indexOf(">", markup.lastIndexOf("<button", markup.indexOf("Publier")));
  return markup.slice(markup.lastIndexOf("<button", markup.indexOf("Publier")), end + 1);
}

test("builder shell exposes a collapsible page rail", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BuilderShell, {
      restaurantId: 24,
      restaurantName: "Moulin Dorée",
      status: "idle",
      previewStatus: "synced",
      device: "desktop",
      publicUrl: null,
      publishBlockedReason: null,
      busy: false,
      onDeviceChange: () => undefined,
      onDiscard: () => undefined,
      onPublish: () => undefined,
      rail: React.createElement("div", null, "Pages"),
      inspector: React.createElement("div", null, "Inspecteur"),
      preview: React.createElement("div", null, "Aperçu"),
    }),
  );

  assert.match(markup, /Réduire le panneau des pages/);
  assert.match(markup, /grid-template-columns:240px/);
});

// A disabled Publish button is a dead end: the reason it refuses lives in the
// inspector of one page and one tab, which is usually not the one on screen.
test("builder shell keeps Publier clickable and states why it would refuse", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BuilderShell, {
      restaurantId: 24,
      restaurantName: "Mamie",
      status: "idle",
      previewStatus: "synced",
      device: "desktop",
      publicUrl: null,
      publishBlockedReason: "Vérifiez la dernière version sur l’aperçu mobile avant de publier.",
      busy: false,
      onDeviceChange: () => undefined,
      onDiscard: () => undefined,
      onPublish: () => undefined,
      rail: null,
      inspector: null,
      preview: null,
    }),
  );

  assert.doesNotMatch(publishButtonTag(markup), /disabled=""/);
  assert.match(markup, /aperçu mobile avant de publier/);
});

test("builder shell disables Publier only while a lifecycle is running", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BuilderShell, {
      restaurantId: 24,
      restaurantName: "Mamie",
      status: "saving",
      previewStatus: "synced",
      device: "desktop",
      publicUrl: null,
      publishBlockedReason: null,
      busy: true,
      onDeviceChange: () => undefined,
      onDiscard: () => undefined,
      onPublish: () => undefined,
      rail: null,
      inspector: null,
      preview: null,
    }),
  );

  assert.match(publishButtonTag(markup), /disabled=""/);
});

test("builder shell opens every page at its public canonical address", () => {
  const cases = [
    {
      page: { type: "landing" as const, slug: "accueil", is_default: false },
      expected: "https://app.foody-pos.co.il/r/mamie",
    },
    {
      page: { type: "order" as const, slug: "menu", is_default: true },
      expected: "https://app.foody-pos.co.il/r/mamie/order",
    },
    {
      page: { type: "catering" as const, slug: "traiteur", is_default: true },
      expected: "https://app.foody-pos.co.il/r/mamie/catering",
    },
    {
      page: { type: "order" as const, slug: "brunch", is_default: false },
      expected: "https://app.foody-pos.co.il/r/mamie/brunch",
    },
  ];

  for (const entry of cases) {
    const publicUrl = publicURLForPage({
      webOrigin: "https://app.foody-pos.co.il",
      restaurantSlug: "mamie",
      page: entry.page,
    });
    const markup = renderToStaticMarkup(
      React.createElement(BuilderShell, {
        restaurantId: 24,
        restaurantName: "Mamie",
        status: "idle",
        previewStatus: "synced",
        device: "desktop",
        publicUrl,
        publishBlockedReason: null,
        busy: false,
        onDeviceChange: () => undefined,
        onDiscard: () => undefined,
        onPublish: () => undefined,
        rail: null,
        inspector: null,
        preview: null,
      }),
    );
    assert.match(markup, new RegExp(`href="${entry.expected}"`));
  }
});
