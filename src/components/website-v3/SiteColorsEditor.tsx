"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  normalizeSiteColors,
  colorContrast,
  siteHex,
  resolveSiteMenuColors,
  menuColorAllowsTransparency,
  sectionSiteColorId,
  type SiteColorStyle,
  type SiteColorId,
  type SiteMenuColorRole,
} from "@/lib/website-v3/site-colors";
import type {
  DraftPagePayload,
  DraftSectionPayload,
} from "@/lib/website-v3/types";
import type { SiteColorEditTarget } from "./ColorStylePicker";

type BaseRole = keyof Omit<SiteColorStyle, "id" | "menu">;
const baseRoles: readonly (readonly [BaseRole, string])[] = [
  ["background", "editorBackground"],
  ["title", "editorColorTitle"],
  ["paragraph", "editorColorParagraph"],
  ["solid_button", "editorSolidButton"],
  ["outline_button", "editorOutlineButton"],
];
const menuGroups = [
  { id: "list", label: "editorItemList", roles: ["background", "heading"] },
  {
    id: "categories",
    label: "editorCategoryMenu",
    roles: [
      "bar_background",
      "category_text",
      "pill_background",
      "active_background",
      "active_text",
    ],
  },
  {
    id: "cards",
    label: "editorItemCards",
    roles: [
      "card_background",
      "card_title",
      "card_price",
      "card_description",
      "card_border",
    ],
  },
] as const;

/** Edits reusable styles and their optional menu details without changing the site default on selection. */
export function SiteColorsEditor({
  palette,
  onChange,
  target,
  pages = [],
  sections = [],
}: {
  palette: Record<string, unknown>;
  onChange: (palette: Record<string, unknown>) => void;
  target?: SiteColorEditTarget;
  pages?: DraftPagePayload[];
  sections?: DraftSectionPayload[];
}) {
  const { t } = useI18n();
  const colors = normalizeSiteColors(palette);
  const resolveId = (id?: string): SiteColorId => {
    const mapped = sectionSiteColorId(
      { color_styles: colors },
      id ?? "default",
    );
    return (
      colors.styles.find((style) => style.id === mapped)?.id ?? colors.default
    );
  };
  const [selectedId, setSelectedId] = useState<SiteColorId>(() =>
    resolveId(target?.styleId),
  );
  const style = colors.styles.find((s) => s.id === selectedId)!;
  const menu = resolveSiteMenuColors(style);
  const menuDetails = useRef<HTMLDetailsElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(Boolean(target?.menuGroup));
  const [menuGroup, setMenuGroup] = useState<SiteColorEditTarget["menuGroup"]>(
    target?.menuGroup,
  );
  const [error, setError] = useState(false);
  const [mainInput, setMainInput] = useState(
    siteHex(palette.accent, "#111111"),
  );
  useEffect(
    () => setMainInput(siteHex(palette.accent, "#111111")),
    [palette.accent],
  );
  const targetId = resolveId(target?.styleId);
  useEffect(() => {
    if (!target) return;
    setSelectedId(targetId);
    setMenuOpen(Boolean(target.menuGroup));
    setMenuGroup(target.menuGroup);
    setEditing(null);
    setError(false);
  }, [target, targetId]);
  useEffect(() => {
    if (target?.menuGroup)
      menuDetails.current
        ?.querySelector(`[data-menu-color-group="${target.menuGroup}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [target]);
  const secondary = Array.isArray(palette.secondary_colors)
    ? palette.secondary_colors.map((v) => siteHex(v))
    : [];
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
  const save = (next: Record<string, unknown>) =>
    onChange({ ...palette, color_styles: colors, ...next });
  const updateStyle = (next: SiteColorStyle) => {
    const changed = {
      ...palette,
      color_styles: {
        ...colors,
        styles: colors.styles.map((s) => (s.id === style.id ? next : s)),
      },
    };
    onChange({ ...changed, color_styles: normalizeSiteColors(changed) });
  };
  const paletteColor = (previous: string, next: string, index?: number) => {
    const styles = colors.styles.map((s) => ({
      ...Object.fromEntries(
        Object.entries(s).map(([key, value]) => [
          key,
          key !== "id" && value === previous ? next : value,
        ]),
      ),
      ...(s.menu
        ? {
            menu: Object.fromEntries(
              Object.entries(s.menu).map(([key, value]) => [
                key,
                value === previous ? next : value,
              ]),
            ),
          }
        : {}),
    }));
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
  const setBase = (role: BaseRole, color: string) => {
    if (
      ["title", "paragraph", "outline_button"].includes(role) &&
      colorContrast(color, style.background) < 3
    ) {
      setError(true);
      return;
    }
    updateStyle({ ...style, [role]: color });
    setError(false);
  };
  const setMenu = (role: SiteMenuColorRole, color?: string) => {
    const next = { ...style.menu };
    if (color === undefined) delete next[role];
    else next[role] = color;
    updateStyle({ ...style, menu: next });
    setError(false);
  };
  const menuBackground = (role: SiteMenuColorRole) => {
    if (role === "heading") return menu.background;
    if (role === "category_text")
      return menu.pill_background === "transparent"
        ? menu.bar_background
        : menu.pill_background;
    if (role === "active_text")
      return menu.active_background === "transparent"
        ? menu.bar_background
        : menu.active_background;
    if (
      ["card_title", "card_price", "card_description", "card_border"].includes(
        role,
      )
    )
      return menu.card_background === "transparent"
        ? menu.background
        : menu.card_background;
    return undefined;
  };
  const field = (
    key: string,
    label: string,
    value: string,
    onColor: (color: string) => void,
    options: {
      automatic?: boolean;
      onReset?: () => void;
      transparent?: boolean;
      background?: string;
      blockLowContrast?: boolean;
    } = {},
  ) => (
    <div key={key} className="sqe-color-role" data-color-role={key}>
      <span>
        {label}
        {options.automatic && (
          <small className="sqe-color-auto">{t("editorColorAutomatic")}</small>
        )}
      </span>
      <button
        type="button"
        aria-label={label}
        aria-expanded={editing === key}
        className={
          value === "transparent" ? "sqe-transparent-swatch" : undefined
        }
        style={{ backgroundColor: value }}
        onClick={() => {
          setEditing(editing === key ? null : key);
          setError(false);
        }}
      />
      {editing === key && (
        <div className="sqe-color-choice">
          <span>{t("editorYourColors")}</span>
          <div className="sqe-palette-swatches">
            {choices.map((color) => (
              <button
                type="button"
                key={color}
                aria-label={color}
                disabled={Boolean(
                  options.blockLowContrast &&
                    options.background &&
                    colorContrast(color, options.background) < 3,
                )}
                style={{ background: color }}
                onClick={() => onColor(color)}
              />
            ))}
            {options.transparent && (
              <button
                type="button"
                className="sqe-transparent-swatch"
                aria-label={t("editorTransparent")}
                onClick={() => onColor("transparent")}
              />
            )}
          </div>
          <label className="sqe-field">
            {t("editorOrderCustomColor")}
            <input
              aria-label={`${label} hex`}
              defaultValue={value === "transparent" ? "" : value}
              key={`${style.id}-${key}-${value}`}
              maxLength={7}
              spellCheck={false}
              onBlur={(event) => {
                if (/^#[\da-f]{6}$/i.test(event.target.value))
                  onColor(event.target.value);
                else if (event.target.value || value !== "transparent")
                  setError(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </label>
          {options.onReset && !options.automatic && (
            <button
              type="button"
              className="sqe-color-reset"
              onClick={options.onReset}
            >
              {t("editorColorResetAutomatic")}
            </button>
          )}
          {error && <p role="alert">{t("editorColorContrastError")}</p>}
          {!options.blockLowContrast &&
            options.background &&
            colorContrast(value, options.background) < 3 && (
              <p role="status">{t("editorMenuColorContrastHint")}</p>
            )}
        </div>
      )}
    </div>
  );
  const usage = Array.from(
    new Set([
      ...pages
        .filter(
          (page) =>
            page.type === "order" &&
            resolveId(
              String(
                page.appearance_overrides.website_order?.color_style ??
                  "default",
              ),
            ) === style.id,
        )
        .map((page) => page.title),
      ...sections
        .filter(
          (section) =>
            section.is_visible &&
            resolveId(String(section.settings.color_style ?? "light")) ===
              style.id,
        )
        .map(
          (section) =>
            pages.find((page) =>
              section.page_id !== undefined
                ? page.id === section.page_id
                : section.page_tmp_id
                  ? page.tmp_id === section.page_tmp_id
                  : page.slug === section.page,
            )?.title ?? t("editorSharedSiteSections"),
        ),
    ]),
  );
  return (
    <div className="sqe-panel-body sqe-site-colors">
      <h3>{t("editorColors")}</h3>
      <label className="sqe-main-swatch">
        <input
          aria-label={`${t("editorMainColor")} — palette`}
          type="color"
          value={siteHex(palette.accent, "#111111")}
          onChange={(event) =>
            paletteColor(siteHex(palette.accent, "#111111"), event.target.value)
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
              onChange={(event) => paletteColor(color, event.target.value, i)}
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
            aria-pressed={s.id === selectedId}
            style={{ background: s.background, color: s.title }}
            onClick={() => {
              setSelectedId(s.id);
              setEditing(null);
              setError(false);
            }}
          >
            <strong>Aa</strong>
            <i style={{ background: s.solid_button }} />
            {s.id === colors.default && (
              <small>{t("editorOrderColor_default")}</small>
            )}
          </button>
        ))}
      </div>
      <div className="sqe-style-editing">
        <strong>
          {t("editorColorStyle")} {style.id.slice(-1)}
        </strong>
        {style.id === colors.default ? (
          <span>{t("editorSiteDefaultStyle")}</span>
        ) : (
          <button
            type="button"
            className="sqe-color-reset"
            onClick={() =>
              save({ color_styles: { ...colors, default: style.id } })
            }
          >
            {t("editorUseStyleByDefault")}
          </button>
        )}
      </div>
      {!!usage.length && (
        <p>
          {t("editorColorStyleUsedOn")} {usage.join(", ")}
        </p>
      )}
      {baseRoles.map(([role, label]) =>
        field(role, t(label), style[role], (color) => setBase(role, color), {
          background: ["background", "solid_button"].includes(role)
            ? undefined
            : style.background,
          blockLowContrast: !["background", "solid_button"].includes(role),
        }),
      )}
      <details
        ref={menuDetails}
        className="sqe-menu-color-details"
        open={menuOpen}
        onToggle={(event) => setMenuOpen(event.currentTarget.open)}
      >
        <summary>{t("editorCustomizeMenuColors")}</summary>
        <p>{t("editorMenuColorsAutomaticHint")}</p>
        {menuGroups.map((group) => (
          <details
            key={group.id}
            data-menu-color-group={group.id}
            open={menuGroup === group.id}
          >
            <summary
              onClick={(event) => {
                event.preventDefault();
                setMenuGroup(menuGroup === group.id ? undefined : group.id);
                setEditing(null);
              }}
            >
              {t(group.label)}
            </summary>
            {group.roles.map((role) =>
              field(
                `menu.${role}`,
                t(`editorMenuColor_${role}`),
                menu[role],
                (color) => setMenu(role, color),
                {
                  automatic: style.menu?.[role] === undefined,
                  onReset: () => setMenu(role),
                  transparent: menuColorAllowsTransparency(role),
                  background: menuBackground(role),
                },
              ),
            )}
          </details>
        ))}
      </details>
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
