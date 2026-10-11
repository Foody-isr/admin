"use client";

import { NumberInput } from "@/components/ui/NumberInput";
import { FontSelect } from "@/components/website-menu/FontSelect";
import {
  uploadWebsiteFont,
  type TypographyOverrides,
  type TypographyRoleKey,
  type TypographyRoleOverride,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { mergeFontLibrary, mergeTypography } from "@/lib/website-v3/typography";

/** Edits a page's semantic text role, inheriting the site's uploaded fonts. */
export function OrderTypographyFields({
  restaurantId,
  role,
  base,
  value,
  onChange,
}: {
  restaurantId: number;
  role: TypographyRoleKey;
  base: TypographyOverrides;
  value: TypographyOverrides;
  onChange: (value: TypographyOverrides) => void;
}) {
  const { t } = useI18n();
  const effective = mergeTypography(base, value);
  const settings = effective.roles?.[role] ?? {};
  const patch = (next: TypographyRoleOverride) =>
    onChange({
      ...value,
      roles: { ...value.roles, [role]: { ...value.roles?.[role], ...next } },
    });
  return (
    <>
      <div className="sqe-field">
        <span>{t("editorFonts")}</span>
        <FontSelect
          value={settings.font ?? ""}
          defaultLabel={t("editorOrderInherited")}
          extraFonts={effective.extraFonts ?? []}
          onUploadFont={(file) => uploadWebsiteFont(restaurantId, file)}
          onChange={(font, picked) =>
            onChange({
              ...value,
              roles: {
                ...value.roles,
                [role]: { ...value.roles?.[role], font: font || undefined },
              },
              extraFonts: mergeFontLibrary(
                value.extraFonts,
                picked ? [picked] : [],
              ),
            })
          }
        />
      </div>
      <label className="sqe-field">
        {t("editorFontScale")}
        <NumberInput
          format={String}
          min={50}
          max={400}
          step={5}
          value={Math.round((settings.sizeMult ?? 1) * 100)}
          onChange={size => patch({sizeMult: size / 100})}
        />
      </label>
      <label className="sqe-field">
        {t("editorOrderTextWeight")}
        <select
          value={settings.weight ?? ""}
          onChange={(event) =>
            patch({
              weight: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        >
          <option value="">{t("editorOrderInherited")}</option>
          {(
            effective.extraFonts?.find((font) => font.family === settings.font)
              ?.weights ?? [100, 200, 300, 400, 500, 600, 700, 800, 900]
          ).map((weight) => (
            <option key={weight} value={weight}>
              {weight}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
