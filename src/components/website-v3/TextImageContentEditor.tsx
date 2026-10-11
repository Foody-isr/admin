"use client";
import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { InspectorField, ToggleField, controlClass } from "./controls";
import { ImageUploadField } from "./SectionContentEditors";

/** Edits independent image/text groups while preserving the first group's historic flat content. */
export function TextImageContentEditor({
  section,
  restaurantId,
  onChange,
}: {
  section: DraftSectionPayload;
  restaurantId: number;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const groups: Record<string, unknown>[] = Array.isArray(
    section.content.groups,
  )
    ? section.content.groups.filter(
        (group): group is Record<string, unknown> =>
          Boolean(group) && typeof group === "object" && !Array.isArray(group),
      )
    : [];
  const update = (index: number, key: string, value: unknown) =>
    index === 0
      ? onChange(["content", key], value)
      : onChange(
          ["content", "groups"],
          groups.map((group, i) =>
            i === index - 1 ? { ...group, [key]: value } : group,
          ),
        );
  return (
    <div className="space-y-5">
      {[section.content, ...groups].map((group, index) => (
        <div key={index} className="space-y-4 border-b pb-5">
          <h3 className="font-semibold">
            {t("editorTextImageGroup")} {index + 1}
          </h3>
          {["title", "body", "cta_text", "cta_link"].map((field) => (
            <InspectorField key={field} label={t(`editorField_${field}`)}>
              {field === "body" ? (
                <textarea
                  className={controlClass}
                  rows={3}
                  value={String(group[field] ?? "")}
                  onChange={(event) => update(index, field, event.target.value)}
                />
              ) : (
                <input
                  className={controlClass}
                  value={String(group[field] ?? "")}
                  onChange={(event) => update(index, field, event.target.value)}
                />
              )}
            </InspectorField>
          ))}
          <ImageUploadField
            restaurantId={restaurantId}
            label={t("editorBackgroundMedia")}
            currentUrl={String(group.image_url ?? "")}
            onUploaded={(url) => update(index, "image_url", url)}
            onRemove={() => update(index, "image_url", "")}
          />
          {index > 0 && (
            <button
              className="sqe-button sqe-button-secondary"
              onClick={() =>
                onChange(
                  ["content", "groups"],
                  groups.filter((_, i) => i !== index - 1),
                )
              }
            >
              {t("editorRemoveTextImageGroup")}
            </button>
          )}
        </div>
      ))}
      <button
        className="sqe-button sqe-button-secondary"
        onClick={() =>
          onChange(
            ["content", "groups"],
            [
              ...groups,
              {
                title: t("editorHeadline"),
                body: "",
                image_url: "",
                cta_text: "",
                cta_link: "",
              },
            ],
          )
        }
      >
        {t("editorAddTextImageGroup")}
      </button>
      {["title", "body", "cta_text", "image_url"].map((field) => (
        <ToggleField
          key={field}
          fieldId={`section.settings.show_${field}`}
          label={t(`editorField_${field}`)}
          checked={section.settings[`show_${field}`] !== false}
          onChange={(value) => onChange(["settings", `show_${field}`], value)}
        />
      ))}
    </div>
  );
}
