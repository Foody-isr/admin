"use client";

import type { StatePath } from "@/lib/website-v3/types";
import { ColorField, InspectorField, InspectorGroup, controlClass } from "./controls";

/** Exposes the visual settings consumed by feature-card title buttons. */
export function FeatureCardsAppearanceEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  return (
    <InspectorGroup
      title="Boutons des cartes"
      description="Ces réglages s’appliquent au bouton central de toutes les cartes de ce bloc."
    >
      <ColorField
        fieldId="section.settings.button_bg_color"
        label="Couleur de fond"
        value={string(value.button_bg_color)}
        fallback="#ffffff"
        onChange={(color) => onChange(["settings", "button_bg_color"], color)}
      />
      <ColorField
        fieldId="section.settings.button_text_color"
        label="Couleur du texte"
        value={string(value.button_text_color)}
        fallback="#111111"
        onChange={(color) =>
          onChange(["settings", "button_text_color"], color)
        }
      />
      <ColorField
        fieldId="section.settings.button_border_color"
        label="Couleur de la bordure"
        value={string(value.button_border_color)}
        fallback="#ffffff"
        onChange={(color) =>
          onChange(["settings", "button_border_color"], color)
        }
      />
      <InspectorField label="Forme du bouton">
        <select
          data-field-id="section.settings.button_shape"
          value={string(value.button_shape) || "square"}
          onChange={(event) =>
            onChange(["settings", "button_shape"], event.target.value)
          }
          className={controlClass}
        >
          <option value="square">Carré</option>
          <option value="rounded">Arrondi</option>
          <option value="pill">Pilule</option>
        </select>
      </InspectorField>
    </InspectorGroup>
  );
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
