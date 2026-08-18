"use client";

import { useState } from "react";
import { SectionImageUploader } from "@/components/website/SectionEditors";
import { useI18n } from "@/lib/i18n";
import type {
  ChainOrderEntryLocaleCopy,
  ChainOrderEntryOverride,
  DraftAppearanceOverrides,
  StatePath,
} from "@/lib/website-v3/types";
import type { InspectorTab } from "@/lib/website-v3/inspector-scope";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";

const LOCALES = ["fr", "he", "en"] as const;
type Locale = (typeof LOCALES)[number];

const COPY_FIELDS: Array<{
  key: keyof ChainOrderEntryLocaleCopy;
  label: string;
  multiline?: boolean;
}> = [
  { key: "eyebrow", label: "chain_selector_eyebrow" },
  { key: "title", label: "chain_selector_title", multiline: true },
  { key: "subtitle", label: "chain_selector_subtitle", multiline: true },
  { key: "pickup", label: "chain_selector_pickup" },
  { key: "delivery", label: "chain_selector_delivery" },
  { key: "search", label: "chain_selector_search" },
  { key: "nearMe", label: "chain_selector_near_me" },
  { key: "branches", label: "chain_selector_branches" },
  { key: "orderHere", label: "chain_selector_cta" },
];

export function ChainOrderEntryEditor({
  tab,
  restaurantId,
  appearance,
  onChange,
}: {
  tab: InspectorTab;
  restaurantId: number;
  appearance: DraftAppearanceOverrides;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const [locale, setLocale] = useState<Locale>("fr");
  const selector = appearance.chain_order_entry ?? {};
  const translations = selector.translations ?? {};
  const localeCopy = translations[locale] ?? {};
  const updateSelector = (patch: Partial<ChainOrderEntryOverride>) =>
    onChange(["appearance_overrides", "chain_order_entry"], {
      ...selector,
      ...patch,
    });
  const updateCopy = (key: keyof ChainOrderEntryLocaleCopy, value: string) =>
    updateSelector({
      translations: {
        ...translations,
        [locale]: { ...localeCopy, [key]: value },
      },
    });

  if (tab === "content") {
    return (
      <InspectorGroup
        groupId="chain.selector.content"
        title={t("chain_selector_content_title")}
        description={t("chain_selector_content_desc")}
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-600">
            {t("chain_selector_language")}
          </p>
          <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
            {LOCALES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={locale === candidate}
                onClick={() => setLocale(candidate)}
                className={`rounded-lg px-3 py-2 text-xs font-bold uppercase transition ${
                  locale === candidate
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>
        {COPY_FIELDS.map((field) => (
          <InspectorField key={field.key} label={t(field.label)}>
            {field.multiline ? (
              <textarea
                data-field-id={`page.appearance_overrides.chain_order_entry.translations.${locale}.${field.key}`}
                value={localeCopy[field.key] ?? ""}
                onChange={(event) => updateCopy(field.key, event.target.value)}
                className={`${controlClass} min-h-20 py-2.5`}
                placeholder={defaultCopy(locale, field.key)}
              />
            ) : (
              <input
                data-field-id={`page.appearance_overrides.chain_order_entry.translations.${locale}.${field.key}`}
                value={localeCopy[field.key] ?? ""}
                onChange={(event) => updateCopy(field.key, event.target.value)}
                className={controlClass}
                placeholder={defaultCopy(locale, field.key)}
              />
            )}
          </InspectorField>
        ))}
      </InspectorGroup>
    );
  }

  if (tab === "appearance") {
    return (
      <InspectorGroup
        groupId="chain.selector.appearance"
        title={t("chain_selector_appearance_title")}
        description={t("chain_selector_appearance_desc")}
      >
        <SectionImageUploader
          restaurantId={restaurantId}
          currentUrl={appearance.cover_url ?? ""}
          onUploaded={(url) =>
            onChange(["appearance_overrides", "cover_url"], url)
          }
          onRemove={() => onChange(["appearance_overrides", "cover_url"], "")}
          label={t("chain_selector_cover")}
        />
        <InspectorField label={t("chain_selector_layout")}>
          <select
            data-field-id="page.appearance_overrides.chain_order_entry.layout"
            value={selector.layout ?? "list"}
            onChange={(event) =>
              updateSelector({ layout: event.target.value as "list" | "cards" })
            }
            className={controlClass}
          >
            <option value="list">{t("chain_selector_layout_list")}</option>
            <option value="cards">{t("chain_selector_layout_cards")}</option>
          </select>
        </InspectorField>
        <ColorField
          fieldId="page.appearance_overrides.bg"
          label={t("backgroundColor")}
          value={appearance.bg ?? ""}
          fallback="#09090a"
          onChange={(value) => onChange(["appearance_overrides", "bg"], value)}
        />
        <ColorField
          fieldId="page.appearance_overrides.ink"
          label={t("textColor")}
          value={appearance.ink ?? ""}
          fallback="#f6f2e9"
          onChange={(value) => onChange(["appearance_overrides", "ink"], value)}
        />
        <ColorField
          fieldId="page.appearance_overrides.accent"
          label={t("accentColor")}
          value={appearance.accent ?? ""}
          fallback="#b88a32"
          onChange={(value) =>
            onChange(["appearance_overrides", "accent"], value)
          }
        />
        <ColorField
          fieldId="page.appearance_overrides.chain_order_entry.surface_color"
          label={t("chain_selector_surface_color")}
          value={selector.surface_color ?? ""}
          fallback="#18181a"
          onChange={(value) => updateSelector({ surface_color: value })}
        />
        <InspectorField
          label={`${t("chain_selector_overlay")} · ${selector.overlay_opacity ?? 78}%`}
        >
          <input
            data-field-id="page.appearance_overrides.chain_order_entry.overlay_opacity"
            type="range"
            min={0}
            max={100}
            value={selector.overlay_opacity ?? 78}
            onChange={(event) =>
              updateSelector({ overlay_opacity: Number(event.target.value) })
            }
            className="w-full accent-[#315fce]"
          />
        </InspectorField>
        <InspectorField label={t("headingFont")}>
          <input
            value={appearance.headingFont ?? ""}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "headingFont"],
                event.target.value,
              )
            }
            className={controlClass}
            placeholder={t("headingFont")}
          />
        </InspectorField>
        <InspectorField label={t("bodyFont")}>
          <input
            value={appearance.bodyFont ?? ""}
            onChange={(event) =>
              onChange(["appearance_overrides", "bodyFont"], event.target.value)
            }
            className={controlClass}
            placeholder={t("bodyFont")}
          />
        </InspectorField>
      </InspectorGroup>
    );
  }

  return (
    <InspectorGroup
      groupId="chain.selector.settings"
      title={t("chain_selector_settings_title")}
      description={t("chain_selector_settings_desc")}
    >
      <ToggleField
        fieldId="page.appearance_overrides.chain_order_entry.show_search"
        label={t("chain_selector_show_search")}
        checked={selector.show_search ?? true}
        onChange={(value) => updateSelector({ show_search: value })}
      />
      <ToggleField
        fieldId="page.appearance_overrides.chain_order_entry.show_near_me"
        label={t("chain_selector_show_near_me")}
        checked={selector.show_near_me ?? true}
        onChange={(value) => updateSelector({ show_near_me: value })}
      />
      <ToggleField
        fieldId="page.appearance_overrides.chain_order_entry.show_branch_count"
        label={t("chain_selector_show_count")}
        checked={selector.show_branch_count ?? true}
        onChange={(value) => updateSelector({ show_branch_count: value })}
      />
      <ToggleField
        fieldId="page.appearance_overrides.chain_order_entry.show_branch_numbers"
        label={t("chain_selector_show_numbers")}
        checked={selector.show_branch_numbers ?? true}
        onChange={(value) => updateSelector({ show_branch_numbers: value })}
      />
    </InspectorGroup>
  );
}

const DEFAULT_COPY: Record<Locale, Required<ChainOrderEntryLocaleCopy>> = {
  fr: {
    eyebrow: "Choisissez votre boulangerie",
    title: "Où souhaitez-vous commander ?",
    subtitle: "Chaque succursale prépare et reçoit ses propres commandes.",
    pickup: "À emporter",
    delivery: "Livraison",
    search: "Rechercher une ville ou une adresse",
    nearMe: "Autour de moi",
    branches: "Toutes les succursales",
    orderHere: "Commander ici",
  },
  en: {
    eyebrow: "Choose your bakery",
    title: "Where would you like to order?",
    subtitle: "Each branch prepares and receives its own orders.",
    pickup: "Pickup",
    delivery: "Delivery",
    search: "Search by city or address",
    nearMe: "Near me",
    branches: "All branches",
    orderHere: "Order here",
  },
  he: {
    eyebrow: "בחרו את הסניף שלכם",
    title: "מאיזה סניף תרצו להזמין?",
    subtitle: "כל סניף מכין ומקבל את ההזמנות שלו.",
    pickup: "איסוף עצמי",
    delivery: "משלוח",
    search: "חיפוש לפי עיר או כתובת",
    nearMe: "קרוב אליי",
    branches: "כל הסניפים",
    orderHere: "הזמנה מהסניף",
  },
};

function defaultCopy(
  locale: Locale,
  key: keyof ChainOrderEntryLocaleCopy,
): string {
  return DEFAULT_COPY[locale][key];
}
