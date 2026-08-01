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
import { MenuHighlightsAppearanceEditor } from "./MenuHighlightsAppearanceEditor";

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
        title={meta?.labelKey ? humanize(section.section_type) : "Section"}
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
            checked={Boolean(section.settings.bg_overlay)}
            onChange={(value) =>
              onChange(["settings", "bg_overlay"], value)
            }
          />
        </InspectorGroup>
        {section.section_type === "menu_highlights" ? (
          <MenuHighlightsAppearanceEditor
            value={section.settings}
            onChange={onChange}
          />
        ) : null}
      </>
    );
  }

  return (
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
        La section reste attachée à sa page par son identifiant canonique, même
        si l’adresse de la page change.
      </p>
    </InspectorGroup>
  );
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
