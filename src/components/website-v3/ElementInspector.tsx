"use client";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  EDITOR_ELEMENTS,
  isInlineTextElement,
} from "@/lib/website-v3/editor-elements";
import {
  sectionKey,
  type DraftSectionPayload,
  type StatePath,
} from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  ToggleField,
  controlClass,
} from "./controls";
import {
  ImageUploadField,
  VideoUploadField,
  heroImageReplacement,
} from "./SectionContentEditors";
import { getDefaultContent } from "@/components/website/SectionEditors";

const labels: Record<string, string> = {
  headline: "editorHeadline",
  subheadline: "editorText",
  title: "editorHeadline",
  body: "editorText",
  text: "editorText",
  custom_text: "editorText",
  cta_text: "editorButton",
  image_url: "editorBackgroundMedia",
};

/** Names semantic canvas elements in the editor's active language. */
export function editorElementLabel(
  field: string,
  t: (key: string) => string,
): string {
  return t(labels[field] ?? field);
}

/** Lists a section's elements separately from its layout, with non-destructive visibility controls. */
export function SectionElements({
  section,
  onSelect,
  onChange,
}: {
  section: DraftSectionPayload;
  onSelect: (key: string, field?: string) => void;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="sqe-element-list">
      {(EDITOR_ELEMENTS[section.section_type] ?? []).map((field) => (
        <div className="sqe-element-row" key={field}>
          <button onClick={() => onSelect(sectionKey(section), field)}>
            {editorElementLabel(field, t)}
            <ChevronRight size={18} />
          </button>
          <input
            type="checkbox"
            role="switch"
            aria-label={editorElementLabel(field, t)}
            checked={
              section.settings[`show_${field}`] !== false &&
              Boolean(
                section.content[field] ||
                  (field === "image_url" && section.content.video_url),
              )
            }
            onChange={(event) => {
              const enabled = event.target.checked;
              onChange([], {
                ...section,
                settings: { ...section.settings, [`show_${field}`]: enabled },
                content:
                  enabled &&
                  isInlineTextElement(section.section_type, field) &&
                  !section.content[field]
                    ? {
                        ...section.content,
                        [field]:
                          getDefaultContent(section.section_type)[field] ||
                          editorElementLabel(field, t),
                      }
                    : section.content,
              });
              if (
                enabled &&
                field === "image_url" &&
                !section.content.image_url
              )
                onSelect(sectionKey(section), field);
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Shows controls for exactly the canvas element selected by the user. */
export function ElementInspector({
  restaurantId,
  section,
  field,
  onChange,
}: {
  restaurantId: number;
  section: DraftSectionPayload;
  field: string;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const setting = (suffix: string) =>
    `${field === "cta_text" ? "cta" : field}_${suffix}`;
  const set = (suffix: string, value: unknown) =>
    onChange(["settings", setting(suffix)], value);
  const heading = field === "headline" || field === "title";
  const bold =
    section.settings[setting("weight")] === "bold" ||
    (!section.settings[setting("weight")] && heading);
  if (field === "image_url")
    return (
      <div className="sqe-panel-body space-y-5">
        <ImageUploadField
          restaurantId={restaurantId}
          label={t("editorBackgroundMedia")}
          currentUrl={String(
            section.content.image_url || section.settings.bg_image || "",
          )}
          onUploaded={(url) =>
            section.section_type === "hero_banner"
              ? onChange([], heroImageReplacement(section, url))
              : onChange(["content", "image_url"], url)
          }
          onRemove={() =>
            onChange([], {
              ...section,
              content: { ...section.content, image_url: "" },
              settings: { ...section.settings, bg_image: "" },
            })
          }
        />
        {section.section_type === "hero_banner" && (
          <VideoUploadField
            restaurantId={restaurantId}
            currentUrl={String(section.content.video_url ?? "")}
            posterUrl={String(section.content.image_url ?? "")}
            onUploaded={(url) => onChange(["content", "video_url"], url)}
            onRemove={() => onChange(["content", "video_url"], "")}
          />
        )}
      </div>
    );
  if (!isInlineTextElement(section.section_type, field)) return null;
  return (
    <div className="sqe-panel-body space-y-5">
      <p className="sqe-element-hint">{t("editorInlineHint")}</p>
      <InspectorField label={t("editorTextStyle")}>
        <select
          className={controlClass}
          value={String(section.settings[setting("size")] ?? "md")}
          onChange={(event) => set("size", event.target.value)}
        >
          {(heading ? ["sm", "md", "lg", "xl"] : ["sm", "md", "lg"]).map(
            (size) => (
              <option key={size} value={size}>
                {t(`editorSize_${size}`)}
              </option>
            ),
          )}
        </select>
      </InspectorField>
      <div
        className="sqe-element-format"
        role="group"
        aria-label={t("editorTextStyle")}
      >
        <button
          aria-label={t("editorBold")}
          aria-pressed={bold}
          onClick={() => set("weight", bold ? "normal" : "bold")}
        >
          <strong>B</strong>
        </button>
        <button
          aria-label={t("editorItalic")}
          aria-pressed={section.settings[setting("italic")] === true}
          onClick={() =>
            set("italic", section.settings[setting("italic")] !== true)
          }
        >
          <em>I</em>
        </button>
      </div>
      <ColorField
        fieldId={`section.settings.${setting("color")}`}
        fallback="#111111"
        label={t("editorTextColor")}
        value={String(section.settings[setting("color")] ?? "")}
        onChange={(value) => set("color", value)}
      />
      <ToggleField
        fieldId={`section.settings.${setting("uppercase")}`}
        label={t("editorAllCaps")}
        checked={section.settings[setting("uppercase")] === true}
        onChange={(value) => set("uppercase", value)}
      />
      {field === "cta_text" && (
        <InspectorField label={t("editorLink")}>
          <input
            className={controlClass}
            value={String(section.content.cta_link ?? "")}
            onChange={(event) =>
              onChange(["content", "cta_link"], event.target.value)
            }
          />
        </InspectorField>
      )}
    </div>
  );
}
