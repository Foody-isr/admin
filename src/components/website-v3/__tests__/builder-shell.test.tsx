import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuilderShell } from "../BuilderShell";
import { publicURLForPage } from "@/lib/website-v3/url-model";

Object.assign(globalThis, { React });

test("builder shell exposes a collapsible page rail", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BuilderShell, {
      restaurantId: 24,
      restaurantName: "Moulin Dorée",
      status: "idle",
      previewStatus: "synced",
      device: "desktop",
      publicUrl: null,
      canPublish: true,
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
        canPublish: true,
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
