"use client";

import { useId } from "react";
import type { CustomerNoteConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/** Shared configuration for a note attached to one modifier or option. */
export function CustomerNoteEditor({
  value,
  onChange,
  onCommit,
  disabled = false,
}: {
  value?: CustomerNoteConfig | null;
  onChange: (value: CustomerNoteConfig) => void;
  onCommit?: (value: CustomerNoteConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const config = value ?? {
    enabled: false,
    label: t("customerNoteDefault"),
    placeholder: "",
    required: false,
  };
  const change = (patch: Partial<CustomerNoteConfig>, commit = false) => {
    const next = { ...config, ...patch };
    onChange(next);
    if (commit) onCommit?.(next);
  };
  return (
    <fieldset disabled={disabled} className="space-y-3 text-sm">
      <label className="flex items-center gap-2 min-h-10">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => change({ enabled: event.target.checked }, true)}
        />
        {t("customerNoteEnable")}
      </label>
      {config.enabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-label`} className="block mb-1">
              {t("customerNoteLabel")}
            </label>
            <input
              id={`${id}-label`}
              className="input"
              required
              maxLength={200}
              value={config.label}
              onChange={(event) => change({ label: event.target.value })}
              onBlur={() => onCommit?.(config)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-placeholder`} className="block mb-1">
              {t("customerNotePlaceholder")}
            </label>
            <input
              id={`${id}-placeholder`}
              className="input"
              maxLength={300}
              placeholder={t("customerNoteExample")}
              value={config.placeholder}
              onChange={(event) => change({ placeholder: event.target.value })}
              onBlur={() => onCommit?.(config)}
            />
          </div>
          <label className="flex items-center gap-2 min-h-10 sm:col-span-2">
            <input
              type="checkbox"
              checked={config.required}
              onChange={(event) =>
                change({ required: event.target.checked }, true)
              }
            />
            {t("customerNoteRequired")}
          </label>
        </div>
      )}
    </fieldset>
  );
}
