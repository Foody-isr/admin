import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DraftSectionPayload } from "@/lib/website-v3/types";
import { heroImageReplacement } from "../SectionContentEditors";
import { ElementInspector } from "../ElementInspector";
import { squareDefaultSettings } from "@/lib/website-v3/square-components";
import { SectionInspector } from "../SectionInspector";
import { LocaleProvider } from "@/lib/i18n";

Object.assign(globalThis, { React });

test("hero image replacement is atomic and switches away from video", () => {
  const section = {
    tmp_id: "hero-test",
    section_type: "hero_banner",
    page: "home",
    page_tmp_id: "page-test",
    sort_order: 0,
    is_visible: true,
    layout: "centered",
    content: {
      image_url: "https://cdn.example.com/old.jpg",
      video_url: "https://cdn.example.com/cover.mp4",
      image_focal_x: 12,
      image_focal_y: 87,
    },
    settings: { bg_image: "https://cdn.example.com/legacy.jpg" },
  } satisfies DraftSectionPayload;

  const updated = heroImageReplacement(
    section,
    "https://cdn.example.com/new.jpg",
  );

  assert.equal(updated.content.image_url, "https://cdn.example.com/new.jpg");
  assert.equal(updated.content.video_url, "");
  assert.equal(updated.content.image_focal_x, 50);
  assert.equal(updated.content.image_focal_y, 50);
  assert.equal(updated.settings.bg_image, "");
});

test("hero content exposes CTA fields and configured cover media", () => {
  const markup = renderSection({
    section_type: "hero_banner",
    content: {
      headline: "Un sublime mélange",
      subheadline: "De qualité et d’excellence",
      cta_text: "Commander",
      cta_link: "/order",
      image_url: "",
      video_url: "https://cdn.example.com/current-hero.mp4",
    },
    settings: {
      bg_image: "https://cdn.example.com/current-hero.jpg",
    },
  });

  assert.match(markup, /Texte du bouton/);
  assert.match(markup, /Lien du bouton/);
  assert.match(markup, /src="https:\/\/cdn\.example\.com\/current-hero\.jpg"/);
  assert.match(markup, /src="https:\/\/cdn\.example\.com\/current-hero\.mp4"/);
  assert.match(markup, /Vidéo de couverture/);
  assert.match(markup, /data-field-id="section\.content\.video_url"/);
  assert.match(markup, /Téléverser|Remplacer/);
});

test("gallery content exposes existing images and an add-images action", () => {
  const markup = renderSection({
    section_type: "gallery",
    content: {
      images: [{ url: "https://cdn.example.com/gallery-1.jpg", alt: "Salle" }],
    },
  });

  assert.match(markup, /src="https:\/\/cdn\.example\.com\/gallery-1\.jpg"/);
  assert.match(markup, /Ajouter des images/);
  assert.doesNotMatch(markup, /structure composée/);
});

test("feature cards content exposes every card field and add action", () => {
  const markup = renderSection({
    section_type: "feature_cards",
    content: {
      cards: [
        {
          image_url: "https://cdn.example.com/card.jpg",
          title: "Nos plateaux",
          subtitle: "Pour vos événements",
          link: "/catering",
        },
      ],
    },
  });

  assert.match(markup, /Carte 1/);
  assert.match(markup, /Nos plateaux/);
  assert.match(markup, /Pour vos événements/);
  assert.match(markup, /\/catering/);
  assert.match(markup, /Ajouter une carte/);
  assert.doesNotMatch(markup, /structure composée/);
});

test("order discovery content owns its heading and every service field", () => {
  const markup = renderSection({
    section_type: "order_discovery",
    page: "commander",
    content: {
      heading_eyebrow: "Au-delà du menu",
      heading: "Mamie, c’est aussi…",
      show_heading: true,
      promotions: [
        {
          image_url: "https://cdn.example.com/catering.jpg",
          image_alt: "Table dressée",
          image_focal_x: 32,
          image_focal_y: 44,
          eyebrow: "Pour vos événements",
          title: "Mamie Catering",
          description: "Des tables généreuses, pensées par Mamie.",
          cta_label: "Découvrir",
          link: "/catering",
          open_in_new_tab: false,
        },
      ],
    },
  });

  assert.match(markup, /Découverte &amp; publicité/);
  assert.match(markup, /ne sont jamais reprises automatiquement/);
  assert.match(markup, /Mamie, c’est aussi…/);
  assert.match(markup, /Service 1/);
  assert.match(markup, /Table dressée/);
  assert.match(markup, /Pour vos événements/);
  assert.match(markup, /Mamie Catering/);
  assert.match(markup, /Des tables généreuses/);
  assert.match(markup, /Découvrir/);
  assert.match(markup, /\/catering/);
  assert.match(markup, /Ajouter un service/);
});

test("order discovery appearance and placement are fully editable", () => {
  const appearanceMarkup = renderSection(
    {
      section_type: "order_discovery",
      page: "commander",
      settings: {
        image_position: "alternate",
        card_height: "tall",
        card_radius: "soft",
        panel_style: "gradient",
        panel_bg_color: "#5f241a",
        panel_bg_color_end: "#8f4432",
        panel_text_color: "#ffffff",
        panel_muted_color: "#f5d8cf",
        button_bg_color: "#e65328",
        button_text_color: "#ffffff",
        mobile_overlay_opacity: 0.8,
        show_dividers: true,
      },
    },
    "appearance",
  );
  const settingsMarkup = renderSection(
    {
      section_type: "order_discovery",
      page: "commander",
      settings: {
        placement_mode: "between_groups",
        placement_group_id: "42",
        placement_edge: "before",
        insert_after_items: 9,
      },
    },
    "settings",
  );

  assert.match(appearanceMarkup, /Composition/);
  assert.match(appearanceMarkup, /Panneau éditorial/);
  assert.match(appearanceMarkup, /section\.settings\.image_position/);
  assert.match(appearanceMarkup, /section\.settings\.panel_bg_color_end/);
  assert.match(appearanceMarkup, /section\.settings\.mobile_overlay_opacity/);
  assert.match(settingsMarkup, /Placement dans le menu/);
  assert.match(settingsMarkup, /section\.settings\.placement_mode/);
  assert.match(settingsMarkup, /section\.settings\.placement_group_id/);
  assert.match(settingsMarkup, /section\.settings\.placement_edge/);
  assert.match(settingsMarkup, /Salades/);
  assert.match(settingsMarkup, /Poissons/);
});

test("feature cards appearance exposes button colors and shape", () => {
  const markup = renderSection(
    {
      section_type: "feature_cards",
      settings: {
        button_bg_color: "#7c2d12",
        button_text_color: "#fef3c7",
        button_border_color: "#f59e0b",
        button_shape: "pill",
      },
    },
    "appearance",
  );

  assert.match(markup, /Boutons des cartes/);
  assert.match(markup, /section\.settings\.button_bg_color/);
  assert.match(markup, /section\.settings\.button_text_color/);
  assert.match(markup, /section\.settings\.button_border_color/);
  assert.match(markup, /section\.settings\.button_shape/);
  assert.match(markup, /value="pill" selected=""/);
});

function renderSection(
  overrides: Partial<DraftSectionPayload>,
  tab: "content" | "appearance" | "settings" = "content",
): string {
  const section: DraftSectionPayload = {
    tmp_id: "section-test",
    section_type: "text_and_image",
    page: "home",
    page_tmp_id: "page-test",
    sort_order: 0,
    is_visible: true,
    layout: "default",
    content: {},
    settings: {},
    ...overrides,
  };

  return renderToStaticMarkup(
    <LocaleProvider>
      {React.createElement(SectionInspector, {
        restaurantId: 24,
        section,
        tab,
        placementGroups: [
          { id: "17", name: "Salades" },
          { id: "42", name: "Poissons" },
        ],
        onChange: () => undefined,
      })}
    </LocaleProvider>,
  );
}

test("text and image exposes the twelve Square layouts and reproducible full-width media controls", () => {
  const markup = renderSection(
    {
      section_type: "text_and_image",
      layout: "full_width",
      settings: { image_fit: "contain", height: "tall" },
    },
    "appearance",
  );
  assert.equal(
    (markup.match(/data-field-id="section.layout"/g) || []).length,
    12,
  );
  assert.match(markup, /Full-width image above text/);
  assert.match(markup, /Image fit/);
  assert.match(markup, /Fit entire image/);
  assert.match(markup, /Image only/);
  assert.match(markup, /Section spacing/);
  const content = renderSection({
    section_type: "text_and_image",
    content: {
      title: "Kitchen",
      groups: [
        { title: "Terrace", image_url: "https://cdn.example.com/terrace.jpg" },
      ],
    },
  });
  assert.match(content, /Kitchen/);
  assert.match(content, /Terrace/);
  assert.match(content, /Add group/);
});

test("scrolling text has motion controls and a correct layout name", () => {
  const markup = renderSection(
    {
      section_type: "scrolling_text",
      content: { text: "Saucy", speed: "fast" },
    },
    "appearance",
  );
  assert.match(markup, /Scrolling text/);
  assert.doesNotMatch(markup, /Image à droite/);
  assert.match(markup, /Scrolling speed/);
  assert.match(markup, /Scrolling direction/);
});

test("new scrolling sections expose the same large display typography as the theme", () => {
  const defaults = squareDefaultSettings("scrolling_text");
  assert.equal(defaults.text_size, "xl");
  assert.equal(defaults.text_font_role, "heading");
  const section = {
    tmp_id: "scrolling",
    section_type: "scrolling_text",
    page: "home",
    page_tmp_id: "page-test",
    sort_order: 0,
    is_visible: true,
    layout: "default",
    content: { text: "Saucy" },
    settings: defaults,
  } satisfies DraftSectionPayload;
  const markup = renderToStaticMarkup(
    <LocaleProvider>
      <ElementInspector
        restaurantId={1}
        section={section}
        field="text"
        onChange={() => undefined}
      />
    </LocaleProvider>,
  );
  assert.match(markup, /value="xl" selected/);
  assert.match(markup, /value="heading" selected/);
  assert.match(markup, /aria-pressed="true"/);
});

test("moving text panels expose stable content fields, including alternating phrases", () => {
  for (const type of ["scrolling_text", "animated_text"]) {
    const markup = renderToStaticMarkup(
      React.createElement(
        LocaleProvider,
        null,
        React.createElement(ElementInspector, {
          restaurantId: 1,
          section: {
            tmp_id: "moving",
            section_type: type,
            page: "home",
            sort_order: 0,
            is_visible: true,
            layout: "default",
            content: {
              text: "Apparemment, on nous aime",
              phrases: [{ text: "un peu" }, { text: "passionnément" }],
            },
            settings: squareDefaultSettings(type),
          },
          field: "text",
          onChange: () => {},
        }),
      ),
    );
    assert.match(markup, /<textarea[^>]*data-field-id="section.content.text"/);
    assert.match(markup, /Apparemment, on nous aime/);
    if (type === "animated_text") {
      assert.match(markup, /data-field-id="section.content.phrases"/);
      assert.match(markup, /un peu\npassionnément/);
      assert.match(markup, /section.settings.rotating_color/);
      assert.match(markup, /section.settings.speed/);
    }
  }
});
