import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuilderShell } from "../BuilderShell";

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
