import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { normalizeDraftState } from "@/lib/website-v3/state";
import { normalizeWebsiteHeader, orderHeaderPresentation } from "@/lib/website-v3/header";
import { HeaderInspector } from "../HeaderInspector";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function render(type: "order" | "landing", custom = false) {
  const shared = normalizeWebsiteHeader({layout: "center"});
  const state = normalizeDraftState({config: {nav_layout: {header: shared}}, pages: [{
    tmp_id: "page", type, slug: "page", title: "Page", settings: {menu_ids: [1]},
    appearance_overrides: custom ? {order_header: orderHeaderPresentation(normalizeWebsiteHeader({...shared, layout: "restaurant"}))} : {},
  }], sections: []});
  return renderToStaticMarkup(React.createElement(LocaleProvider, null,
    React.createElement(HeaderInspector, {
      config: state.config, pages: state.pages, page: state.pages[0], sections: [],
      restaurantId: 1, onChange: () => {}, onOrderHeaderChange: () => {},
    })));
}

test("order header offers one scope selector; regular pages keep the existing inspector", () => {
  assert.match(render("order"), /value="inherit" selected=""/);
  assert.match(render("order"), /Customizing its appearance here only changes this order page/);
  assert.doesNotMatch(render("landing"), /Order page header/);
  assert.match(render("landing"), /Also applies to the navigation menu/);
});

test("custom order header reuses layouts and styles without offering duplicate navigation content", () => {
  const html = render("order", true);
  assert.match(html, /value="custom" selected=""/);
  assert.match(html, /Logo and navigation links stay shared/);
  assert.match(html, /Restaurant: cover, framed logo and hamburger/);
  assert.doesNotMatch(html, /Edit links/);
  assert.doesNotMatch(html, /data-header-panel="fulfillment"/);
  assert.match(html, /Information and ordering/);
});
