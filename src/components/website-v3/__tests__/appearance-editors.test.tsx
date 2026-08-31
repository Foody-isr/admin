import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type {
  CateringService,
  Menu,
  Restaurant,
  ThemeCatalog,
  WebsiteConfig,
} from "@/lib/api";
import type { DraftPagePayload } from "@/lib/website-v3/types";
import { ThemesPanel } from "@/components/website-menu/ThemesPanel";
import { CategoryBarStateEditor } from "../CategoryBarStateEditor";
import { CategoryNavigationEditor } from "../CategoryNavigationEditor";
import { FIELD_CONTRACTS } from "../field-contracts";
import { FooterEditor } from "../FooterEditor";
import { MenuHighlightsAppearanceEditor } from "../MenuHighlightsAppearanceEditor";
import { NavigationCtaEditor } from "../NavigationCtaEditor";
import { PageInspector } from "../PageInspector";

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
  for (const network of ["instagram", "facebook", "tiktok", "whatsapp"]) {
    assert.match(
      contentMarkup,
      new RegExp(`site\\.footer\\.content\\.social_links\\.${network}`),
    );
  }
  assert.doesNotMatch(
    contentMarkup,
    /data-field-id="site\.footer\.content\.social_links"/,
  );

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

test("category navigation editor exposes responsive layouts and logical sides", () => {
  const automaticMarkup = render(
    React.createElement(CategoryNavigationEditor, {
      value: { mode: "auto", side: "start" },
      onChange: () => undefined,
    }),
  );

  assert.match(automaticMarkup, /<option value="auto" selected="">/);
  assert.match(automaticMarkup, /<option value="horizontal">/);
  assert.match(automaticMarkup, /<option value="sidebar">/);
  assert.match(automaticMarkup, /<option value="start" selected="">/);
  assert.match(automaticMarkup, /<option value="end">/);

  const horizontalMarkup = render(
    React.createElement(CategoryNavigationEditor, {
      value: { mode: "horizontal", side: "end" },
      onChange: () => undefined,
    }),
  );
  assert.doesNotMatch(horizontalMarkup, /<option value="start"/);
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

test("every registered Task 4 contract maps to a rendered editor control", () => {
  const renderedIds = fieldIds(renderTask4Editors());
  const contractIds = new Set(
    FIELD_CONTRACTS.map((contract) => contract.id).filter(isTask4Field),
  );

  assert.deepEqual(
    Array.from(contractIds).sort(),
    Array.from(renderedIds).sort(),
  );
});

test("ThemesPanel can delegate the normal category palette to its state editor", () => {
  const defaultMarkup = render(
    React.createElement(ThemesPanel, {
      config: {
        theme_id: "editorial-light",
        brand_color: null,
        custom_palette: null,
        section_colors: { categoryBar: { bg: "#ffffff" } },
      } as WebsiteConfig,
      catalog: themeCatalog(),
      onUpdate: () => undefined,
    }),
  );
  const delegatedMarkup = render(
    React.createElement(ThemesPanel, {
      config: {
        theme_id: "editorial-light",
        brand_color: null,
        custom_palette: null,
        section_colors: { categoryBar: { bg: "#ffffff" } },
      } as WebsiteConfig,
      catalog: themeCatalog(),
      excludedSectionColors: ["categoryBar"],
      onUpdate: () => undefined,
    }),
  );

  assert.match(defaultMarkup, /data-section-color-key="categoryBar"/);
  assert.doesNotMatch(delegatedMarkup, /data-section-color-key="categoryBar"/);
});

test("order page appearance renders one normal category palette owner", () => {
  const page: DraftPagePayload = {
    tmp_id: "order-page",
    type: "order",
    slug: "order",
    title: "Order",
    sort_order: 0,
    nav_visible: true,
    is_homepage: false,
    is_default: true,
    seo: {},
    appearance_overrides: {
      theme_id: "editorial-light",
      section_colors: { categoryBar: { bg: "#ffffff" } },
    },
    settings: { menu_ids: [] },
  };
  const markup = render(
    React.createElement(PageInspector, {
      page,
      tab: "appearance",
      surface: "page" as const,
      onSurfaceChange: () => undefined,
      restaurantId: 24,
      restaurant: {} as Restaurant,
      config: {},
      onConfigChange: () => undefined,
      catalog: themeCatalog(),
      menus: [] as Menu[],
      services: [] as CateringService[],
      errors: [],
      onChange: () => undefined,
      onReplace: () => undefined,
      onMakeDefault: () => undefined,
      onMakeHomepage: () => undefined,
    }),
  );

  assert.match(
    markup,
    /page\.appearance_overrides\.section_colors\.categoryBar\.bg/,
  );
  assert.doesNotMatch(markup, /data-section-color-key="categoryBar"/);
});

function renderTask4Editors(): string {
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
  return [
    render(
      React.createElement(NavigationCtaEditor, {
        value: {},
        allowInherit: false,
        onChange: () => undefined,
      }),
    ),
    render(
      React.createElement(NavigationCtaEditor, {
        value: { transparent: {}, solid: {} },
        inherited: {},
        allowInherit: true,
        onChange: () => undefined,
      }),
    ),
    render(
      React.createElement(FooterEditor, {
        footer,
        tab: "content",
        onChange: () => undefined,
      }),
    ),
    render(
      React.createElement(FooterEditor, {
        footer,
        tab: "appearance",
        onChange: () => undefined,
      }),
    ),
    render(
      React.createElement(CategoryBarStateEditor, {
        value: { categoryBar: {}, categoryBarSticky: {} },
        onChange: () => undefined,
      }),
    ),
    render(
      React.createElement(MenuHighlightsAppearanceEditor, {
        value: {},
        onChange: () => undefined,
      }),
    ),
  ].join("\n");
}

function fieldIds(markup: string): Set<string> {
  return new Set(
    Array.from(markup.matchAll(/data-field-id="([^"]+)"/g), (match) => match[1]),
  );
}

function isTask4Field(id: string): boolean {
  return (
    id.startsWith("site.navbar_cta") ||
    id.startsWith("page.appearance_overrides.navbar_cta") ||
    id.startsWith("site.footer") ||
    id.startsWith("page.appearance_overrides.section_colors.categoryBar") ||
    [
      "section.settings.custom_bg",
      "section.settings.custom_text",
      "section.settings.card_bg",
      "section.settings.card_text",
      "section.settings.card_muted",
      "section.settings.price_color",
      "section.settings.accent_color",
    ].includes(id)
  );
}

function themeCatalog(): ThemeCatalog {
  return {
    themes: [
      {
        id: "editorial-light",
        name: "Editorial",
        description: "Editorial theme",
        mode: "light",
        preview: {
          swatches: ["#ffffff", "#f8fafc", "#315fce", "#111827"],
          sampleImage: "",
        },
        suggestedFor: [],
        tokens: {},
        layout: {},
      },
    ],
    typography_pairings: [],
  };
}
