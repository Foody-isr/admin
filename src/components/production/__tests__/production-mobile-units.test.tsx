import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { ProductionToPrepare } from "../ProductionToPrepare";
import { DEFAULT_PORTIONING, makePortioner } from "@/lib/production";
import type { ProductionSheetResponse } from "@/lib/api";

// The phone cook-list used to read `item.total` directly, so an article flipped
// to "Unités" showed grams on a phone and ordered containers on a desktop — the
// same sheet portioned two ways. Asserting on rendered markup, not on the
// helper, is the point: the helper was never the thing that was missing.

function sheet(): ProductionSheetResponse {
  return {
    date: "2026-08-10",
    categories: [{ id: 1, name: "Salades", measure: "weight", item_ids: [7] }],
    items: [
      {
        menu_item_id: 7,
        name: "Patate Douce",
        category_id: 1,
        measure: "weight",
        total: 3000,
        total_units: 6,
        unit: "g",
      },
    ],
    orders: [
      {
        order_id: 1,
        customer_name: "Ouriel",
        order_type: "pickup",
        cells: { "7": 3000 },
        units: { "7": 6 },
      },
    ],
  };
}

function render(unitDisplayIds?: Set<number>): string {
  Object.assign(globalThis, { React });
  return renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(ProductionToPrepare, {
        sheet: sheet(),
        portioner: makePortioner(DEFAULT_PORTIONING, {}),
        unitDisplayIds,
      }),
    ),
  );
}

test("the phone cook-list shows ordered containers when the article is in units display", () => {
  const markup = render(new Set([7]));
  assert.match(markup, /6 u\./);
  // The grams total must be gone, not merely accompanied.
  assert.doesNotMatch(markup, /3,?\s?000/);
});

test("the phone cook-list shows grams when no units preference is set", () => {
  const markup = render(undefined);
  assert.match(markup, /3,?\s?000/);
  assert.doesNotMatch(markup, /u\./);
});
