"use client";

import { useI18n } from "@/lib/i18n";
import { ColorField } from "./controls";

export type CategoryBarPalette = {
  bg?: string;
  text?: string;
  accent?: string;
  divider?: string;
};

type SectionColors = Record<string, unknown> & {
  categoryBar?: CategoryBarPalette;
  categoryBarSticky?: CategoryBarPalette;
};

export function CategoryBarStateEditor({
  value,
  onChange,
}: {
  value: SectionColors | null | undefined;
  onChange: (value: SectionColors) => void;
}) {
  const { t } = useI18n();
  const sectionColors = value ?? {};
  // Existing restaurants may still carry the former sticky-only palette. It
  // wins for compatibility, then the next edit canonicalizes everything into
  // the one palette now used before and after pinning.
  const effective = {
    ...palette(sectionColors.categoryBar),
    ...palette(sectionColors.categoryBarSticky),
  };

  const updatePalette = (key: keyof CategoryBarPalette, next: string) => {
    const { categoryBarSticky: _legacySticky, ...rest } = sectionColors;
    onChange({
      ...rest,
      categoryBar: { ...effective, [key]: next },
    });
  };

  return (
    <div className="space-y-5">
      <PaletteEditor
        prefix="page.appearance_overrides.section_colors.categoryBar"
        title={t("websiteV3CategoryBarNormal")}
        value={effective}
        onChange={updatePalette}
      />
    </div>
  );
}

function PaletteEditor({
  prefix,
  title,
  value,
  onChange,
}: {
  prefix: string;
  title: string;
  value: CategoryBarPalette;
  onChange: (key: keyof CategoryBarPalette, value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold text-slate-700">{title}</legend>
      <ColorField
        fieldId={`${prefix}.bg`}
        label={t("websiteV3CategoryBarBackground")}
        value={value.bg ?? ""}
        fallback="#ffffff"
        onChange={(next) => onChange("bg", next)}
      />
      <ColorField
        fieldId={`${prefix}.text`}
        label={t("websiteV3CategoryBarText")}
        value={value.text ?? ""}
        fallback="#111827"
        onChange={(next) => onChange("text", next)}
      />
      <ColorField
        fieldId={`${prefix}.accent`}
        label={t("websiteV3CategoryBarActive")}
        value={value.accent ?? ""}
        fallback="#315fce"
        onChange={(next) => onChange("accent", next)}
      />
      <ColorField
        fieldId={`${prefix}.divider`}
        label={t("websiteV3CategoryBarDivider")}
        value={value.divider ?? ""}
        fallback="#e5e7eb"
        onChange={(next) => onChange("divider", next)}
      />
    </fieldset>
  );
}

function palette(value: unknown): CategoryBarPalette {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as CategoryBarPalette)
    : {};
}
