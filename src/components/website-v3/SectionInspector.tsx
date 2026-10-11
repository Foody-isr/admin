"use client";
import { EditorialAppearanceFields } from "./EditorialAppearanceFields";
import { EditorialLayoutPreview } from "./EditorialLayoutPreview";
import { ColorStylePicker } from "./ColorStylePicker";

import { useI18n } from "@/lib/i18n";
import {
  LayoutTemplate,
  Columns2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  GalleryHorizontal,
} from "lucide-react";
import {
  SQUARE_COMPONENTS,
  squareLayouts,
} from "@/lib/website-v3/square-components";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";
import {
  ImageUploadField,
  SectionContentEditors,
} from "./SectionContentEditors";
import { FeatureCardsAppearanceEditor } from "./FeatureCardsAppearanceEditor";
import { FeaturedItemsEditor } from "./FeaturedItemsEditor";
import { OrderDiscoveryAppearanceEditor } from "./OrderDiscoveryAppearanceEditor";

/** Contextual section screens opened by content and section-settings actions. */
export type SectionPanel = "content" | "appearance" | "settings";

/** Edits the selected section without a global tab strip. */
export function SectionInspector({
  restaurantId,
  section,
  sectionPanel,
  placementGroups = [],
  onChange,
}: {
  restaurantId: number;
  section: DraftSectionPayload;
  sectionPanel: SectionPanel;
  placementGroups?: Array<{ id: string; name: string }>;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const meta = SQUARE_COMPONENTS[section.section_type];
  const configuredPlacementGroupId = stableId(
    section.settings.placement_group_id,
  );
  const placementGroupIsAvailable = placementGroups.some(
    (group) => group.id === configuredPlacementGroupId,
  );
  const placementGroupId = placementGroupIsAvailable
    ? configuredPlacementGroupId
    : "";
  if (
    section.section_type === "menu_highlights" ||
    section.section_type === "featured_menu"
  )
    return (
      <FeaturedItemsEditor
        restaurantId={restaurantId}
        section={section}
        onChange={onChange}
      />
    );
  if (sectionPanel === "content") {
    return (
      <InspectorGroup
        title={
          section.section_type === "order_discovery"
            ? "Découverte & publicité"
            : meta?.label
              ? ["text_and_image", "scrolling_text", "animated_text"].includes(
                  section.section_type,
                )
                ? t(meta.label)
                : humanize(section.section_type)
              : "Section"
        }
      >
        <SectionContentEditors
          restaurantId={restaurantId}
          section={section}
          onChange={onChange}
        />
      </InspectorGroup>
    );
  }

  if (sectionPanel === "appearance") {
    return (
      <>
        <InspectorGroup title={t("editorLayoutColor")}>
          <div
            className="sqe-layout-picker"
            role="group"
            aria-label={t("editorLayout")}
          >
            <span>{t("editorLayout")}</span>
            <div className="sqe-layout-choices">
              {squareLayouts(section.section_type).map((layout) => {
                const Icon =
                  layout.value === "split"
                    ? Columns2
                    : layout.value.includes("left")
                      ? AlignLeft
                      : layout.value === "centered"
                        ? AlignCenter
                        : layout.value.includes("grid")
                          ? GalleryHorizontal
                          : LayoutTemplate;
                return (
                  <button
                    type="button"
                    key={layout.value}
                    className="sqe-layout-choice"
                    data-field-id="section.layout"
                    aria-label={t(layout.labelKey)}
                    aria-pressed={
                      (section.settings.image_only &&
                      section.section_type === "text_and_image"
                        ? layout.value === "full_width"
                        : section.layout === layout.value) ||
                      (section.layout === "default" &&
                        layout.value === "centered")
                    }
                    onClick={() =>
                      section.section_type === "text_and_image"
                        ? onChange([], {
                            ...section,
                            layout: layout.value,
                            settings: {
                              ...section.settings,
                              image_only: false,
                            },
                          })
                        : onChange(["layout"], layout.value)
                    }
                  >
                    {section.section_type === "text_and_image" ? (
                      <>
                        <EditorialLayoutPreview layout={layout.value} />
                        <span>{t(layout.labelKey)}</span>
                      </>
                    ) : section.section_type === "hero_banner" ? (
                      <span
                        aria-hidden="true"
                        className={`sqe-layout-mini sqe-layout-mini--${layout.value}`}
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <>
                        <Icon strokeWidth={1.5} />
                        <span>{t(layout.labelKey)}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {section.section_type !== "order_discovery" ? (
            <>
              {section.section_type === "hero_banner" && (
                <>
                  <div
                    className="sqe-choice-field"
                    role="group"
                    aria-label={t("editorAlignment")}
                  >
                    <span>{t("editorAlignment")}</span>
                    <div className="sqe-segmented">
                      {(["left", "center", "right"] as const).map((align) => {
                        const Icon =
                          align === "left"
                            ? AlignLeft
                            : align === "right"
                              ? AlignRight
                              : AlignCenter;
                        return (
                          <button
                            key={align}
                            type="button"
                            aria-label={t(`editorAlign_${align}`)}
                            aria-pressed={
                              (section.settings.text_align ??
                                section.settings.text_alignment ??
                                (section.layout === "left_aligned"
                                  ? "left"
                                  : "center")) === align
                            }
                            onClick={() =>
                              onChange(["settings"], {
                                ...section.settings,
                                text_align: align,
                                text_alignment: align,
                              })
                            }
                          >
                            <Icon size={20} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    className="sqe-choice-field"
                    role="group"
                    aria-label={t("editorSectionHeight")}
                  >
                    <span>{t("editorSectionHeight")}</span>
                    <div className="sqe-segmented">
                      {[
                        ["compact", "XS"],
                        ["auto", "S"],
                        ["medium", "M"],
                        ["tall", "L"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={
                            (section.settings.height ?? "medium") === value
                          }
                          onClick={() =>
                            onChange(["settings", "height"], value)
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {["text_and_image", "scrolling_text", "animated_text"].includes(
                section.section_type,
              ) && (
                <EditorialAppearanceFields
                  section={section}
                  onChange={onChange}
                />
              )}
              <ColorStylePicker
                custom
                value={String(section.settings.color_style ?? "default")}
                onChange={(id) => onChange(["settings", "color_style"], id)}
              />
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
              {["text_and_image", "scrolling_text", "animated_text"].includes(
                section.section_type,
              ) ? (
                <ImageUploadField
                  restaurantId={restaurantId}
                  label={t("editorBackgroundMedia")}
                  currentUrl={string(section.settings.bg_image)}
                  onUploaded={(url) => onChange(["settings", "bg_image"], url)}
                  onRemove={() => onChange(["settings", "bg_image"], "")}
                />
              ) : (
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
              )}
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
          description="Choisissez une catégorie précise. Si elle disparaît du menu, le bloc utilise temporairement la première catégorie visible."
        >
          <InspectorField label="Type d’emplacement">
            <select
              data-field-id="section.settings.placement_mode"
              value={string(section.settings.placement_mode) || "inside_group"}
              onChange={(event) =>
                onChange(["settings", "placement_mode"], event.target.value)
              }
              className={controlClass}
            >
              <option value="inside_group">Dans une catégorie</option>
              <option value="between_groups">Entre les catégories</option>
            </select>
          </InspectorField>
          <InspectorField label="Catégorie ciblée">
            <select
              data-field-id="section.settings.placement_group_id"
              value={placementGroupId}
              onChange={(event) =>
                onChange(["settings", "placement_group_id"], event.target.value)
              }
              className={controlClass}
              disabled={placementGroups.length === 0}
            >
              <option value="">
                {placementGroups.length === 0
                  ? "Aucune catégorie disponible"
                  : "Première catégorie visible"}
              </option>
              {placementGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </InspectorField>
          {configuredPlacementGroupId && !placementGroupIsAvailable ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              La catégorie enregistrée n’est plus visible. La bannière est
              temporairement placée dans la première catégorie disponible.
            </p>
          ) : null}
          {(string(section.settings.placement_mode) || "inside_group") ===
          "between_groups" ? (
            <InspectorField label="Position relative">
              <select
                data-field-id="section.settings.placement_edge"
                value={string(section.settings.placement_edge) || "after"}
                onChange={(event) =>
                  onChange(["settings", "placement_edge"], event.target.value)
                }
                className={controlClass}
              >
                <option value="before">Avant cette catégorie</option>
                <option value="after">Après cette catégorie</option>
              </select>
            </InspectorField>
          ) : (
            <InspectorField
              label="Afficher après"
              hint="Le preview se met à jour immédiatement."
            >
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
                      Math.min(
                        50,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className={controlClass}
                />
                <span className="text-xs text-slate-500">produits</span>
              </div>
            </InspectorField>
          )}
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
      </InspectorGroup>
    </>
  );
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stableId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
