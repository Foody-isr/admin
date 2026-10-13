"use client";

import Link from "next/link";
import type { CateringService } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { DraftPagePayload, StatePath } from "@/lib/website-v3/types";
import { record } from "@/lib/website-v3/restaurant-themes";
import { SectionImageUploader } from "./SupportingContentEditors";
import { InspectorField, InspectorGroup, ToggleField, controlClass } from "./controls";

/** Edits catering copy and imagery from its dedicated contextual panel. */
export function CateringPageEditor({
  page,
  restaurantId,
  services,
  onChange,
}: {
  page: Extract<DraftPagePayload, { type: "catering" }>;
  restaurantId: number;
  services: CateringService[];
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const content = record(page.appearance_overrides.catering_page);
  const subtitles = record(content.service_subtitles);
  const activeServices = services.filter((service) => service.is_active);
  const update = (patch: Record<string, unknown>) =>
    onChange(["appearance_overrides", "catering_page"], {
      ...content,
      ...patch,
    });
  const reset = (key: string) => {
    const { [key]: _removed, ...next } = content;
    onChange(["appearance_overrides", "catering_page"], next);
  };

  return (
    <InspectorGroup
      groupId="page.catering_content"
      title={t("websiteV3CateringContentTitle")}
      description={t("websiteV3CateringContentDescription")}
    >
      <SectionImageUploader
        restaurantId={restaurantId}
        framing={content.cover_framing}
        onFramingChange={value => update({cover_framing: value})}
        currentUrl={Object.hasOwn(content, "cover_url") ? text(content.cover_url) : text(page.appearance_overrides.cover_url)}
        onUploaded={(url) => update({ cover_url: url })}
        onRemove={() => update({ cover_url: "" })}
        label={t("websiteV3CateringCoverImageLabel")}
        alwaysShowActions
        mediaField="page.appearance_overrides.catering_page.cover_url"
        actionLabels={{ upload: t("websiteV3CateringCoverUpload"), replace: t("websiteV3CateringCoverReplace"), remove: t("websiteV3CateringCoverRemove"), uploading: t("websiteV3CateringCoverUploading") }}
      />
      <p>{t("websiteV3CateringVisibilityDescription").replace("{n}", String(activeServices.length))}</p>
      <Link href={`/${restaurantId}/catering/services`} className="sqe-button">{t("websiteV3CateringVisibilityAction")}</Link>
      <CateringCopyField
        fieldId="page.appearance_overrides.catering_page.hero_title"
        label={t("websiteV3CateringHeroTitle")}
        value={text(content.hero_title)}
        placeholder={t("websiteV3CateringHeroTitleDefault")}
        customized={Object.hasOwn(content, "hero_title")}
        onChange={(value) => update({ hero_title: value })}
        onReset={() => reset("hero_title")}
      />
      <CateringCopyField
        fieldId="page.appearance_overrides.catering_page.hero_subtitle"
        label={t("websiteV3CateringHeroSubtitle")}
        value={text(content.hero_subtitle)}
        placeholder={t("websiteV3CateringHeroSubtitleDefault")}
        customized={Object.hasOwn(content, "hero_subtitle")}
        multiline
        onChange={(value) => update({ hero_subtitle: value })}
        onReset={() => reset("hero_subtitle")}
      />
      <ToggleField
        fieldId="page.appearance_overrides.catering_page.show_restaurant_name"
        label={t("websiteV3CateringShowRestaurantName")}
        checked={content.show_restaurant_name !== false}
        onChange={(value) => update({ show_restaurant_name: value })}
      />
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          {t("websiteV3CateringServicesSection")}
        </p>
      </div>
      <CateringCopyField
        fieldId="page.appearance_overrides.catering_page.chooser_title"
        label={t("websiteV3CateringChooserTitle")}
        value={text(content.chooser_title)}
        placeholder={t("websiteV3CateringChooserTitleDefault")}
        customized={Object.hasOwn(content, "chooser_title")}
        onChange={(value) => update({ chooser_title: value })}
        onReset={() => reset("chooser_title")}
      />
      <CateringCopyField
        fieldId="page.appearance_overrides.catering_page.chooser_subtitle"
        label={t("websiteV3CateringChooserSubtitle")}
        value={text(content.chooser_subtitle)}
        placeholder={t("websiteV3CateringChooserSubtitleDefault")}
        customized={Object.hasOwn(content, "chooser_subtitle")}
        multiline
        onChange={(value) => update({ chooser_subtitle: value })}
        onReset={() => reset("chooser_subtitle")}
      />
      <CateringCopyField
        fieldId="page.appearance_overrides.catering_page.service_action_label"
        label={t("websiteV3CateringActionLabel")}
        value={text(content.service_action_label)}
        placeholder={t("websiteV3CateringActionLabelDefault")}
        customized={Object.hasOwn(content, "service_action_label")}
        onChange={(value) => update({ service_action_label: value })}
        onReset={() => reset("service_action_label")}
      />
      <ToggleField
        fieldId="page.appearance_overrides.catering_page.show_steps"
        label={t("websiteV3CateringShowSteps")}
        description={t("websiteV3CateringShowStepsDescription")}
        checked={content.show_steps !== false}
        onChange={(value) => update({ show_steps: value })}
      />
      {activeServices.length > 0 ? (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-700">
            {t("websiteV3CateringServiceSubtitles")}
          </p>
          <p className="text-[11px] leading-4 text-slate-400">
            {t("websiteV3CateringServiceSubtitlesDescription")}
          </p>
          {activeServices.map((service) => {
            const key = String(service.id);
            const customized = Object.hasOwn(subtitles, key);
            return (
              <CateringCopyField
                key={service.id}
                fieldId={`page.appearance_overrides.catering_page.service_subtitles.${service.id}`}
                label={service.name}
                value={text(subtitles[key])}
                placeholder={
                  service.description ||
                  t("websiteV3CateringServiceSubtitleDefault")
                }
                customized={customized}
                multiline
                onChange={(value) =>
                  update({ service_subtitles: { ...subtitles, [key]: value } })
                }
                onReset={() => {
                  const { [key]: _removed, ...nextSubtitles } = subtitles;
                  update({ service_subtitles: nextSubtitles });
                }}
              />
            );
          })}
        </div>
      ) : null}
      {Object.keys(content).length > 0 ? (
        <button
          type="button"
          onClick={() =>
            onChange(["appearance_overrides", "catering_page"], {})
          }
          className="text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          {t("websiteV3CateringResetAll")}
        </button>
      ) : null}
    </InspectorGroup>
  );
}

function CateringCopyField({
  fieldId,
  label,
  value,
  placeholder,
  customized,
  multiline = false,
  onChange,
  onReset,
}: {
  fieldId: string;
  label: string;
  value: string;
  placeholder: string;
  customized: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <InspectorField label={label}>
      <div className="space-y-1.5">
        {multiline ? (
          <textarea
            data-field-id={fieldId}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={`${controlClass} min-h-20 py-2.5 leading-5`}
          />
        ) : (
          <input
            data-field-id={fieldId}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={controlClass}
          />
        )}
        {customized ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-semibold text-slate-500 hover:text-brand-600"
          >
            {t("websiteV3CateringResetField")}
          </button>
        ) : null}
      </div>
    </InspectorField>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
