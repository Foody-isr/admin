import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DraftSectionPayload } from "@/lib/website-v3/types";
import { heroImageReplacement } from "../SectionContentEditors";
import { SectionInspector } from "../SectionInspector";

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
    React.createElement(SectionInspector, {
      restaurantId: 24,
      section,
      tab,
      onChange: () => undefined,
    }),
  );
}
