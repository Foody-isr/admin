"use client";

import type { ReceiptConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";

/** Edits receipt presentation without changing stored order details or totals. */
export function ReceiptEditor({
  value,
  onChange,
  language,
  onLanguageChange,
}: {
  value?: ReceiptConfig | null;
  onChange: (value: ReceiptConfig) => void;
  language: "fr" | "en" | "he";
  onLanguageChange: (value: "fr" | "en" | "he") => void;
}) {
  const { t } = useI18n();
  const config = value ?? {};
  const update = (patch: Partial<ReceiptConfig>) =>
    onChange({ ...config, ...patch });
  const text = (field: "title" | "message", value: string) =>
    update({ [field]: { ...config[field], [language]: value } });
  const details = [
    ["show_logo", "editorReceiptLogo"],
    ["show_address", "editorReceiptAddress"],
    ["show_phone", "editorReceiptPhone"],
    ["show_status", "editorReceiptStatus"],
    ["show_customer_info", "editorReceiptCustomer"],
  ] as const;
  const actions = [
    ["show_print", "editorReceiptPrint"],
    ["show_share", "editorReceiptShare"],
    ["show_order_history", "editorReceiptHistory"],
    ["show_new_order", "editorReceiptNewOrder"],
  ] as const;
  return (
    <>
      <InspectorGroup
        title={t("editorReceiptContent")}
        description={t("editorReceiptHint")}
      >
        <InspectorField label={t("editorReceiptLanguage")}>
          <select
            className={controlClass}
            value={language}
            onChange={(event) =>
              onLanguageChange(event.target.value as typeof language)
            }
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="he">עברית</option>
          </select>
        </InspectorField>
        <InspectorField
          label={t("editorReceiptTitle")}
          hint={t("editorReceiptDefaultHint")}
        >
          <input
            className={controlClass}
            maxLength={2000}
            dir={language === "he" ? "rtl" : "ltr"}
            value={config.title?.[language] ?? ""}
            onChange={(event) => text("title", event.target.value)}
          />
        </InspectorField>
        <InspectorField
          label={t("editorReceiptMessage")}
          hint={t("editorReceiptDefaultHint")}
        >
          <textarea
            className={`${controlClass} min-h-24 py-2`}
            maxLength={2000}
            dir={language === "he" ? "rtl" : "ltr"}
            value={config.message?.[language] ?? ""}
            onChange={(event) => text("message", event.target.value)}
          />
        </InspectorField>
        <InspectorField label={t("editorReceiptLayout")}>
          <select
            className={controlClass}
            value={config.layout ?? "comfortable"}
            onChange={(event) =>
              update({ layout: event.target.value as ReceiptConfig["layout"] })
            }
          >
            <option value="comfortable">{t("editorReceiptComfortable")}</option>
            <option value="compact">{t("editorReceiptCompact")}</option>
          </select>
        </InspectorField>
      </InspectorGroup>
      <InspectorGroup title={t("editorReceiptDetails")}>
        {details.map(([field, label]) => (
          <ToggleField
            key={field}
            fieldId={`receipt.${field}`}
            label={t(label)}
            checked={config[field] !== false}
            onChange={(value) => update({ [field]: value })}
          />
        ))}
      </InspectorGroup>
      <InspectorGroup title={t("editorReceiptActions")}>
        {actions.map(([field, label]) => (
          <ToggleField
            key={field}
            fieldId={`receipt.${field}`}
            label={t(label)}
            checked={config[field] !== false}
            onChange={(value) => update({ [field]: value })}
          />
        ))}
      </InspectorGroup>
    </>
  );
}
