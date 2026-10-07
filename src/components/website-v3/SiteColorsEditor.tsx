"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  normalizeSiteColors,
  colorContrast,
  siteHex,
  type SiteColorStyle,
} from "@/lib/website-v3/site-colors";

/** Edits the global palette and its reusable styles, with readable foreground choices. */
export function SiteColorsEditor({
  palette,
  onChange,
}: {
  palette: Record<string, unknown>;
  onChange: (palette: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const colors = normalizeSiteColors(palette),
    style = colors.styles.find((s) => s.id === colors.default)!;
  const secondary = Array.isArray(palette.secondary_colors)
    ? palette.secondary_colors.map((v) => siteHex(v))
    : [];
  const [editing, setEditing] = useState<
    keyof Omit<SiteColorStyle, "id"> | null
  >(null);
  const [error, setError] = useState(false);
  const [mainInput, setMainInput] = useState(
    siteHex(palette.accent, "#111111"),
  );
  useEffect(
    () => setMainInput(siteHex(palette.accent, "#111111")),
    [palette.accent],
  );
  const save = (next: Record<string, unknown>) =>
    onChange({ ...palette, color_styles: colors, ...next });
  const paletteColor = (previous: string, next: string, index?: number) => {
    const styles = colors.styles.map((s) =>
      Object.fromEntries(
        Object.entries(s).map(([key, v]) => [
          key,
          key !== "id" && v === previous ? next : v,
        ]),
      ),
    );
    const changed = {
      ...palette,
      ...(index === undefined
        ? { accent: next }
        : {
            secondary_colors: secondary.map((s, i) => (i === index ? next : s)),
          }),
      color_styles: { ...colors, styles },
    };
    onChange({ ...changed, color_styles: normalizeSiteColors(changed) });
  };
  const setRole = (role: keyof Omit<SiteColorStyle, "id">, color: string) => {
    const text =
      role === "title" || role === "paragraph" || role === "outline_button";
    if (text && colorContrast(color, style.background) < 3) {
      setError(true);
      return;
    }
    const next = {
      ...palette,
      color_styles: {
        ...colors,
        styles: colors.styles.map((s) =>
          s.id === style.id ? { ...s, [role]: color } : s,
        ),
      },
    };
    onChange({ ...next, color_styles: normalizeSiteColors(next) });
    setError(false);
  };
  const choices = Array.from(
    new Set([
      siteHex(palette.accent, "#111111"),
      ...secondary,
      "#ffffff",
      "#f8f7f7",
      "#e6e6e6",
      "#4d4d4d",
      "#000000",
    ]),
  );
  const roles = [
    ["background", "editorBackground"],
    ["title", "editorColorTitle"],
    ["paragraph", "editorColorParagraph"],
    ["solid_button", "editorSolidButton"],
    ["outline_button", "editorOutlineButton"],
  ] as const;
  return (
    <div className="sqe-panel-body sqe-site-colors">
      <h3>{t("editorColors")}</h3>
      <label className="sqe-main-swatch">
        <input
          aria-label={`${t("editorMainColor")} — palette`}
          type="color"
          value={siteHex(palette.accent, "#111111")}
          onChange={(e) =>
            paletteColor(siteHex(palette.accent, "#111111"), e.target.value)
          }
        />
        <span>
          <strong>{t("editorMainColor")}</strong>
          <input
            type="text"
            aria-label={`${t("editorMainColor")} hex`}
            value={mainInput}
            maxLength={7}
            spellCheck={false}
            onChange={(event) => setMainInput(event.target.value)}
            onBlur={() => {
              if (/^#[\da-f]{6}$/i.test(mainInput))
                paletteColor(siteHex(palette.accent, "#111111"), mainInput);
              else setMainInput(siteHex(palette.accent, "#111111"));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </span>
      </label>
      <h4>{t("editorSecondaryColors")}</h4>
      <div className="sqe-palette-swatches">
        {secondary.map((color, i) => (
          <label key={i}>
            <input
              aria-label={`${t("editorSecondaryColors")} ${i + 1}`}
              type="color"
              value={color}
              onChange={(e) => paletteColor(color, e.target.value, i)}
            />
            <button
              type="button"
              aria-label={`${t("editorDelete")} ${color}`}
              onClick={() =>
                save({ secondary_colors: secondary.filter((_, j) => i !== j) })
              }
            >
              ×
            </button>
          </label>
        ))}
        {secondary.length < 9 && (
          <button
            type="button"
            aria-label={t("editorAddColor")}
            onClick={() =>
              save({ secondary_colors: [...secondary, "#808080"] })
            }
          >
            +
          </button>
        )}
      </div>
      <h4>{t("editorColorStyles")}</h4>
      <p>{t("editorColorStylesHint")}</p>
      <div className="sqe-color-style-grid">
        {colors.styles.map((s, i) => (
          <button
            type="button"
            key={s.id}
            aria-label={`${t("editorColorStyle")} ${i + 1}`}
            aria-pressed={s.id === colors.default}
            style={{ background: s.background, color: s.title }}
            onClick={() => {
              save({ color_styles: { ...colors, default: s.id } });
              setEditing(null);
              setError(false);
            }}
          >
            <strong>Aa</strong>
            <i style={{ background: s.solid_button }} />
          </button>
        ))}
      </div>
      {roles.map(([role, label]) => (
        <div key={role} className="sqe-color-role">
          <span>{t(label)}</span>
          <button
            type="button"
            aria-label={t(label)}
            aria-expanded={editing === role}
            style={{ background: style[role] }}
            onClick={() => {
              setEditing(editing === role ? null : role);
              setError(false);
            }}
          />
          {editing === role && (
            <div className="sqe-color-choice">
              <span>{t("editorYourColors")}</span>
              <div className="sqe-palette-swatches">
                {choices.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    disabled={
                      role !== "background" &&
                      role !== "solid_button" &&
                      colorContrast(color, style.background) < 3
                    }
                    style={{ background: color }}
                    onClick={() => setRole(role, color)}
                  />
                ))}
              </div>
              <label className="sqe-field">
                {t("editorOrderCustomColor")}
                <input
                  aria-label={`${t(label)} hex`}
                  defaultValue={style[role]}
                  key={`${style.id}-${role}-${style[role]}`}
                  onBlur={(e) => {
                    if (/^#[\da-f]{6}$/i.test(e.target.value))
                      setRole(role, e.target.value);
                    else setError(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </label>
              {error && <p role="alert">{t("editorColorContrastError")}</p>}
            </div>
          )}
        </div>
      ))}
      <button
        className="sqe-button"
        type="button"
        onClick={() => {
          const { color_styles: _, ...base } = palette;
          save({ color_styles: normalizeSiteColors(base) });
        }}
      >
        {t("editorResetColorStyles")}
      </button>
    </div>
  );
}
