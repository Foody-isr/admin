"use client";
import { useI18n } from "@/lib/i18n";
import { footerCopy } from "@/lib/website-v3/footer-copy";
import type { DraftConfigPayload, StatePath } from "@/lib/website-v3/types";
import { ColorField, InspectorGroup, ToggleField } from "./controls";
import { ColorStylePicker } from "./ColorStylePicker";

/** Edits platform attribution independently from the restaurant-owned Footer. */
export function FooterBrandingEditor({
  config,
  onChange,
}: {
  config: DraftConfigPayload;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { locale } = useI18n(),
    c = footerCopy(locale);
  const palette =
    config.custom_palette && typeof config.custom_palette === "object"
      ? (config.custom_palette as Record<string, unknown>)
      : {};
  const value =
    palette.footer_branding && typeof palette.footer_branding === "object"
      ? (palette.footer_branding as Record<string, unknown>)
      : {};
  const set = (key: string, next: unknown) =>
    onChange(["custom_palette"], {
      ...palette,
      footer_branding: { ...value, [key]: next },
    });
  return (
    <InspectorGroup title={c.branding} description={c.brandingHelp}>
      <ToggleField
        fieldId="site.footer_branding.enabled"
        label={c.showBranding}
        checked={value.enabled !== false}
        onChange={(next) => set("enabled", next)}
      />
      <ColorStylePicker
        value={String(value.color_style ?? "default")}
        onChange={(next) =>
          onChange(["custom_palette"], {
            ...palette,
            footer_branding: {
              ...value,
              color_style: next,
              background: undefined,
            },
          })
        }
      />
      <ColorField
        fieldId="site.footer_branding.background"
        label={c.background}
        value={String(value.background ?? "")}
        fallback="#ffffff"
        onChange={(next) => set("background", next)}
      />
      <button
        type="button"
        className="sqe-button"
        onClick={() =>
          onChange(["custom_palette"], {
            ...palette,
            footer_branding: {
              enabled: value.enabled !== false,
              color_style: "default",
            },
          })
        }
      >
        {locale === "fr"
          ? "Rétablir les valeurs par défaut"
          : locale === "he"
            ? "איפוס לברירת מחדל"
            : "Reset to default"}
      </button>
    </InspectorGroup>
  );
}
