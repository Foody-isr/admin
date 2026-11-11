"use client";

import { useEffect, useState } from "react";
import { FontSelect } from "@/components/website-menu/FontSelect";
import { FontUploadPanel } from "@/components/website-menu/FontUploadPanel";
import { NumberInput } from "@/components/ui/NumberInput";
import {
  uploadWebsiteFont,
  type ExtraFont,
  type TypographyOverrides,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { curatedFontWeights, loadWebsiteFont } from "@/lib/website-fonts";
import { mergeFontLibrary } from "@/lib/website-v3/typography";

/** Edits global fonts while retaining the existing role overrides and font library. */
export function SiteFontsEditor({
  restaurantId,
  typography,
  heading,
  body,
  scaleAndWeight,
  onChange,
}: {
  restaurantId: number;
  typography: TypographyOverrides;
  heading: string;
  body: string;
  scaleAndWeight: boolean;
  onChange: (value: TypographyOverrides) => void;
}) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const fonts = typography.extraFonts;
  const site = typography.site;
  useEffect(() => {
    for (const family of [heading, body]) {
      const font = fonts?.find((value) => value.family === family);
      loadWebsiteFont(family, font?.weights, font);
    }
  }, [heading, body, fonts]);
  const upload = (file: File) => uploadWebsiteFont(restaurantId, file);
  const addFont = (font: ExtraFont) => {
    onChange({ ...typography, extraFonts: mergeFontLibrary(fonts, [font]) });
    setUploading(false);
  };
  return (
    <>
      {(
        [
          ["headingFont", "headingSizeMult", "headingWeight", "editorHeadings", heading],
          ["bodyFont", "bodySizeMult", "bodyWeight", "editorBody", body],
        ] as const
      ).map(([fontKey, sizeKey, weightKey, label, value]) => {
        const weights = fonts?.find(font => font.family === value)?.weights
          ?? curatedFontWeights(value)
          ?? [100, 200, 300, 400, 500, 600, 700, 800, 900];
        return (
          <fieldset key={fontKey} className="grid min-w-0 gap-3">
            <legend className="mb-2 font-semibold">{t(label)}</legend>
            <FontSelect
              value={value}
              defaultLabel={t("editorOrderInherited")}
              extraFonts={fonts ?? []}
              onUploadFont={upload}
              onChange={(family, picked) => {
                const nextWeights = picked?.weights
                  ?? fonts?.find(font => font.family === family)?.weights
                  ?? curatedFontWeights(family);
                const currentWeight = site?.[weightKey];
                const keepWeight = family && (currentWeight === undefined || !nextWeights || nextWeights.includes(currentWeight));
                onChange({
                  ...typography,
                  site: {
                    ...site,
                    [fontKey]: family,
                    [weightKey]: keepWeight ? currentWeight : undefined,
                  },
                  extraFonts: mergeFontLibrary(fonts, picked ? [picked] : []),
                });
              }}
            />
            {scaleAndWeight && (
              <>
                <label className="sqe-field">
                  {t("editorFontScale")}
                  <NumberInput
                    integer
                    min={75}
                    max={150}
                    value={Math.round((site?.[sizeKey] ?? 1) * 100)}
                    onChange={percent => onChange({
                      ...typography,
                      site: { ...site, [sizeKey]: percent === 100 ? undefined : percent / 100 },
                    })}
                  />
                </label>
                <label className="sqe-field">
                  {t("editorOrderTextWeight")}
                  <select
                    value={site?.[weightKey] ?? ""}
                    onChange={event => onChange({
                      ...typography,
                      site: { ...site, [weightKey]: event.target.value ? Number(event.target.value) : undefined },
                    })}
                  >
                    <option value="">{t("editorSectionSizeAuto")}</option>
                    {weights.map(weight => <option key={weight} value={weight}>{weight}</option>)}
                  </select>
                </label>
              </>
            )}
          </fieldset>
        );
      })}
      <h4>{t("editorFontLibrary")}</h4>
      {(fonts ?? []).map((font) => (
        <p key={font.family}>
          {font.family} <small>({font.weights.join(", ")})</small>
        </p>
      ))}
      {uploading ? (
        <FontUploadPanel
          onUpload={upload}
          onDone={addFont}
          onCancel={() => setUploading(false)}
        />
      ) : (
        <button
          type="button"
          className="sqe-button sqe-button--outline"
          onClick={() => setUploading(true)}
        >
          {t("editorImportFont")}
        </button>
      )}
    </>
  );
}
