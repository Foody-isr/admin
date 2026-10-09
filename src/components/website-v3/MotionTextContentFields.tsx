"use client";

import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import {
  InspectorField,
  ColorField,
  ToggleField,
  controlClass,
} from "./controls";

/** Stable text inputs keep moving content editable without chasing the canvas. */
export function MotionTextContentFields({
  section,
  onChange,
}: {
  section: DraftSectionPayload;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const animated = section.section_type === "animated_text";
  const phrases = Array.isArray(section.content.phrases)
    ? section.content.phrases
    : [];
  return (
    <>
      <ToggleField
        fieldId="section.settings.show_text"
        label={t("editorShowText")}
        checked={section.settings.show_text !== false}
        onChange={(value) => onChange(["settings", "show_text"], value)}
      />
      <InspectorField
        label={t(animated ? "editorFixedText" : "editorScrollingText")}
        hint={t("editorMotionTextHint")}
      >
        <textarea
          className={`${controlClass} min-h-24 py-3`}
          data-field-id="section.content.text"
          rows={3}
          maxLength={10000}
          value={String(section.content.text ?? "")}
          onChange={(event) =>
            onChange(["content", "text"], event.target.value)
          }
        />
      </InspectorField>
      {animated && (
        <>
          <InspectorField
            label={t("editorRotatingPhrases")}
            hint={t("editorRotatingPhrasesHint")}
            error={
              phrases.length > 20 ||
              phrases.some(
                (phrase) =>
                  typeof phrase?.text === "string" &&
                  [...phrase.text].length > 1000,
              )
                ? t("editorRotatingPhrasesLimit")
                : undefined
            }
          >
            <textarea
              className={`${controlClass} min-h-32 py-3`}
              data-field-id="section.content.phrases"
              rows={5}
              maxLength={20019}
              value={phrases
                .map((phrase) =>
                  typeof phrase?.text === "string" ? phrase.text : "",
                )
                .join("\n")}
              onChange={(event) =>
                onChange(
                  ["content", "phrases"],
                  event.target.value.split("\n").map((text) => ({ text })),
                )
              }
            />
          </InspectorField>
          <ColorField
            fieldId="section.settings.rotating_color"
            label={t("editorRotatingColor")}
            value={String(section.settings.rotating_color ?? "")}
            fallback="#d7807f"
            onChange={(value) =>
              onChange(["settings", "rotating_color"], value)
            }
          />
          <InspectorField label={t("editorAnimationSpeed")}>
            <select
              className={controlClass}
              data-field-id="section.settings.speed"
              value={String(section.settings.speed ?? "normal")}
              onChange={(event) =>
                onChange(["settings", "speed"], event.target.value)
              }
            >
              {["slow", "normal", "fast"].map((speed) => (
                <option key={speed} value={speed}>
                  {t(`editorSpeed_${speed}`)}
                </option>
              ))}
            </select>
          </InspectorField>
        </>
      )}
    </>
  );
}
