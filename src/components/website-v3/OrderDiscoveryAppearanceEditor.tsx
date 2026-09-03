"use client";

import type { StatePath } from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";

/** Exposes every shared visual token consumed by the order discovery renderer. */
export function OrderDiscoveryAppearanceEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  return (
    <>
      <InspectorGroup
        title="Composition"
        description="La grille reste alignée sur les produits de la page Commander."
      >
        <InspectorField label="Position de l’image">
          <select
            data-field-id="section.settings.image_position"
            value={string(value.image_position) || "left"}
            onChange={(event) =>
              onChange(["settings", "image_position"], event.target.value)
            }
            className={controlClass}
          >
            <option value="left">Image à gauche</option>
            <option value="right">Image à droite</option>
            <option value="alternate">Alterner les services</option>
          </select>
        </InspectorField>
        <InspectorField label="Hauteur sur ordinateur">
          <select
            data-field-id="section.settings.card_height"
            value={string(value.card_height) || "regular"}
            onChange={(event) =>
              onChange(["settings", "card_height"], event.target.value)
            }
            className={controlClass}
          >
            <option value="compact">Compacte</option>
            <option value="regular">Standard</option>
            <option value="tall">Grande</option>
          </select>
        </InspectorField>
        <InspectorField label="Arrondis">
          <select
            data-field-id="section.settings.card_radius"
            value={string(value.card_radius) || "rounded"}
            onChange={(event) =>
              onChange(["settings", "card_radius"], event.target.value)
            }
            className={controlClass}
          >
            <option value="square">Aucun</option>
            <option value="soft">Discrets</option>
            <option value="rounded">Généreux</option>
          </select>
        </InspectorField>
      </InspectorGroup>

      <InspectorGroup title="Titre de section">
        <ColorField
          fieldId="section.settings.heading_eyebrow_color"
          label="Couleur du surtitre"
          value={string(value.heading_eyebrow_color)}
          fallback="#6b7280"
          onChange={(color) =>
            onChange(["settings", "heading_eyebrow_color"], color)
          }
        />
        <ColorField
          fieldId="section.settings.heading_color"
          label="Couleur du titre"
          value={string(value.heading_color)}
          fallback="#111827"
          onChange={(color) =>
            onChange(["settings", "heading_color"], color)
          }
        />
      </InspectorGroup>

      <InspectorGroup title="Panneau éditorial">
        <InspectorField label="Fond">
          <select
            data-field-id="section.settings.panel_style"
            value={string(value.panel_style) || "gradient"}
            onChange={(event) =>
              onChange(["settings", "panel_style"], event.target.value)
            }
            className={controlClass}
          >
            <option value="solid">Uni</option>
            <option value="gradient">Dégradé</option>
          </select>
        </InspectorField>
        <ColorField
          fieldId="section.settings.panel_bg_color"
          label="Couleur de départ"
          value={string(value.panel_bg_color)}
          fallback="#5f241a"
          onChange={(color) =>
            onChange(["settings", "panel_bg_color"], color)
          }
        />
        {value.panel_style !== "solid" ? (
          <ColorField
            fieldId="section.settings.panel_bg_color_end"
            label="Couleur d’arrivée"
            value={string(value.panel_bg_color_end)}
            fallback="#8f4432"
            onChange={(color) =>
              onChange(["settings", "panel_bg_color_end"], color)
            }
          />
        ) : null}
        <ColorField
          fieldId="section.settings.panel_text_color"
          label="Texte principal"
          value={string(value.panel_text_color)}
          fallback="#ffffff"
          onChange={(color) =>
            onChange(["settings", "panel_text_color"], color)
          }
        />
        <ColorField
          fieldId="section.settings.panel_muted_color"
          label="Texte secondaire"
          value={string(value.panel_muted_color)}
          fallback="#f5d8cf"
          onChange={(color) =>
            onChange(["settings", "panel_muted_color"], color)
          }
        />
      </InspectorGroup>

      <InspectorGroup title="Bouton">
        <ColorField
          fieldId="section.settings.button_bg_color"
          label="Fond"
          value={string(value.button_bg_color)}
          fallback="#e65328"
          onChange={(color) =>
            onChange(["settings", "button_bg_color"], color)
          }
        />
        <ColorField
          fieldId="section.settings.button_text_color"
          label="Texte"
          value={string(value.button_text_color)}
          fallback="#ffffff"
          onChange={(color) =>
            onChange(["settings", "button_text_color"], color)
          }
        />
      </InspectorGroup>

      <InspectorGroup title="Mobile et séparation">
        <ColorField
          fieldId="section.settings.mobile_text_color"
          label="Texte sur l’image"
          value={string(value.mobile_text_color)}
          fallback="#ffffff"
          onChange={(color) =>
            onChange(["settings", "mobile_text_color"], color)
          }
        />
        <InspectorField
          label="Intensité du voile mobile"
          hint={`${Math.round(number(value.mobile_overlay_opacity, 0.72) * 100)} %`}
        >
          <input
            type="range"
            min={0}
            max={95}
            value={Math.round(number(value.mobile_overlay_opacity, 0.72) * 100)}
            data-field-id="section.settings.mobile_overlay_opacity"
            onChange={(event) =>
              onChange(
                ["settings", "mobile_overlay_opacity"],
                Number(event.target.value) / 100,
              )
            }
            className="w-full accent-[#315fce]"
          />
        </InspectorField>
        <ColorField
          fieldId="section.settings.section_bg_color"
          label="Fond de la section"
          value={string(value.section_bg_color)}
          fallback="#ffffff"
          onChange={(color) =>
            onChange(["settings", "section_bg_color"], color)
          }
        />
        <ToggleField
          fieldId="section.settings.show_dividers"
          label="Afficher les séparateurs"
          checked={value.show_dividers !== false}
          onChange={(visible) =>
            onChange(["settings", "show_dividers"], visible)
          }
        />
        {value.show_dividers !== false ? (
          <ColorField
            fieldId="section.settings.divider_color"
            label="Couleur des séparateurs"
            value={string(value.divider_color)}
            fallback="#e5e7eb"
            onChange={(color) =>
              onChange(["settings", "divider_color"], color)
            }
          />
        ) : null}
      </InspectorGroup>
    </>
  );
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}
