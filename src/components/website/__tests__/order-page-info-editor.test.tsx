import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderPageInfoEditor } from "../OrderPageInfoEditor";

test("legacy partial order info falls back to complete bar defaults", () => {
  Object.assign(globalThis, { React });

  const markup = renderToStaticMarkup(
    React.createElement(OrderPageInfoEditor, {
      value: {
        modal: ["about"],
        modal_text: "Informations",
      } as unknown as import("@/lib/api").OrderPageInfo,
      availableModes: ["pickup"],
      locked: false,
      onChange: () => undefined,
    }),
  );

  assert.match(markup, /Pré-commande \/ semaine/);
  assert.match(markup, /À propos \(texte\)/);
  assert.match(markup, /aria-checked="true"/);
});

test("page discovery controls expose responsive presentation and published pages", () => {
  Object.assign(globalThis, { React });

  const markup = renderToStaticMarkup(
    React.createElement(OrderPageInfoEditor, {
      value: {
        bar: { pickup: ["more"], delivery: ["more"], dine_in: ["more"] },
        modal: ["about"],
        navigation: {
          desktop_style: "buttons",
          mobile_style: "banner",
          featured_page_slug: "traiteur",
          discover_enabled: true,
          discover_page_slugs: ["traiteur", "histoire"],
        },
      } as import("@/lib/api").OrderPageInfo,
      pages: [
        { slug: "commande", label: "Commander", type: "order" },
        { slug: "traiteur", label: "Traiteur", type: "catering" },
        { slug: "histoire", label: "Notre histoire", type: "content" },
      ],
      availableModes: ["pickup"],
      locked: false,
      onChange: () => undefined,
    }),
  );

  assert.match(markup, /Navigation depuis la commande/);
  assert.match(markup, /Bandeau promotionnel/);
  assert.match(markup, /Traiteur/);
  assert.match(markup, /Notre histoire/);
  assert.doesNotMatch(markup, />Commander<\/option>/);
});
