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
import { FooterBrandingEditor } from "../FooterBrandingEditor";
import { FooterEditor } from "../FooterEditor";
import { MenuHighlightsAppearanceEditor } from "../MenuHighlightsAppearanceEditor";
import { NavigationCtaEditor } from "../NavigationCtaEditor";
import { PageInspector } from "../PageInspector";
import { SiteInspector } from "../SiteInspector";
import { OrderJourneyEditor } from "../OrderJourneyEditor";
import { OrderPageEditor } from "../OrderPageEditor";
import { HeaderInspector } from "../HeaderInspector";
import { normalizeWebsiteHeader } from "@/lib/website-v3/header";
import { SiteColorsEditor } from "../SiteColorsEditor";
import { normalizeSiteColors } from "@/lib/website-v3/site-colors";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(LocaleProvider, null, element),
  );
}

test("order menu reuses shared styles instead of competing local colors and retains independent shapes", () => {
  const markup = render(React.createElement(OrderPageEditor, {
    restaurantId: 24,
    page: { type: "order", slug: "order", title: "Order", sort_order: 0,
      nav_visible: true, is_homepage: false, is_default: true, seo: {}, settings: { menu_ids: [1] },
      appearance_overrides: { website_order: { card_style: "filled", card_radius: "soft", image_radius: "rounded", show_descriptions: true } } },
    region: "order-items", onChange: () => undefined, onPreviewItem: () => undefined,
  }));
  assert.doesNotMatch(markup, /website_order\.(card_color_style|category_color_style|card_background|card_title_color|card_price_color|card_description_color)/);
  assert.doesNotMatch(markup, /section_colors\.categoryBar/);
  assert.match(markup, /One shared style controls the list/);
  assert.match(markup, /Edit colors in this style/);
  assert.doesNotMatch(markup, /Style accent/);
  assert.match(markup, /value="soft" selected=""/);
  assert.match(markup, /value="rounded" selected=""/);
  assert.match(markup, /Use the previous menu layout/);
  assert.doesNotMatch(markup, /categoryBarSticky\./);
});

test("category headings have a visible toggle; menu headings follow the number of menus", () => {
  const markup = render(React.createElement(OrderPageEditor, {
    restaurantId: 24,
    page: { type: "order", slug: "order", title: "Order", sort_order: 0,
      nav_visible: true, is_homepage: false, is_default: true, seo: {}, settings: { menu_ids: [1] },
      appearance_overrides: { website_order: {
      show_category_titles: true,
    } } },
    region: "order-items",
    onChange: () => undefined,
    onPreviewItem: () => undefined,
  }));
  assert.doesNotMatch(markup, /Menu titles/);
  assert.match(markup, /Category titles<\/span><input[^>]*role="switch"[^>]*checked/);
  assert.match(markup, /Category title style/);
});

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

test("site settings delegate to Header while unmigrated page navigation remains compatible", () => {
  const page: DraftPagePayload = {
    tmp_id: "landing-page",
    type: "landing",
    slug: "home",
    title: "Accueil",
    sort_order: 0,
    nav_visible: true,
    is_homepage: true,
    is_default: false,
    seo: {},
    appearance_overrides: {},
    settings: {},
  };
  const siteMarkup = render(
    React.createElement(SiteInspector, {
      onCreateFooter: () => undefined,
      sections: [],
      tab: "settings",
      config: {},
      restaurantId: 24,
      pages: [page],
      footer: null,
      onChange: () => undefined,
      onPageVisibilityChange: () => undefined,
      onFooterChange: () => undefined,
      onStoriesNavigationAvailabilityChange: () => undefined,
      onRestaurantLogoUpload: async () => undefined,
      onRestaurantLogoRemove: async () => undefined,
    }),
  );
  const pageMarkup = render(
    React.createElement(PageInspector, {
      page,
      tab: "settings",
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

  assert.doesNotMatch(siteMarkup, /<option value="slim">/);
  assert.equal(pageMarkup.match(/<option value="slim">/g)?.length, 2);
  assert.doesNotMatch(siteMarkup, /site.navbar/);
  assert.equal(pageMarkup.match(/<option value="compact_no_logo">/g)?.length, 2);
  assert.match(siteMarkup, /Modifier l’en-tête/);
  assert.match(pageMarkup, /Position du logo/);
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

test("category bar editor exposes one consistent palette", () => {
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
  for (const field of [
    "activeBg",
    "activeText",
    "searchBg",
    "searchText",
    "iconBg",
    "icon",
    "cartBg",
    "cartText",
  ]) {
    assert.match(
      markup,
      new RegExp(
        `page\\.appearance_overrides\\.section_colors\\.categoryBar\\.${field}`,
      ),
    );
  }
  assert.doesNotMatch(markup, /categoryBarSticky/);
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

  for (const id of Array.from(contractIds)) assert.ok(renderedIds.has(id), `Missing registered control ${id}`);
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
  const element = React.createElement(PageInspector, {
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
    });
  const markup = render(element);

  assert.match(
    markup,
    /page\.appearance_overrides\.section_colors\.categoryBar\.bg/,
  );
  assert.doesNotMatch(markup, /data-section-color-key="categoryBar"/);
  const sharedMarkup = render(React.cloneElement(element, {
    config: { custom_palette: { color_styles: { version: 1 } } },
  }));
  assert.doesNotMatch(sharedMarkup, /page\.appearance_overrides\.section_colors\.categoryBar\.bg/);
  assert.match(sharedMarkup, /Edit color styles/);
  assert.match(sharedMarkup, /Bar, text, active pills and search use this shared style/);

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
    id.startsWith("site.footer.") ||
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


test("footer branding has separate controls and stores fields in the shared palette", () => {
  const html = render(React.createElement(FooterBrandingEditor, { config: {custom_palette: {footer_branding:{enabled:true,background:"#234537"}}}, onChange:()=>undefined }));
  const ids = fieldIds(html);
  for (const key of ["enabled", "background"]) {
    const id = `site.footer_branding.${key}`;
    assert.ok(ids.has(id));
    assert.deepEqual(FIELD_CONTRACTS.find(contract=>contract.id===id)?.statePath, ["config", "custom_palette", "footer_branding", key]);
  }
});


test("global menu color editing targets the requested style without moving the site default", () => {
  const colors = normalizeSiteColors({});
  const palette = { color_styles: colors };
  const before = JSON.stringify(palette);
  const markup = render(React.createElement(SiteColorsEditor, {
    palette, target: { styleId: "style-2", menuGroup: "cards" }, onChange: () => assert.fail("selection must not save"),
  }));
  assert.equal(JSON.stringify(palette), before);
  assert.match(markup, /aria-label="Color style 2" aria-pressed="true"/);
  assert.match(markup, /Use by default/);
  assert.match(markup, /data-color-role="menu.card_price"/);
  assert.match(markup, /data-color-role="menu.card_description"/);
  assert.match(markup, /Automatic/);
  assert.match(markup, /<details class="sqe-menu-color-details" open=""/);
});

test("global menu color details stay collapsed in the ordinary site design view", () => {
  const markup = render(React.createElement(SiteColorsEditor, { palette: {}, onChange: () => undefined }));
  assert.match(markup, /<details class="sqe-menu-color-details">/);
  assert.match(markup, /Site default/);
  assert.doesNotMatch(markup, /Use by default/);
});


test("Restaurant is a layout in the shared header editor with no local color controls", () => {
  const markup = render(React.createElement(HeaderInspector, {restaurantId:1, config:{nav_layout:{header:normalizeWebsiteHeader({layout:"restaurant", background:{mode:"image"}})}}, pages:[], sections:[], onChange:()=>undefined}));
  assert.match(markup, /Restaurant: cover, framed logo and hamburger/);
  assert.match(markup, /Information and ordering/);
  assert.doesNotMatch(markup, /Dropdown|Mega menu|Header scroll settings/);
  assert.doesNotMatch(markup, /type="color"/);
});


test("journey colours reuse six global styles and an explicit menu-inheritance choice", () => {
  const noop = () => undefined;
  const markup = render(<OrderJourneyEditor restaurantId={24} colorStyle="style-2"
    colors={{cart: "style-5"}} onColorsChange={noop} screen="cart" onScreenChange={noop}
    orderType="pickup" onOrderTypeChange={noop} value={null} onChange={noop}
    placesAvailable={false} onEditCartButton={noop} />);
  assert.match(markup, /Same as menu/);
  assert.match(markup, /aria-label="Color style 5" aria-pressed="true"/);
  assert.equal((markup.match(/aria-label="Color style [1-6]"/g) ?? []).length, 6);
  assert.doesNotMatch(markup, /type="color"/);
  assert.match(markup, /Edit site buttons/);
});
test("item details edit shared roles in a collapsed global panel", () => {
  const markup = render(
    <SiteColorsEditor palette={{}} target={{styleId: "style-4", itemDetail: true}}
      onChange={() => assert.fail("opening must not save")} />,
  );
  for (const role of ["background", "title", "price", "description", "options_text", "selection_background", "button_background", "button_text"]) {
    assert.ok(markup.includes(`data-color-role="item_detail.${role}"`));
  }
  assert.match(markup, /aria-label="Color style 4" aria-pressed="true"/);
  assert.match(markup, /Automatic/);
  assert.match(markup, /Options and selection/);
});


test("information layout choices stay visible with either ordering permission state", () => {
  for (const orderChoicesAvailable of [true, false]) {
    const config = {nav_layout: {header: normalizeWebsiteHeader({layout: "restaurant", restaurant: {info_layout: "classic"}})}};
    const markup = render(<HeaderInspector restaurantId={1} config={config} pages={[]} sections={[]}
      activeElement="restaurant" orderChoicesAvailable={orderChoicesAvailable} onChange={() => undefined} />);
    assert.match(markup, /Modern/);
    assert.match(markup, /Classic/);
    assert.match(markup, /Opening and pre-order status/);
    assert.doesNotMatch(markup, /automatically shows/);
  }
});
