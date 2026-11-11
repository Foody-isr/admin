"use client";

import { useI18n } from "@/lib/i18n";
import type { MobileAppHome, MobileHomeSection, MobileLocale } from "@/lib/website-v3/mobile-experience";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { CampaignSlidesEditor } from "./CampaignSlidesEditor";
import { FeaturedItemsEditor } from "./FeaturedItemsEditor";
import { controlClass, InspectorField, ToggleField } from "./controls";

const heroDefaults: MobileHomeSection = {
  layout: "campaign",
  content: {},
  settings: {
    card_width_percent: 100, card_width_percent_mobile: 100, card_gap: 0,
    show_counter: true, autoplay: true, controls_alignment: "left",
  },
};

const featuredDefaults: MobileHomeSection = {
  layout: "grid",
  content: {},
  settings: {
    auto_select_items: true, item_source: "automatic", max_items: 6,
    show_prices: false, image_fit: "contain",
  },
};

function sectionPayload(saved: MobileHomeSection | undefined, defaults: MobileHomeSection, type: string): DraftSectionPayload {
  return {
    tmp_id: `app-home-${type}`, page: "", section_type: type, is_visible: true, sort_order: 0,
    layout: saved?.layout ?? defaults.layout,
    content: saved?.content ?? defaults.content,
    settings: { ...defaults.settings, ...saved?.settings },
  };
}

/** Edits the two homepage blocks using the existing media and product controls. */
export function MobileAppHomeEditor({ home, restaurantId, locale, onChange }: {
  home?: MobileAppHome;
  restaurantId: number;
  locale: MobileLocale;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const hero = sectionPayload(home?.hero, heroDefaults, "hero_banner");
  const featured = sectionPayload(home?.featured, featuredDefaults, "menu_highlights");
  const invalidPeriod = Boolean(home?.featured_from && home.featured_through && home.featured_from > home.featured_through);
  const editBlock = (key: "hero" | "featured", path: StatePath, value: unknown) => {
    if (path.length === 0) {
      const { layout, content, settings } = value as DraftSectionPayload;
      onChange([key], { layout, content, settings });
    } else {
      onChange([key, ...path], value);
    }
  };

  return (
    <div className="space-y-4">
      <ToggleField label={t("editorMobileHomeEnable")} description={t("editorMobileHomeHelp")}
        checked={home?.enabled === true} onChange={enabled => onChange([], {
          hero: heroDefaults, featured: featuredDefaults, ...home, enabled,
        })} />
      {home?.enabled && <>
        <details className="space-y-4 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{t("editorMobileHomeCarousel")}</summary>
          <InspectorField label={t("editorMobileHomeHeight")}>
            <select className={controlClass} value={home.hero_height ?? 76}
              onChange={event => onChange(["hero_height"], Number(event.target.value))}>
              {[66, 76, 88].map(height => <option key={height} value={height}>{height} %</option>)}
            </select>
          </InspectorField>
          <CampaignSlidesEditor restaurantId={restaurantId} section={hero} appOrder
            onChange={(path, value) => editBlock("hero", path, value)} />
        </details>
        <details className="space-y-4 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{t("editorMobileHomeFeatured")}</summary>
          <ToggleField label={t("editorMobileHomeShowFeatured")} checked={home.featured_enabled !== false}
            onChange={value => onChange(["featured_enabled"], value)} />
          {home.featured_enabled !== false && <>
            <p className="text-xs leading-5 text-slate-600">{t("editorMobileHomePeriodHelp")}</p>
            <div className="grid grid-cols-2 gap-2">
              <InspectorField label={t("editorMobileHomeFrom")}>
                <input type="date" className={controlClass} value={home.featured_from ?? ""}
                  onChange={event => onChange(["featured_from"], event.target.value || undefined)} />
              </InspectorField>
              <InspectorField label={t("editorMobileHomeThrough")}>
                <input type="date" className={controlClass} value={home.featured_through ?? ""}
                  onChange={event => onChange(["featured_through"], event.target.value || undefined)} />
              </InspectorField>
            </div>
            {invalidPeriod && <p role="alert" className="text-sm text-red-700">{t("editorMobileHomeInvalidPeriod")}</p>}
            <FeaturedItemsEditor restaurantId={restaurantId} section={featured} selectionLimit={12}
              onChange={(path, value) => editBlock("featured", path, value)} />
          </>}
        </details>
        <InspectorField label={t("editorMobileHomeOrderLabel")}>
          <input className={controlClass} dir={locale === "he" ? "rtl" : "ltr"} maxLength={48}
            value={home.order_label?.[locale] ?? ""} placeholder={t("editorMobileOrder")}
            onChange={event => onChange(["order_label", locale], event.target.value)} />
        </InspectorField>
        <ToggleField label={t("editorMobileHomeStickyOrder")} checked={home.sticky_order !== false}
          onChange={value => onChange(["sticky_order"], value)} />
      </>}
    </div>
  );
}
