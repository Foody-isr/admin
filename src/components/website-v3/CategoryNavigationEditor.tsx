"use client";

import { useI18n } from "@/lib/i18n";
import type { DraftAppearanceOverrides } from "@/lib/website-v3/types";
import { controlClass, InspectorField } from "./controls";

type CategoryNavigation = NonNullable<
  DraftAppearanceOverrides["category_navigation"]
>;

const DEFAULT_VALUE: Required<CategoryNavigation> = {
  mode: "auto",
  side: "start",
};

export function CategoryNavigationEditor({
  value,
  onChange,
}: {
  value?: CategoryNavigation | null;
  onChange: (value: Required<CategoryNavigation>) => void;
}) {
  const { t } = useI18n();
  const resolved = {
    mode: value?.mode ?? DEFAULT_VALUE.mode,
    side: value?.side ?? DEFAULT_VALUE.side,
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <InspectorField
        label={t("websiteV3CategoryNavigationLayout")}
        hint={t("websiteV3CategoryNavigationLayoutHint")}
      >
        <select
          value={resolved.mode}
          onChange={(event) =>
            onChange({
              ...resolved,
              mode: event.target.value as Required<CategoryNavigation>["mode"],
            })
          }
          className={controlClass}
        >
          <option value="auto">{t("websiteV3CategoryNavigationAuto")}</option>
          <option value="horizontal">
            {t("websiteV3CategoryNavigationHorizontal")}
          </option>
          <option value="sidebar">
            {t("websiteV3CategoryNavigationSidebar")}
          </option>
        </select>
      </InspectorField>

      {resolved.mode !== "horizontal" ? (
        <InspectorField
          label={t("websiteV3CategoryNavigationSide")}
          hint={t("websiteV3CategoryNavigationSideHint")}
        >
          <select
            value={resolved.side}
            onChange={(event) =>
              onChange({
                ...resolved,
                side: event.target
                  .value as Required<CategoryNavigation>["side"],
              })
            }
            className={controlClass}
          >
            <option value="start">
              {t("websiteV3CategoryNavigationStart")}
            </option>
            <option value="end">{t("websiteV3CategoryNavigationEnd")}</option>
          </select>
        </InspectorField>
      ) : null}
    </div>
  );
}
