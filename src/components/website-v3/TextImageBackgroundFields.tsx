"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { ColorField } from "./controls";

const validColor = (value: string) =>
  value === "" ||
  value === "transparent" ||
  /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value);

/** Edits local text/media backgrounds while keeping the shared color style intact. */
export function TextImageBackgroundFields({
  section,
  onChange,
}: {
  section: DraftSectionPayload;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <BackgroundField
        key={`${section.id ?? section.tmp_id}-text`}
        fieldId="section.settings.text_bg_color"
        label={t("editorTextBackground")}
        value={section.settings.text_bg_color}
        onChange={(color) => onChange(["settings", "text_bg_color"], color)}
      />
      <BackgroundField
        key={`${section.id ?? section.tmp_id}-image`}
        fieldId="section.settings.image_bg_color"
        label={t("editorImageBackground")}
        value={section.settings.image_bg_color}
        onChange={(color) => onChange(["settings", "image_bg_color"], color)}
      />
      <p className="text-xs leading-5 text-slate-500">
        {t("editorImageBackgroundHint")}
      </p>
    </div>
  );
}

function BackgroundField({
  fieldId,
  label,
  value,
  onChange,
}: {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (color: string) => void;
}) {
  const { t } = useI18n();
  const saved = typeof value === "string" ? value : "";
  const [input, setInput] = useState(saved);
  const [error, setError] = useState(false);
  useEffect(() => {
    setInput(saved);
    setError(false);
  }, [saved]);
  const commit = (color: string) => {
    const normalized = color.trim().toLowerCase();
    if (!validColor(normalized)) {
      setError(true);
      return;
    }
    setError(false);
    setInput(normalized);
    if (normalized !== saved) onChange(normalized);
  };
  return (
    <div>
      <div
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) commit(input);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(input);
          }
        }}
      >
        <ColorField
          fieldId={fieldId}
          label={label}
          value={input}
          fallback="#ffffff"
          onChange={(color) => {
            setInput(color);
            setError(false);
            if (validColor(color) && color !== saved) onChange(color);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {t("editorColorFormatError")}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {!saved && (
          <span className="text-slate-500">
            {t("editorSectionBackgroundInherited")}
          </span>
        )}
        {saved && (
          <button
            type="button"
            className="underline"
            aria-label={`${label} — ${t("editorColorResetAutomatic")}`}
            onClick={() => commit("")}
          >
            {t("editorColorResetAutomatic")}
          </button>
        )}
        <button
          type="button"
          className="underline"
          aria-label={`${label} — ${t("editorTransparent")}`}
          onClick={() => commit("transparent")}
        >
          {t("editorTransparent")}
        </button>
      </div>
    </div>
  );
}
