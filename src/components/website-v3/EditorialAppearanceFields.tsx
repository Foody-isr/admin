"use client";
import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { InspectorField, ToggleField, controlClass } from "./controls";

/** Geometry and motion controls available to both starter and manually inserted editorial sections. */
export function EditorialAppearanceFields({
  section,
  onChange,
}: {
  section: DraftSectionPayload;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const scrolling = section.section_type === "scrolling_text";
  const select = (
    key: string,
    label: string,
    values: string[],
    prefix: string,
    fallback: string,
    content = false,
  ) => (
    <InspectorField label={t(label)}>
      <select
        className={controlClass}
        data-field-id={`section.${content ? "content" : "settings"}.${key}`}
        value={String(
          (content ? section.content : section.settings)[key] ?? fallback,
        )}
        onChange={(event) =>
          onChange([content ? "content" : "settings", key], event.target.value)
        }
      >
        {values.map((value) => (
          <option value={value} key={value}>
            {t(`${prefix}${value}`)}
          </option>
        ))}
      </select>
    </InspectorField>
  );
  return (
    <>
      {select(
        "padding",
        "editorSectionSpacing",
        ["none", "compact", "normal", "spacious"],
        "editorSpacing_",
        scrolling ? "compact" : "normal",
      )}
      {scrolling ? (
        <>
          {select(
            "speed",
            "editorScrollSpeed",
            ["slow", "normal", "fast"],
            "editorSpeed_",
            "normal",
            true,
          )}
          {select(
            "direction",
            "editorScrollDirection",
            ["left", "right"],
            "editorDirection_",
            "left",
          )}
        </>
      ) : (
        <>
          {select(
            "text_alignment",
            "editorAlignment",
            ["left", "center", "right"],
            "editorAlign_",
            "left",
          )}
          {select(
            "image_fit",
            "editorMediaFit",
            ["cover", "contain"],
            "editorFit_",
            "cover",
          )}
          {select(
            "image_position",
            "editorImagePosition",
            ["top", "center", "bottom"],
            "editorPosition_",
            "center",
          )}
          <InspectorField label={t("editorSectionHeight")}>
            <select
              className={controlClass}
              value={String(section.settings.height ?? "medium")}
              onChange={(event) =>
                onChange(["settings", "height"], event.target.value)
              }
            >
              {["compact", "medium", "tall", "full"].map((value, index) => (
                <option value={value} key={value}>
                  {["S", "M", "L", "XL"][index]}
                </option>
              ))}
            </select>
          </InspectorField>
          <ToggleField
            fieldId="section.settings.image_only"
            label={t("editorImageOnly")}
            checked={section.settings.image_only === true}
            onChange={(value) => onChange(["settings", "image_only"], value)}
          />
        </>
      )}
    </>
  );
}
