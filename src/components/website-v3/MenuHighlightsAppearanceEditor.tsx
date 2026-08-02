"use client";

import { useI18n } from "@/lib/i18n";
import type { StatePath } from "@/lib/website-v3/types";
import { ColorField, InspectorGroup } from "./controls";

export function MenuHighlightsAppearanceEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  return (
    <InspectorGroup
      title={t("websiteV3HighlightsTitle")}
      description={t("websiteV3HighlightsDescription")}
    >
      {(
        [
          ["custom_bg", "websiteV3HighlightsSectionBackground", "#ffffff"],
          ["custom_text", "websiteV3HighlightsSectionText", "#111827"],
          ["card_bg", "websiteV3HighlightsCardBackground", "#f8fafc"],
          ["card_text", "websiteV3HighlightsCardText", "#111827"],
          ["card_muted", "websiteV3HighlightsCardMuted", "#64748b"],
          ["price_color", "websiteV3HighlightsPrice", "#111827"],
          ["accent_color", "websiteV3HighlightsAccent", "#315fce"],
        ] as const
      ).map(([key, label, fallback]) => (
        <ColorField
          key={key}
          fieldId={`section.settings.${key}`}
          label={t(label)}
          value={string(value[key])}
          fallback={fallback}
          onChange={(next) => onChange(["settings", key], next)}
        />
      ))}
    </InspectorGroup>
  );
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
