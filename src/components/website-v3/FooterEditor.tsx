"use client";

import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";

export function FooterEditor({
  footer,
  tab,
  onChange,
}: {
  footer: DraftSectionPayload;
  tab: "content" | "appearance";
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();

  if (tab === "content") {
    const social = socialRecord(footer.content.social_links);
    return (
      <InspectorGroup
        title={t("websiteV3FooterTitle")}
        description={t("websiteV3FooterContentDescription")}
      >
        <InspectorField label={t("websiteV3FooterCustomText")}>
          <input
            data-field-id="site.footer.content.custom_text"
            value={string(footer.content.custom_text)}
            onChange={(event) =>
              onChange(["content", "custom_text"], event.target.value)
            }
            className={controlClass}
            placeholder="© Foody"
          />
        </InspectorField>
        {(
          [
            ["show_logo", "websiteV3FooterShowLogo"],
            ["show_description", "websiteV3FooterShowDescription"],
            ["show_address", "websiteV3FooterShowAddress"],
            ["show_phone", "websiteV3FooterShowPhone"],
            ["show_hours", "websiteV3FooterShowHours"],
          ] as const
        ).map(([key, label]) => (
          <ToggleField
            key={key}
            fieldId={`site.footer.content.${key}`}
            label={t(label)}
            checked={boolean(footer.content[key], true)}
            onChange={(next) => onChange(["content", key], next)}
          />
        ))}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-700">
            {t("websiteV3FooterSocialLinks")}
          </p>
          {(["instagram", "facebook", "tiktok", "whatsapp"] as const).map(
            (network) => (
              <InspectorField key={network} label={networkLabel(t, network)}>
                <input
                  type="url"
                  data-field-id="site.footer.content.social_links"
                  value={social[network] ?? ""}
                  onChange={(event) =>
                    onChange(
                      ["content", "social_links"],
                      updateSocialLinks(
                        footer.content.social_links,
                        network,
                        event.target.value,
                      ),
                    )
                  }
                  className={controlClass}
                  placeholder={`https://${network}.com/...`}
                />
              </InspectorField>
            ),
          )}
        </div>
      </InspectorGroup>
    );
  }

  return (
    <InspectorGroup
      title={t("websiteV3FooterTitle")}
      description={t("websiteV3FooterAppearanceDescription")}
    >
      <InspectorField label={t("websiteV3FooterLayout")}>
        <select
          data-field-id="site.footer.layout"
          value={footer.layout || "columns"}
          onChange={(event) => onChange(["layout"], event.target.value)}
          className={controlClass}
        >
          <option value="columns">{t("websiteV3FooterLayoutColumns")}</option>
          <option value="centered">{t("websiteV3FooterLayoutCentered")}</option>
          <option value="minimal">{t("websiteV3FooterLayoutMinimal")}</option>
        </select>
      </InspectorField>
      <InspectorField label={t("websiteV3FooterColorStyle")}>
        <select
          data-field-id="site.footer.settings.color_style"
          value={string(footer.settings.color_style) || "light"}
          onChange={(event) =>
            onChange(["settings", "color_style"], event.target.value)
          }
          className={controlClass}
        >
          <option value="light">{t("websiteV3FooterColorLight")}</option>
          <option value="dark">{t("websiteV3FooterColorDark")}</option>
          <option value="custom">{t("websiteV3FooterColorCustom")}</option>
        </select>
      </InspectorField>
      {(
        [
          ["custom_bg", "websiteV3FooterBackground", "#111827"],
          ["custom_text", "websiteV3FooterPrimaryText", "#ffffff"],
          ["custom_muted", "websiteV3FooterMutedText", "#94a3b8"],
          ["custom_accent", "websiteV3FooterAccent", "#315fce"],
          ["custom_divider", "websiteV3FooterDivider", "#334155"],
        ] as const
      ).map(([key, label, fallback]) => (
        <ColorField
          key={key}
          fieldId={`site.footer.settings.${key}`}
          label={t(label)}
          value={string(footer.settings[key])}
          fallback={fallback}
          onChange={(next) => onChange(["settings", key], next)}
        />
      ))}
    </InspectorGroup>
  );
}

function socialRecord(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(
    value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const social = entry as Record<string, unknown>;
      return typeof social.platform === "string" &&
        typeof social.url === "string"
        ? [[social.platform, social.url]]
        : [];
    }),
  );
}

function updateSocialLinks(
  value: unknown,
  platform: string,
  url: string,
): { platform: string; url: string }[] {
  const links = Array.isArray(value)
    ? value.filter(
        (entry): entry is { platform: string; url: string } =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as Record<string, unknown>).platform === "string" &&
          typeof (entry as Record<string, unknown>).url === "string",
      )
    : [];
  const next = links.filter((entry) => entry.platform !== platform);
  if (url.trim()) next.push({ platform, url });
  return next;
}

function networkLabel(
  t: (key: string) => string,
  network: "instagram" | "facebook" | "tiktok" | "whatsapp",
): string {
  return t(`websiteV3FooterNetwork${network[0].toUpperCase()}${network.slice(1)}`);
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
