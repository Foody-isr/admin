"use client";

import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { InspectorField, ToggleField, controlClass } from "./controls";

/** Edits the standalone video's persisted layout and playback preferences. */
export function VideoSettingsFields({
  section,
  onChange,
  showLayout = true,
}: {
  section: DraftSectionPayload;
  onChange: (path: StatePath, value: unknown) => void;
  showLayout?: boolean;
}) {
  const { t } = useI18n();
  const settings = section.settings;
  const autoplay = settings.video_autoplay === true;
  const set = (key: string, value: unknown) =>
    onChange(["settings", key], value);
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-sm font-semibold">
        {t("editorVideoPlayback")}
      </legend>
      {showLayout && (
        <ToggleField
          fieldId="section.layout"
          label={t("editorVideoFullWidth")}
          checked={section.layout === "full_width"}
          onChange={(enabled) =>
            onChange(["layout"], enabled ? "full_width" : "contained")
          }
        />
      )}
      <InspectorField label={t("editorSectionHeight")}>
        <select
          className={controlClass}
          data-field-id="section.settings.video_height"
          value={String(settings.video_height ?? "original")}
          onChange={(event) => set("video_height", event.target.value)}
        >
          <option value="original">{t("editorVideoOriginalHeight")}</option>
          {["xs", "s", "m", "l"].map((value) => (
            <option key={value} value={value}>{value.toUpperCase()}</option>
          ))}
        </select>
      </InspectorField>
      <InspectorField label={t("editorSectionSpacing")}>
        <select
          className={controlClass}
          data-field-id="section.settings.padding"
          value={String(settings.padding ?? "normal")}
          onChange={(event) => set("padding", event.target.value)}
        >
          {["none", "compact", "normal", "spacious"].map((value) => (
            <option key={value} value={value}>
              {t(`editorSpacing_${value}`)}
            </option>
          ))}
        </select>
      </InspectorField>
      <ToggleField
        fieldId="section.settings.video_controls"
        label={t("editorVideoControls")}
        checked={settings.video_controls !== false}
        onChange={(value) => set("video_controls", value)}
      />
      <ToggleField
        fieldId="section.settings.video_autoplay"
        label={t("editorVideoAutoplay")}
        checked={autoplay}
        onChange={(value) => set("video_autoplay", value)}
      />
      <ToggleField
        fieldId="section.settings.video_loop"
        label={t("editorVideoLoop")}
        checked={settings.video_loop === true}
        onChange={(value) => set("video_loop", value)}
      />
      <ToggleField
        fieldId="section.settings.video_muted"
        label={t("editorVideoMuted")}
        description={autoplay ? t("editorVideoAutoplayHint") : undefined}
        disabled={autoplay}
        checked={autoplay || settings.video_muted === true}
        onChange={(value) => set("video_muted", value)}
      />
    </fieldset>
  );
}
