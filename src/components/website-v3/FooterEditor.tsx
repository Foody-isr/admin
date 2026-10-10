"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { footerCopy } from "@/lib/website-v3/footer-copy";
import type {
  DraftConfigPayload,
  DraftPagePayload,
  DraftSectionPayload,
  StatePath,
} from "@/lib/website-v3/types";
import type { HeaderLink } from "@/lib/website-v3/header";
import { ColorStylePicker } from "./ColorStylePicker";
import {
  ColorField,
  InspectorField,
  ToggleField,
  controlClass,
} from "./controls";
import { ImageUploadField } from "./SectionContentEditors";
import { HeaderLinksEditor } from "./HeaderLinkEditor";
import { headerCopy } from "./header-copy";
import { FooterResponses } from "./FooterResponses";

/** Edits the shared Footer using the same layout, content and style fields as the public renderer. */
export function FooterEditor({
  footer,
  tab,
  onChange,
  restaurantId = 0,
  pages = [],
  sections = [],
}: {
  footer: DraftSectionPayload;
  tab: "content" | "appearance";
  restaurantId?: number;
  config?: DraftConfigPayload;
  pages?: DraftPagePayload[];
  sections?: DraftSectionPayload[];
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { locale, t } = useI18n(),
    c = footerCopy(locale);
  const content = footer.content,
    settings = footer.settings;
  const [open, setOpen] = useState<Record<string, boolean>>({ layout: true });
  const set = (key: string, value: unknown) =>
    onChange(["content", key], value);
  const setting = (key: string, value: unknown) =>
    onChange(["settings", key], value);
  const text = (key: string, label: string, fallback = "", area = false) => (
    <InspectorField label={label}>
      {area ? (
        <textarea
          className={controlClass}
          data-field-id={`site.footer.content.${key}`}
          value={String(content[key] ?? fallback)}
          onChange={(e) => set(key, e.target.value)}
        />
      ) : (
        <input
          className={controlClass}
          data-field-id={`site.footer.content.${key}`}
          value={String(content[key] ?? fallback)}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </InspectorField>
  );
  const select = (
    key: string,
    label: string,
    choices: string[],
    labels: string[],
    fallback: string,
    appearance = false,
  ) => (
    <InspectorField label={label}>
      <select
        className={controlClass}
        data-field-id={`site.footer.${appearance ? "settings" : "content"}.${key}`}
        value={String((appearance ? settings : content)[key] ?? fallback)}
        onChange={(e) =>
          appearance ? setting(key, e.target.value) : set(key, e.target.value)
        }
      >
        {choices.map((value, i) => (
          <option key={value} value={value}>
            {labels[i]}
          </option>
        ))}
      </select>
    </InspectorField>
  );
  const toggle = (key: string, label: string, fallback = true) => (
    <ToggleField
      fieldId={`site.footer.content.${key}`}
      label={label}
      checked={
        typeof content[key] === "boolean" ? (content[key] as boolean) : fallback
      }
      onChange={(value) => set(key, value)}
    />
  );
  const panel = (
    key: string,
    label: string,
    children: ReactNode,
    visibility?: string,
    fallback = true,
  ) => (
    <section className="sqh-accordion">
      <div className="sqh-accordion-heading">
        <button
          type="button"
          aria-expanded={!!open[key]}
          onClick={() => setOpen({ ...open, [key]: !open[key] })}
        >
          {label}
          <ChevronDown size={16} />
        </button>
        {visibility && (
          <input
            type="checkbox"
            role="switch"
            className="sqe-switch"
            aria-label={label}
            data-field-id={`site.footer.content.${visibility}`}
            checked={
              typeof content[visibility] === "boolean"
                ? (content[visibility] as boolean)
                : fallback
            }
            onChange={(event) => set(visibility, event.target.checked)}
          />
        )}
      </div>
      <div
        className="sqh-accordion-body"
        style={{ display: open[key] ? undefined : "none" }}
        hidden={!open[key]}
      >
        {children}
      </div>
    </section>
  );
  const color = (
    key: string,
    label: string,
    appearance = false,
    fallback = "#111111",
  ) => (
    <ColorField
      label={label}
      fieldId={`site.footer.${appearance ? "settings" : "content"}.${key}`}
      value={String((appearance ? settings : content)[key] ?? "")}
      fallback={fallback}
      onChange={(value) => (appearance ? setting(key, value) : set(key, value))}
    />
  );
  const typography = (prefix: string, fallback = "md") => (
    <>
      {select(
        `${prefix}_size`,
        t("editorTextStyle"),
        ["sm", "md", "lg"],
        [t("editorSize_sm"), t("editorSize_md"), t("editorSize_lg")],
        fallback,
        true,
      )}
      <div
        className="sqe-element-format"
        role="group"
        aria-label={t("editorTextStyle")}
      >
        <button
          type="button"
          aria-label={t("editorBold")}
          aria-pressed={settings[`${prefix}_weight`] === "bold"}
          onClick={() =>
            setting(
              `${prefix}_weight`,
              settings[`${prefix}_weight`] === "bold" ? "normal" : "bold",
            )
          }
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          aria-label={t("editorItalic")}
          aria-pressed={settings[`${prefix}_italic`] === true}
          onClick={() =>
            setting(`${prefix}_italic`, settings[`${prefix}_italic`] !== true)
          }
        >
          <em>I</em>
        </button>
      </div>
      <ToggleField
        fieldId={`site.footer.settings.${prefix}_uppercase`}
        label={t("editorAllCaps")}
        checked={settings[`${prefix}_uppercase`] === true}
        onChange={(value) => setting(`${prefix}_uppercase`, value)}
      />
    </>
  );
  const links = (key: string) => (
    <HeaderLinksEditor
      copy={headerCopy(locale)}
      pages={pages}
      sections={sections}
      value={
        Array.isArray(content[key])
          ? (content[key] as HeaderLink[])
          : key === "navigation_links" && Array.isArray(content.links)
            ? content.links.map((link, index) => ({
                id: `footer-${index}`,
                label: String((link as Record<string, unknown>).label ?? ""),
                target: {
                  kind: "url",
                  value: String((link as Record<string, unknown>).url ?? ""),
                },
              }))
            : []
      }
      onChange={(value) => set(key, value)}
    />
  );
  return (
    <div className="sqh-editor" data-footer-editor>
      <ToggleField
        fieldId="site.footer.is_visible"
        label={t("editorShowFooter")}
        checked={footer.is_visible}
        onChange={(value) => onChange(["is_visible"], value)}
      />
      {panel(
        "layout",
        t("editorLayoutColor"),
        <>
          <div className="sqe-layout-picker">
            <span>{c.layout}</span>
            <div className="sqe-layout-choices">
              {["columns", "centered"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className="sqe-layout-choice"
                  data-field-id="site.footer.layout"
                  aria-label={value === "columns" ? c.columns : c.centered}
                  aria-pressed={(footer.layout || "columns") === value}
                  onClick={() => onChange(["layout"], value)}
                >
                  <svg aria-hidden="true" viewBox="0 0 120 64">
                    <rect
                      x="1"
                      y="1"
                      width="118"
                      height="62"
                      rx="4"
                      fill="#f5f5f5"
                    />
                    <rect
                      x={value === "columns" ? 12 : 45}
                      y="12"
                      width="30"
                      height="7"
                      rx="2"
                      fill="#a5aaaf"
                    />
                    <path
                      d={
                        value === "columns"
                          ? "M12 29h40M12 38h30M74 15h34M74 26h34M12 51h96"
                          : "M34 29h52M40 39h40M25 52h70"
                      }
                      stroke="#b6bbc0"
                      strokeWidth="4"
                    />
                  </svg>
                  <span>{value === "columns" ? c.columns : c.centered}</span>
                </button>
              ))}
            </div>
          </div>
          <ColorStylePicker
            fieldId="site.footer.settings.color_style"
            custom
            value={String(settings.color_style ?? "default")}
            onChange={(id) => setting("color_style", id)}
          />
          {select(
            "background_mode",
            c.background,
            ["theme", "color", "gradient", "image"],
            [c.theme, c.color, c.gradient, c.image],
            settings.bg_image ? "image" : "theme",
            true,
          )}
          <div
            hidden={
              !["color", "gradient"].includes(
                String(settings.background_mode),
              ) && settings.color_style !== "custom"
            }
          >
            {color("custom_bg", c.background, true, "#ffffff")}
          </div>
          {settings.background_mode === "gradient" &&
            color("gradient_end", c.gradient, true, "#111111")}
          {(settings.background_mode === "image" ||
            (!settings.background_mode && settings.bg_image)) && (
            <ImageUploadField
              restaurantId={restaurantId}
              label={c.image}
              currentUrl={String(settings.bg_image ?? "")}
              onUploaded={(value) => setting("bg_image", value)}
              onRemove={() => setting("bg_image", "")}
            />
          )}
          <div hidden={settings.color_style !== "custom"}>
            {color(
              "custom_text",
              t("websiteV3FooterPrimaryText"),
              true,
              "#ffffff",
            )}
            {color(
              "custom_muted",
              t("websiteV3FooterMutedText"),
              true,
              "#94a3b8",
            )}
            {color(
              "custom_accent",
              t("websiteV3FooterAccent"),
              true,
              "#315fce",
            )}
            {color(
              "custom_divider",
              t("websiteV3FooterDivider"),
              true,
              "#334155",
            )}
          </div>
        </>,
      )}
      {tab === "content" && (
        <>
          {panel(
            "logo",
            c.logo,
            <>
              {select(
                "logo_type",
                c.type,
                ["text", "image"],
                [c.text, c.image],
                "image",
              )}
              {content.logo_type === "text" ? (
                text("logo_text", c.text)
              ) : (
                <ImageUploadField
                  restaurantId={restaurantId}
                  label={c.logo}
                  currentUrl={String(content.logo_image ?? "")}
                  onUploaded={(value) => set("logo_image", value)}
                  onRemove={() => set("logo_image", "")}
                />
              )}
              {select(
                "logo_size",
                c.size,
                ["small", "medium", "large"],
                [c.small, c.medium, c.large],
                "medium",
              )}
              {color("logo_color", c.color)}
              <p className="text-sm text-slate-500">{c.homeHelp}</p>
            </>,
            "show_logo",
          )}
          {panel(
            "navigation",
            c.navigation,
            <>
              {toggle(
                "same_as_header",
                c.sameHeader,
                !Array.isArray(content.links),
              )}
              {content.same_as_header === false ||
              (content.same_as_header === undefined &&
                Array.isArray(content.links))
                ? links("navigation_links")
                : null}
            </>,
            "show_navigation",
          )}
          {panel(
            "title",
            c.subscriptionTitle,
            <>
              {text("subscription_title", c.subscriptionTitle, c.stayLoop)}
              {typography("subscription_title")}
              {color("subscription_title_color", c.color)}
            </>,
            "show_subscription_title",
            false,
          )}
          {panel(
            "subscription",
            c.subscription,
            <>
              {text("subscription_placeholder", c.placeholder, c.email)}
              {text("subscription_button", c.button, c.signup)}
              {select(
                "subscription_style",
                c.style,
                ["filled", "outline"],
                [c.filled, c.outline],
                "filled",
              )}
              {color("subscription_color", c.color)}
              {text("subscription_name", c.formName, c.subscription)}
              {text(
                "subscription_confirmation",
                c.confirmation,
                c.thanks,
                true,
              )}
              <FooterResponses
                restaurantId={restaurantId}
                sectionId={footer.id}
              />
            </>,
            "show_subscription",
            false,
          )}
          {panel(
            "social",
            c.social,
            <>
              {select(
                "social_color",
                c.socialColor,
                ["social", "main", "light", "dark"],
                [c.socialMedia, c.main, c.light, c.dark],
                "social",
              )}
              {[
                "instagram",
                "facebook",
                "tiktok",
                "whatsapp",
                "pinterest",
                "youtube",
                "linkedin",
                "x",
              ].map((platform) => {
                const values = Array.isArray(content.social_links)
                  ? (content.social_links as {
                      platform: string;
                      url: string;
                    }[])
                  : [];
                return (
                  <InspectorField label={platform} key={platform}>
                    <input
                      type="url"
                      className={controlClass}
                      data-field-id={`site.footer.content.social_links.${platform}`}
                      value={
                        values.find((link) => link.platform === platform)
                          ?.url ?? ""
                      }
                      onChange={(e) =>
                        set("social_links", [
                          ...values.filter(
                            (link) => link.platform !== platform,
                          ),
                          ...(e.target.value.trim()
                            ? [{ platform, url: e.target.value }]
                            : []),
                        ])
                      }
                    />
                  </InspectorField>
                );
              })}
            </>,
            "show_social",
          )}
          {panel(
            "external",
            c.external,
            <>
              {links("external_links")}
              {text("custom_text", c.copyright)}
              {typography("external", "sm")}
              {color("external_color", c.color, true)}
            </>,
            "show_external_links",
          )}
          {panel(
            "payments",
            c.payments,
            <>
              <p className="text-sm text-slate-500">{c.paymentHelp}</p>
              {["Visa", "Mastercard", "Amex"].map((value) => (
                <label key={value} className="sqh-check">
                  {value}
                  <input
                    type="checkbox"
                    checked={
                      Array.isArray(content.payment_methods) &&
                      content.payment_methods.includes(value)
                    }
                    onChange={(e) =>
                      set("payment_methods", [
                        ...(Array.isArray(content.payment_methods)
                          ? content.payment_methods.filter((v) => v !== value)
                          : []),
                        ...(e.target.checked ? [value] : []),
                      ])
                    }
                  />
                </label>
              ))}
            </>,
            "show_payment_methods",
            false,
          )}
          {panel(
            "contact",
            c.contact,
            <>
              {toggle("show_description", t("websiteV3FooterShowDescription"))}
              {toggle("show_address", t("websiteV3FooterShowAddress"))}
              {toggle("show_phone", t("websiteV3FooterShowPhone"))}
              {toggle("show_hours", t("websiteV3FooterShowHours"))}
            </>,
          )}
        </>
      )}
    </div>
  );
}
