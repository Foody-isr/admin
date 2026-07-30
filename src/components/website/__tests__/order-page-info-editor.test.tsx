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
