"use client";

import { LAYOUT_OPTIONS, SECTION_TYPE_META } from "@/components/website/SectionEditors";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";
import { SectionContentEditors } from "./SectionContentEditors";
import { FeatureCardsAppearanceEditor } from "./FeatureCardsAppearanceEditor";
import { MenuHighlightsAppearanceEditor } from "./MenuHighlightsAppearanceEditor";
import { OrderDiscoveryAppearanceEditor } from "./OrderDiscoveryAppearanceEditor";

export function SectionInspector({
  restaurantId,
  section,
  tab,
  onChange,
}: {
  restaurantId: number;
  section: DraftSectionPayload;
  tab: "content" | "appearance" | "settings";
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const meta = SECTION_TYPE_META[section.section_type];
  if (tab === "content") {
    return (
      <InspectorGroup
        title={
          section.section_type === "order_discovery"
            ? "Découverte & publicité"
            : meta?.labelKey
              ? humanize(section.section_type)
              : "Section"
        }
        description="Chaque valeur est envoyée au même renderer que la page publique."
      >
        <SectionContentEditors
          restaurantId={restaurantId}
          section={section}
          onChange={onChange}
        />
      </InspectorGroup>
    );
  }

  if (tab === "appearance") {
    return (
      <>
        <InspectorGroup title="Style du bloc">
          <InspectorField label="Variation">
            <select
              data-field-id="section.layout"
              value={section.layout}
              onChange={(event) => onChange(["layout"], event.target.value)}
              className={controlClass}
            >
              <option value="default">Par défaut</option>
              {(LAYOUT_OPTIONS[section.section_type] ?? []).map((layout) => (
                <option key={layout.value} value={layout.value}>
                  {humanize(layout.value)}
                </option>
              ))}
            </select>
          </InspectorField>
          {section.section_type !== "order_discovery" ? (
            <>
              <InspectorField label="Ambiance">
                <select
                  data-field-id="section.settings.color_style"
                  value={string(section.settings.color_style) || "light"}
                  onChange={(event) =>
                    onChange(["settings", "color_style"], event.target.value)
                  }
                  className={controlClass}
                >
                  <option value="light">Claire</option>
                  <option value="dark">Sombre</option>
                  <option value="custom">Personnalisée</option>
                </select>
              </InspectorField>
              {section.settings.color_style === "custom" &&
              section.section_type !== "menu_highlights" ? (
                <>
                  <ColorField
                    fieldId="section.settings.custom_bg"
                    label="Arrière-plan"
                    value={string(section.settings.custom_bg)}
                    fallback="#ffffff"
                    onChange={(value) =>
                      onChange(["settings", "custom_bg"], value)
                    }
                  />
                  <ColorField
                    fieldId="section.settings.custom_text"
                    label="Texte"
                    value={string(section.settings.custom_text)}
                    fallback="#111827"
                    onChange={(value) =>
                      onChange(["settings", "custom_text"], value)
                    }
                  />
                </>
              ) : null}
              <InspectorField label="Image de fond">
                <input
                  type="url"
                  data-field-id="section.settings.bg_image"
                  value={string(section.settings.bg_image)}
                  onChange={(event) =>
                    onChange(["settings", "bg_image"], event.target.value)
                  }
                  className={controlClass}
                  placeholder="https://..."
                />
              </InspectorField>
              <ToggleField
                fieldId="section.settings.bg_overlay"
                label="Voile sur l’image"
                checked={
                  section.section_type === "hero_banner"
                    ? section.settings.bg_overlay !== false
                    : Boolean(section.settings.bg_overlay)
                }
                onChange={(value) =>
                  onChange(["settings", "bg_overlay"], value)
                }
              />
            </>
          ) : null}
        </InspectorGroup>
        {section.section_type === "menu_highlights" ? (
          <MenuHighlightsAppearanceEditor
            value={section.settings}
            onChange={onChange}
          />
        ) : null}
        {section.section_type === "feature_cards" ? (
          <FeatureCardsAppearanceEditor
            value={section.settings}
            onChange={onChange}
          />
        ) : null}
        {section.section_type === "order_discovery" ? (
          <OrderDiscoveryAppearanceEditor
            value={section.settings}
            onChange={onChange}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {section.section_type === "order_discovery" ? (
        <InspectorGroup
          title="Placement dans le menu"
          description="Le bloc est inséré après ce nombre de produits dans la première catégorie."
        >
          <InspectorField label="Afficher après">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                data-field-id="section.settings.insert_after_items"
                value={numeric(section.settings.insert_after_items, 6)}
                onChange={(event) =>
                  onChange(
                    ["settings", "insert_after_items"],
                    Math.min(50, Math.max(1, Number(event.target.value) || 1)),
                  )
                }
                className={controlClass}
              />
              <span className="text-xs text-slate-500">produits</span>
            </div>
          </InspectorField>
        </InspectorGroup>
      ) : null}
      <InspectorGroup title="Comportement">
        <ToggleField
          fieldId="section.is_visible"
          label="Section visible"
          description="Une section masquée reste dans le brouillon."
          checked={section.is_visible}
          onChange={(value) => onChange(["is_visible"], value)}
        />
        <p
          data-field-id="section.page_id"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] leading-5 text-slate-500"
        >
          La section reste attachée à sa page par son identifiant canonique,
          même si l’adresse de la page change.
        </p>
      </InspectorGroup>
    </>
  );
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
