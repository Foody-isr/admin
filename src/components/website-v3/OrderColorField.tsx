"use client";

import { useContext, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { siteHex } from "@/lib/website-v3/site-colors";
import { record } from "@/lib/website-v3/restaurant-themes";
import { SiteColorContext } from "./ColorStylePicker";

/** Offers the site's palette, an exact color, and inheritance in one compact menu control. */
export function OrderColorField({
  label,
  value,
  onChange,
  fieldId,
}: {
  label: string;
  value: unknown;
  fieldId: string;
  onChange: (color: string) => void;
}) {
  const { t } = useI18n();
  const config = useContext(SiteColorContext);
  const palette = record(config.custom_palette);
  const color = siteHex(value, "");
  const [open, setOpen] = useState(false);
  const choices = Array.from(
    new Set(
      [
        palette.accent,
        palette.bg,
        palette.surface,
        palette.ink,
        palette.price,
        ...(Array.isArray(palette.secondary_colors)
          ? palette.secondary_colors
          : []),
        "#ffffff",
        "#000000",
      ]
        .map((value) => siteHex(value, ""))
        .filter(Boolean),
    ),
  );
  return (
    <div className="sqe-order-color" data-field-id={fieldId}>
      <button
        type="button"
        className="sqe-design-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{label}</span>
        {color ? (
          <i style={{ background: color }} />
        ) : (
          <small>{t("editorOrderInherited")}</small>
        )}
      </button>
      {open && (
        <div className="sqe-order-color-choices">
          <div className="sqe-palette-swatches" role="group" aria-label={label}>
            {choices.map((choice) => (
              <button
                type="button"
                key={choice}
                aria-label={choice}
                aria-pressed={color === choice}
                style={{ background: choice }}
                onClick={() => onChange(choice)}
              />
            ))}
          </div>
          <label className="sqe-field">
            {t("editorOrderCustomColor")}
            <input
              type="color"
              aria-label={label}
              value={color || choices[0] || "#000000"}
              onChange={(event) => onChange(event.target.value)}
            />
            <input
              aria-label={`${label} hex`}
              key={color}
              defaultValue={color}
              placeholder="#000000"
              maxLength={7}
              spellCheck={false}
              onBlur={(event) => {
                const next = siteHex(event.target.value, "");
                if (next) onChange(next);
                else event.target.value = color;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </label>
          <button
            type="button"
            className="sqe-button"
            onClick={() => onChange("")}
          >
            {t("editorInherit")}
          </button>
        </div>
      )}
    </div>
  );
}
