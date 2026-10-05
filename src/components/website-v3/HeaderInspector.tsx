"use client";

import { NavigationLinksEditor } from "./NavigationLinksEditor";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  type DraftConfigPayload,
  type DraftPagePayload,
  type DraftSectionPayload,
  type StatePath,
} from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  ToggleField,
  controlClass,
} from "./controls";
import { NavigationCtaEditor } from "./NavigationCtaEditor";
import { RestaurantLogoUploader } from "./SiteInspector";

type HeaderPanel = "logo" | "navigation" | "button" | "appearance";

/** Edits the shared header without mixing footer or whole-site settings into its panel. */
export function HeaderInspector({
  config,
  pages,
  sections,
  restaurantLogoUrl,
  onChange,
  onRestaurantLogoUpload,
  onRestaurantLogoRemove,
}: {
  config: DraftConfigPayload;
  pages: DraftPagePayload[];
  sections: DraftSectionPayload[];
  restaurantLogoUrl?: string;
  onChange: (path: StatePath, value: unknown) => void;
  onPageVisibilityChange: (key: string, visible: boolean) => void;
  onRestaurantLogoUpload: (file: File) => Promise<void>;
  onRestaurantLogoRemove: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<HeaderPanel | null>(null);
  const layout = record(config.nav_layout);
  const content = record(layout.content);
  const logo = Object.hasOwn(config, "restaurant_logo_url")
    ? text(config.restaurant_logo_url)
    : restaurantLogoUrl;
  const labels = {
    logo: "editorLogo",
    navigation: "editorHeaderNavigation",
    button: "editorButton",
    appearance: "editorLayoutColor",
  } as const;
  return (
    <div className="sqe-header-inspector">
      {(["navigation", "appearance", "logo", "button"] as const).map((key) => (
        <div key={key} className="sqe-header-group">
          <button
            className="sqe-header-group-trigger"
            aria-expanded={panel === key}
            onClick={() => setPanel(panel === key ? null : key)}
          >
            <span>{t(labels[key])}</span>
            {panel === key ? (
              <ChevronDown size={18} />
            ) : (
              <ChevronRight size={18} />
            )}
          </button>
          {panel === key && (
            <div className="sqe-panel-body space-y-4">
              {key === "logo" && (
                <>
                  <RestaurantLogoUploader
                    currentUrl={logo}
                    onUpload={onRestaurantLogoUpload}
                    onRemove={onRestaurantLogoRemove}
                  />
                  <InspectorField label={t("editorLogoPosition")}>
                    <div className="sqe-segmented">
                      {(["left", "center", "right"] as const).map(
                        (position) => (
                          <button
                            key={position}
                            aria-pressed={
                              (config.navbar_logo_position || "left") ===
                              position
                            }
                            onClick={() =>
                              onChange(["navbar_logo_position"], position)
                            }
                          >
                            {t(`editorAlign_${position}`)}
                          </button>
                        ),
                      )}
                    </div>
                  </InspectorField>
                  <InspectorField label={t("editorLogoSize")}>
                    <input
                      type="range"
                      min={28}
                      max={72}
                      value={Number(config.logo_size) || 48}
                      onChange={(event) =>
                        onChange(["logo_size"], Number(event.target.value))
                      }
                      aria-label={t("editorLogoSize")}
                    />
                  </InspectorField>
                  <ToggleField
                    fieldId="site.hide_navbar_name"
                    label={t("editorShowName")}
                    checked={!config.hide_navbar_name}
                    onChange={(value) => onChange(["hide_navbar_name"], !value)}
                  />
                </>
              )}
              {key === "navigation" && (
                <>
                  <ToggleField
                    fieldId="site.navbar_show_links"
                    label={t("editorHeaderNavigation")}
                    checked={config.navbar_show_links !== false}
                    onChange={(value) => onChange(["navbar_show_links"], value)}
                  />
                  <NavigationLinksEditor
                    pages={pages}
                    sections={sections}
                    value={layout.links}
                    onChange={(links) =>
                      onChange(["nav_layout"], { ...layout, links })
                    }
                  />
                </>
              )}
              {key === "button" && (
                <NavigationCtaEditor
                  value={record(config.navbar_cta)}
                  allowInherit={false}
                  onChange={(value) => onChange(["navbar_cta"], value ?? {})}
                />
              )}
              {key === "appearance" && (
                <>
                  {(["desktop", "mobile"] as const).map((device) => (
                    <InspectorField
                      key={device}
                      label={t(
                        device === "desktop" ? "editorDesktop" : "editorMobile",
                      )}
                    >
                      <select
                        className={controlClass}
                        value={
                          text(content[device]) ||
                          (device === "desktop" ? "full" : "compact")
                        }
                        onChange={(event) =>
                          onChange(["nav_layout"], {
                            ...layout,
                            content: {
                              ...content,
                              [device]: event.target.value,
                            },
                          })
                        }
                      >
                        {(
                          [
                            "full",
                            "slim",
                            "compact",
                            "compact_no_logo",
                            "hidden",
                          ] as const
                        ).map((mode) => (
                          <option key={mode} value={mode}>
                            {t(`editorNavMode_${mode}`)}
                          </option>
                        ))}
                      </select>
                    </InspectorField>
                  ))}
                  <InspectorField label={t("editorBackground")}>
                    <select
                      className={controlClass}
                      value={text(config.navbar_style) || "solid"}
                      onChange={(event) =>
                        onChange(["navbar_style"], event.target.value)
                      }
                    >
                      <option value="solid">{t("editorSolid")}</option>
                      <option value="transparent">
                        {t("editorTransparent")}
                      </option>
                      <option value="overlay">{t("editorOverlay")}</option>
                    </select>
                  </InspectorField>
                  <ColorField
                    fieldId="site.navbar_color"
                    label={t("editorBackground")}
                    value={text(config.navbar_color)}
                    fallback="#ffffff"
                    onChange={(value) => onChange(["navbar_color"], value)}
                  />
                  <ColorField
                    fieldId="site.navbar_text_color"
                    label={t("editorText")}
                    value={text(config.navbar_text_color)}
                    fallback="#111111"
                    onChange={(value) => onChange(["navbar_text_color"], value)}
                  />
                  {config.navbar_style !== "solid" && (
                    <ColorField
                      fieldId="site.navbar_overlay_text_color"
                      label={t("editorOverlayText")}
                      value={text(config.navbar_overlay_text_color)}
                      fallback="#ffffff"
                      onChange={(value) =>
                        onChange(["navbar_overlay_text_color"], value)
                      }
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
