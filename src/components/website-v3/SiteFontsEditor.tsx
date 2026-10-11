"use client";

import { useEffect, useState } from "react";
import { FontSelect } from "@/components/website-menu/FontSelect";
import { FontUploadPanel } from "@/components/website-menu/FontUploadPanel";
import {
  uploadWebsiteFont,
  type ExtraFont,
  type TypographyOverrides,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { loadWebsiteFont } from "@/lib/website-fonts";
import { mergeFontLibrary } from "@/lib/website-v3/typography";

/** Edits global fonts while retaining the existing role overrides and font library. */
export function SiteFontsEditor({
  restaurantId,
  typography,
  heading,
  body,
  onChange,
}: {
  restaurantId: number;
  typography: TypographyOverrides;
  heading: string;
  body: string;
  onChange: (value: TypographyOverrides) => void;
}) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const fonts = typography.extraFonts;
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
          ["headingFont", "editorHeadings", heading],
          ["bodyFont", "editorBody", body],
        ] as const
      ).map(([key, label, value]) => (
        <div key={key} className="sqe-field">
          <span>{t(label)}</span>
          <FontSelect
            value={value}
            defaultLabel={t("editorOrderInherited")}
            extraFonts={fonts ?? []}
            onUploadFont={upload}
            onChange={(family, picked) =>
              onChange({
                ...typography,
                site: { ...typography.site, [key]: family },
                extraFonts: mergeFontLibrary(fonts, picked ? [picked] : []),
              })
            }
          />
        </div>
      ))}
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
