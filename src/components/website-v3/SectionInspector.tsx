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

export function SectionInspector({
  section,
  tab,
  onChange,
}: {
  section: DraftSectionPayload;
  tab: "content" | "appearance" | "settings";
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const meta = SECTION_TYPE_META[section.section_type];
  if (tab === "content") {
    const fields = contentFieldsFor(section.section_type);
    return (
      <InspectorGroup
        title={meta?.labelKey ? humanize(section.section_type) : "Section"}
        description="Chaque valeur est envoyée au même renderer que la page publique."
      >
        {fields.map((field) => (
          <InspectorField key={field.key} label={field.label}>
            {field.multiline ? (
              <textarea
                data-field-id={`section.content.${field.key}`}
                value={string(section.content[field.key])}
                onChange={(event) =>
                  onChange(["content", field.key], event.target.value)
                }
                className={`${controlClass} min-h-24 py-2.5`}
              />
            ) : (
              <input
                data-field-id={`section.content.${field.key}`}
                value={string(section.content[field.key])}
                onChange={(event) =>
                  onChange(["content", field.key], event.target.value)
                }
                className={controlClass}
              />
            )}
          </InspectorField>
        ))}
        {fields.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
            Cette section utilise une structure composée. Elle reste visible et
            réordonnable, mais ses données avancées sont conservées telles quelles.
          </p>
        ) : null}
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
          {section.settings.color_style === "custom" ? (
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

function contentFieldsFor(
  type: string,
): { key: string; label: string; multiline?: boolean }[] {
  switch (type) {
    case "hero_banner":
      return [
        { key: "headline", label: "Titre" },
        { key: "subheadline", label: "Sous-titre", multiline: true },
        { key: "cta_text", label: "Texte du bouton" },
        { key: "cta_link", label: "Lien du bouton" },
        { key: "image_url", label: "Image" },
      ];
    case "text_and_image":
    case "promo_banner":
      return [
        { key: "title", label: "Titre" },
        { key: "body", label: "Texte", multiline: true },
        { key: "image_url", label: "Image" },
      ];
    case "scrolling_text":
      return [{ key: "text", label: "Texte défilant", multiline: true }];
    case "footer":
      return [{ key: "custom_text", label: "Texte du pied de page" }];
    default:
      return [];
  }
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
