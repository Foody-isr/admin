"use client";

import type { ReactNode } from "react";

export const controlClass =
  "min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#315fce] focus:ring-2 focus:ring-[#315fce]/10 disabled:bg-slate-50 disabled:text-slate-400";

export function InspectorGroup({
  groupId,
  title,
  description,
  children,
}: {
  /** Stable identity from lib/website-v3/inspector-scope. Survives copy and
   *  locale changes, which is what makes the visibility matrix assertable. */
  groupId?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-inspector-group={groupId}
      className="border-b border-slate-100 px-5 py-5 last:border-b-0"
    >
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function InspectorField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-red-600">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11px] leading-4 text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function ToggleField({
  fieldId,
  label,
  description,
  checked,
  onChange,
}: {
  fieldId: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-3"
    >
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
      <input
        data-field-id={fieldId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#315fce]"
      />
    </label>
  );
}

export function ColorField({
  fieldId,
  label,
  value,
  fallback,
  onChange,
}: {
  fieldId: string;
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const resolved = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return (
    <InspectorField label={label}>
      <div
        className="flex items-center gap-2 rounded-xl border border-slate-200 p-1.5 focus-within:border-[#315fce]"
      >
        <input
          type="color"
          data-field-id={fieldId}
          value={resolved}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          type="text"
          data-field-id={fieldId}
          value={value}
          placeholder={fallback}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-1 text-sm uppercase outline-none"
        />
      </div>
    </InspectorField>
  );
}
