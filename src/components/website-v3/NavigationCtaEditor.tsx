"use client";

import { useI18n } from "@/lib/i18n";
import type {
  NavbarCtaOverride,
  NavbarCtaSurfaceStyle,
} from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  ToggleField,
  controlClass,
} from "./controls";

type NavigationCtaEditorProps = {
  value: NavbarCtaOverride;
  inherited?: NavbarCtaOverride;
  allowInherit: boolean;
  onChange: (value: NavbarCtaOverride | undefined) => void;
};

type Surface = "transparent" | "solid";

export function NavigationCtaEditor({
  value,
  inherited,
  allowInherit,
  onChange,
}: NavigationCtaEditorProps) {
  const { t } = useI18n();
  const customized = !allowInherit || Object.keys(value).length > 0;
  const prefix = allowInherit
    ? "page.appearance_overrides.navbar_cta"
    : "site.navbar_cta";

  const updateRoot = <Key extends keyof NavbarCtaOverride>(
    key: Key,
    next: NavbarCtaOverride[Key],
  ) => onChange({ ...value, [key]: next });

  const updateSurface = (
    surface: Surface,
    key: keyof NavbarCtaSurfaceStyle,
    next: string,
  ) =>
    onChange({
      ...value,
      [surface]: {
        ...value[surface],
        [key]: next,
      },
    });

  if (allowInherit && !customized) {
    return (
      <ToggleField
        fieldId={prefix}
        label={t("websiteV3CtaCustomize")}
        description={t("websiteV3CtaInheritDescription")}
        checked={false}
        onChange={(checked) =>
          onChange(checked ? { transparent: {}, solid: {} } : undefined)
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {allowInherit ? (
        <ToggleField
          fieldId={prefix}
          label={t("websiteV3CtaCustomize")}
          description={t("websiteV3CtaResetDescription")}
          checked
          onChange={(checked) =>
            onChange(checked ? value : undefined)
          }
        />
      ) : (
        <>
          <ToggleField
            fieldId={`${prefix}.enabled`}
            label={t("websiteV3CtaEnabled")}
            checked={value.enabled ?? true}
            onChange={(next) => updateRoot("enabled", next)}
          />
          <InspectorField label={t("websiteV3CtaText")}>
            <input
              data-field-id={`${prefix}.text`}
              value={value.text ?? ""}
              onChange={(event) => updateRoot("text", event.target.value)}
              className={controlClass}
              placeholder={t("websiteV3CtaTextPlaceholder")}
            />
          </InspectorField>
          <InspectorField label={t("websiteV3CtaLink")}>
            <input
              data-field-id={`${prefix}.link`}
              value={value.link ?? ""}
              onChange={(event) => updateRoot("link", event.target.value)}
              className={controlClass}
              placeholder="/order"
            />
          </InspectorField>
          <div className="grid grid-cols-2 gap-3">
            <InspectorField label={t("websiteV3CtaShape")}>
              <select
                data-field-id={`${prefix}.shape`}
                value={value.shape ?? "pill"}
                onChange={(event) =>
                  updateRoot(
                    "shape",
                    event.target.value as NavbarCtaOverride["shape"],
                  )
                }
                className={controlClass}
              >
                <option value="pill">{t("websiteV3CtaShapePill")}</option>
                <option value="rounded">{t("websiteV3CtaShapeRounded")}</option>
                <option value="square">{t("websiteV3CtaShapeSquare")}</option>
              </select>
            </InspectorField>
            <InspectorField label={t("websiteV3CtaSize")}>
              <select
                data-field-id={`${prefix}.size`}
                value={value.size ?? "md"}
                onChange={(event) =>
                  updateRoot(
                    "size",
                    event.target.value as NavbarCtaOverride["size"],
                  )
                }
                className={controlClass}
              >
                <option value="sm">{t("websiteV3CtaSizeSmall")}</option>
                <option value="md">{t("websiteV3CtaSizeMedium")}</option>
                <option value="lg">{t("websiteV3CtaSizeLarge")}</option>
              </select>
            </InspectorField>
          </div>
        </>
      )}

      {(["transparent", "solid"] as const).map((surface) => (
        <CtaSurfaceEditor
          key={surface}
          prefix={`${prefix}.${surface}`}
          title={t(
            surface === "transparent"
              ? "websiteV3CtaTransparentState"
              : "websiteV3CtaSolidState",
          )}
          value={value[surface]}
          inherited={effectiveSurface(inherited, surface)}
          legacy={surface === "solid" ? effectiveLegacySurface(value, inherited) : undefined}
          onChange={(key, next) => updateSurface(surface, key, next)}
        />
      ))}
    </div>
  );
}

function CtaSurfaceEditor({
  prefix,
  title,
  value,
  inherited,
  legacy,
  onChange,
}: {
  prefix: string;
  title: string;
  value?: NavbarCtaSurfaceStyle;
  inherited?: NavbarCtaSurfaceStyle;
  legacy?: NavbarCtaSurfaceStyle;
  onChange: (key: keyof NavbarCtaSurfaceStyle, value: string) => void;
}) {
  const { t } = useI18n();
  const effective = { ...legacy, ...inherited, ...value };
  return (
    <fieldset className="space-y-3 border-t border-slate-100 pt-4">
      <legend className="px-1 text-xs font-semibold text-slate-700">{title}</legend>
      <InspectorField label={t("websiteV3CtaVariant")}>
        <select
          data-field-id={`${prefix}.variant`}
          value={effective.variant ?? "filled"}
          onChange={(event) => onChange("variant", event.target.value)}
          className={controlClass}
        >
          <option value="filled">{t("websiteV3CtaVariantFilled")}</option>
          <option value="outline">{t("websiteV3CtaVariantOutline")}</option>
          <option value="ghost">{t("websiteV3CtaVariantGhost")}</option>
        </select>
      </InspectorField>
      <ColorField
        fieldId={`${prefix}.bg`}
        label={t("websiteV3CtaBackground")}
        value={effective.bg ?? ""}
        fallback="#315fce"
        onChange={(next) => onChange("bg", next)}
      />
      <ColorField
        fieldId={`${prefix}.text_color`}
        label={t("websiteV3CtaTextColor")}
        value={effective.text_color ?? ""}
        fallback="#ffffff"
        onChange={(next) => onChange("text_color", next)}
      />
      <ColorField
        fieldId={`${prefix}.border_color`}
        label={t("websiteV3CtaBorderColor")}
        value={effective.border_color ?? ""}
        fallback="#315fce"
        onChange={(next) => onChange("border_color", next)}
      />
    </fieldset>
  );
}

function effectiveSurface(
  value: NavbarCtaOverride | undefined,
  surface: Surface,
): NavbarCtaSurfaceStyle | undefined {
  if (!value) return undefined;
  if (value[surface]) return value[surface];
  return surface === "solid" ? effectiveLegacySurface(value) : undefined;
}

function effectiveLegacySurface(
  value: NavbarCtaOverride | undefined,
  fallback?: NavbarCtaOverride,
): NavbarCtaSurfaceStyle | undefined {
  const source = value && Object.keys(value).length > 0 ? value : fallback;
  if (!source) return undefined;
  return {
    variant: source.variant,
    bg: source.bg,
    text_color: source.text_color,
    border_color: source.border_color,
  };
}
