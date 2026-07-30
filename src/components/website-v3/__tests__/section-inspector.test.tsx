import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DraftSectionPayload } from "@/lib/website-v3/types";
import { SectionInspector } from "../SectionInspector";

Object.assign(globalThis, { React });

test("hero content exposes CTA fields and the already configured image", () => {
  const markup = renderSection({
    section_type: "hero_banner",
    content: {
      headline: "Un sublime mélange",
      subheadline: "De qualité et d’excellence",
      cta_text: "Commander",
      cta_link: "/order",
      image_url: "",
    },
    settings: {
      bg_image: "https://cdn.example.com/current-hero.jpg",
    },
  });

  assert.match(markup, /Texte du bouton/);
  assert.match(markup, /Lien du bouton/);
  assert.match(markup, /src="https:\/\/cdn\.example\.com\/current-hero\.jpg"/);
  assert.match(markup, /Téléverser|Remplacer/);
});

test("gallery content exposes existing images and an add-images action", () => {
  const markup = renderSection({
    section_type: "gallery",
    content: {
      images: [
        { url: "https://cdn.example.com/gallery-1.jpg", alt: "Salle" },
      ],
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

function renderSection(
  overrides: Partial<DraftSectionPayload>,
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
    React.createElement(SectionInspector, {
      restaurantId: 24,
      section,
      tab: "content",
      onChange: () => undefined,
    }),
  );
}
