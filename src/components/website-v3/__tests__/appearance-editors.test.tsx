import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { CategoryBarStateEditor } from "../CategoryBarStateEditor";
import { FooterEditor } from "../FooterEditor";
import { MenuHighlightsAppearanceEditor } from "../MenuHighlightsAppearanceEditor";
import { NavigationCtaEditor } from "../NavigationCtaEditor";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(LocaleProvider, null, element),
  );
}

test("global navigation CTA exposes content and both surface states", () => {
  const markup = render(
    React.createElement(NavigationCtaEditor, {
      value: {},
      allowInherit: false,
      onChange: () => undefined,
    }),
  );

  assert.match(markup, /site\.navbar_cta\.enabled/);
  assert.match(markup, /site\.navbar_cta\.text/);
  assert.match(markup, /site\.navbar_cta\.transparent\.variant/);
  assert.match(markup, /site\.navbar_cta\.transparent\.border_color/);
  assert.match(markup, /site\.navbar_cta\.solid\.variant/);
  assert.match(markup, /site\.navbar_cta\.solid\.border_color/);
});

test("page navigation CTA starts inherited and reveals sparse state controls", () => {
  const inheritedMarkup = render(
    React.createElement(NavigationCtaEditor, {
      value: {},
      inherited: { text: "Order", solid: { variant: "filled" } },
      allowInherit: true,
      onChange: () => undefined,
    }),
  );
  assert.match(
    inheritedMarkup,
    /page\.appearance_overrides\.navbar_cta/,
  );
  assert.doesNotMatch(
    inheritedMarkup,
    /page\.appearance_overrides\.navbar_cta\.transparent\.variant/,
  );

  const customMarkup = render(
    React.createElement(NavigationCtaEditor, {
      value: { transparent: {}, solid: {} },
      inherited: { text: "Order", solid: { variant: "filled" } },
      allowInherit: true,
      onChange: () => undefined,
    }),
  );
  assert.match(
    customMarkup,
    /page\.appearance_overrides\.navbar_cta\.transparent\.variant/,
  );
});

test("footer exposes content and appearance fields in their tabs", () => {
  const footer = {
    tmp_id: "site-footer",
    section_type: "footer",
    page: "_site",
    sort_order: 0,
    is_visible: true,
    layout: "columns",
    content: {},
    settings: {},
  };
  const contentMarkup = render(
    React.createElement(FooterEditor, {
      footer,
      tab: "content",
      onChange: () => undefined,
    }),
  );
  assert.match(contentMarkup, /site\.footer\.content\.custom_text/);
  assert.match(contentMarkup, /site\.footer\.content\.show_logo/);
  assert.match(contentMarkup, /site\.footer\.content\.show_description/);
  assert.match(contentMarkup, /site\.footer\.content\.social_links/);

  const appearanceMarkup = render(
    React.createElement(FooterEditor, {
      footer,
      tab: "appearance",
      onChange: () => undefined,
    }),
  );
  assert.match(appearanceMarkup, /site\.footer\.layout/);
  assert.match(appearanceMarkup, /site\.footer\.settings\.custom_bg/);
  assert.match(appearanceMarkup, /site\.footer\.settings\.custom_muted/);
  assert.match(appearanceMarkup, /site\.footer\.settings\.custom_accent/);
  assert.match(appearanceMarkup, /site\.footer\.settings\.custom_divider/);
});

test("category bar editor exposes normal and customized sticky palettes", () => {
  const markup = render(
    React.createElement(CategoryBarStateEditor, {
      value: {
        categoryBar: { bg: "#ffffff", text: "#111827" },
        categoryBarSticky: {},
      },
      onChange: () => undefined,
    }),
  );

  assert.match(
    markup,
    /page\.appearance_overrides\.section_colors\.categoryBar\.bg/,
  );
  assert.match(
    markup,
    /page\.appearance_overrides\.section_colors\.categoryBarSticky\.bg/,
  );
  assert.match(
    markup,
    /page\.appearance_overrides\.section_colors\.categoryBarSticky\.divider/,
  );
});

test("menu highlights editor exposes section and card palette fields", () => {
  const markup = render(
    React.createElement(MenuHighlightsAppearanceEditor, {
      value: {},
      onChange: () => undefined,
    }),
  );

  assert.match(markup, /section\.settings\.custom_bg/);
  assert.match(markup, /section\.settings\.custom_text/);
  assert.match(markup, /section\.settings\.card_bg/);
  assert.match(markup, /section\.settings\.card_text/);
  assert.match(markup, /section\.settings\.card_muted/);
  assert.match(markup, /section\.settings\.price_color/);
  assert.match(markup, /section\.settings\.accent_color/);
});
