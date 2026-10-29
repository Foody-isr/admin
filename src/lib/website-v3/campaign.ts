import { normalizeImageFraming, type ImageFraming } from "./image-framing";
import type { DraftSectionPayload } from "./types";
import { normalizeFeaturedImageBackgrounds } from "./featured-items";

export const MAX_CAMPAIGN_SLIDES = 6;
export type CampaignSlide = {
  id: string; image_url: string; video_url: string; image_alt: string;
  headline: string; subheadline: string; cta_text: string; cta_link: string;
  background_color: string; image_framing?: ImageFraming; video_framing?: ImageFraming;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

/** Bounds authored slides and preserves stable identities across save and reload. */
export function normalizeCampaignSlides(value: unknown): CampaignSlide[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  return value.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry)).slice(0, MAX_CAMPAIGN_SLIDES).map((entry, index) => {
    const source = record(entry);
    let id = text(source.id).trim() || `slide-${index + 1}`;
    while (used.has(id)) id += `-${index + 1}`;
    used.add(id);
    const image = normalizeImageFraming(source.image_framing);
    const video = normalizeImageFraming(source.video_framing);
    return {
      id, image_url: text(source.image_url), video_url: text(source.video_url),
      image_alt: text(source.image_alt), headline: text(source.headline),
      subheadline: text(source.subheadline), cta_text: text(source.cta_text),
      cta_link: text(source.cta_link), background_color: /^#[\da-f]{6}$/i.test(text(source.background_color)) ? text(source.background_color) : "#ffb9cd",
      ...(image ? {image_framing: image} : {}), ...(video ? {video_framing: video} : {}),
    };
  });
}

/** Keeps legacy hero content as the first editable slide until slides are authored. */
export function campaignSlidesForSection(section: DraftSectionPayload): CampaignSlide[] {
  const slides = normalizeCampaignSlides(section.content.slides);
  return slides.length ? slides : normalizeCampaignSlides([{...section.content, id: "slide-1"}]);
}

/** Clamps only campaign settings, leaving all legacy component defaults unchanged. */
export function normalizeCampaignSection(section: DraftSectionPayload): DraftSectionPayload {
  let content = section.content, settings = section.settings;
  if (section.section_type === "hero_banner" && section.layout === "campaign") {
    const duration = Number(settings.slide_duration_seconds);
    settings = {...settings, autoplay: settings.autoplay === true,
      slide_duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.min(30, Math.max(5, duration)) : 10,
      image_fit: settings.image_fit === "contain" ? "contain" : "cover"};
    if ("controls_alignment" in settings) settings.controls_alignment = ["left", "center", "right"].includes(String(settings.controls_alignment)) ? settings.controls_alignment : "center";
    for (const key of ["show_counter", "show_playback_control"]) if (key in settings) settings[key] = settings[key] !== false;
    for (const [key, min, max, fallback] of [
      ["card_width_percent", 70, 100, 92],
      ["card_width_percent_mobile", 70, 100, 90],
      ["card_gap", 0, 64, 24],
    ] as const) if (key in settings) {
      if (settings[key] === undefined) { delete settings[key]; continue; }
      const value = Number(settings[key]);
      const bounded = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
      settings[key] = key === "card_gap" ? Math.round(bounded) : bounded;
    }
    if (Array.isArray(content.slides)) content = {...content, slides: normalizeCampaignSlides(content.slides)};
  }
  if (section.section_type === "menu_highlights" && settings.card_presentation === "campaign") {
    settings = {...settings, mobile_columns: Number(settings.mobile_columns) === 2 ? 2 : 1};
    if ("item_image_backgrounds" in settings) settings.item_image_backgrounds = normalizeFeaturedImageBackgrounds(settings.item_image_backgrounds);
    for (const [key, min, max, fallback] of [["content_max_width", 640, 1800, 1440], ["row_spacing", 0, 100, 20]] as const) if (key in settings) {
      const value = Number(settings[key]);
      settings[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    }
  }
  return {...section, content, settings};
}
