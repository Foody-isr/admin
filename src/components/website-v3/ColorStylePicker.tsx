"use client";
import { createContext, useContext } from "react";
import { useI18n } from "@/lib/i18n";
import {
  normalizeSiteColors,
  sectionSiteColorId,
} from "@/lib/website-v3/site-colors";

export const SiteColorContext = createContext<Record<string, unknown>>({});
/** Opens the shared Colors panel from any component inspector. */
export function openSiteColors() {
  window.dispatchEvent(new Event("foody-edit-color-styles"));
}
/** Stable references let each component reuse and inherit the site's six color styles. */
export function ColorStylePicker({
  value = "default",
  onChange,
  custom = false,
  fieldId,
  defaultLabel,
}: {
  fieldId?: string;
  defaultLabel?: string;
  value?: string;
  onChange: (id: string) => void;
  custom?: boolean;
}) {
  const config = useContext(SiteColorContext),
    colors = normalizeSiteColors(config.custom_palette);
  const { t } = useI18n();
  const selected = sectionSiteColorId({ color_styles: colors }, value);
  return (
    <div className="sqe-shared-colors" data-field-id={fieldId}>
      <div className="sqe-color-heading">
        <span>{t("editorColorStyle")}</span>
        <button type="button" onClick={openSiteColors}>
          {t("editorEditColorStyles")}
        </button>
      </div>
      <div
        className="sqe-color-style-grid"
        role="group"
        aria-label={t("editorColorStyle")}
      >
        <button
          type="button"
          aria-pressed={selected === "default" || selected === "site"}
          onClick={() => onChange("default")}
        >
          {defaultLabel ?? t("editorOrderColor_default")}
        </button>
        {colors.styles.map((style, i) => (
          <button
            type="button"
            key={style.id}
            aria-label={`${t("editorColorStyle")} ${i + 1}`}
            aria-pressed={selected === style.id}
            style={{ background: style.background, color: style.title }}
            onClick={() => onChange(style.id)}
          >
            <strong>Aa</strong>
            <i style={{ background: style.solid_button }} />
          </button>
        ))}
        {custom && (
          <button
            type="button"
            aria-pressed={value === "custom"}
            onClick={() => onChange("custom")}
          >
            {t("editorColor_custom")}
          </button>
        )}
      </div>
    </div>
  );
}
