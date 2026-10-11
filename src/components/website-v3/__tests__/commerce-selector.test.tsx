import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { Menu } from "@/lib/api";
import { CommerceSelector } from "../CommerceSelector";

Object.assign(globalThis, { React });

function render(menus: Partial<Menu>[], ids: number[]) {
  return renderToStaticMarkup(
    <LocaleProvider>
      <CommerceSelector
        page={{ type: "order", slug: "order", title: "Order", sort_order: 0,
          nav_visible: true, is_default: true, is_homepage: true,
          appearance_overrides: {}, seo: {}, settings: { menu_ids: ids } }}
        menus={menus as Menu[]}
        onChange={() => assert.fail("rendering must not update the draft")}
      />
    </LocaleProvider>,
  );
}

test("page menu choices follow Web eligibility independently of the POS channel", () => {
  const markup = render([
    { id: 1, name: "Web only", web_enabled: true, pos_enabled: false },
    { id: 2, name: "Both channels", web_enabled: true, pos_enabled: true },
    { id: 3, name: "Till only", web_enabled: false, pos_enabled: true },
  ], [1]);
  const rows = markup.match(/<label\b.*?<\/label>/g)!;
  assert.equal(rows.length, 2);
  assert.match(rows[0], /Web only/);
  assert.match(rows[0], /checked=""/);
  assert.match(rows[1], /Both channels/);
  assert.doesNotMatch(rows[1], /checked=""/);
  assert.doesNotMatch(markup, /Till only/);
  assert.match(markup, /aria-describedby=/);
  assert.match(markup, /Enable the Web channel/);
});

test("a selected menu that loses Web eligibility stays removable and is never silently dropped", () => {
  const markup = render([{ id: 3, name: "Till only", web_enabled: false }], [3]);
  assert.match(markup, /Unavailable menu #3/);
  assert.match(markup, /type="checkbox"[^>]*checked=""/);
  assert.match(markup, /No menus are enabled for the Web channel/);
});
