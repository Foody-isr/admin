"use client";

import type { CateringService, Menu } from "@/lib/api";
import type { DraftPagePayload } from "@/lib/website-v3/types";

export function CommerceSelector({
  page,
  menus,
  services,
  error,
  onChange,
}: {
  page: Extract<DraftPagePayload, { type: "order" | "catering" }>;
  menus: Menu[];
  services: CateringService[];
  error?: string;
  onChange: (ids: number[]) => void;
}) {
  const isOrder = page.type === "order";
  const options = isOrder
    ? menus
        .filter((menu) => menu.web_enabled)
        .map((menu) => ({ id: menu.id, label: menu.name }))
    : services
        .filter((service) => service.is_active)
        .map((service) => ({ id: service.id, label: service.name }));
  const selected =
    page.type === "order"
      ? page.settings.menu_ids
      : page.settings.service_ids;
  const fieldId = isOrder
    ? "page.settings.menu_ids"
    : "page.settings.service_ids";
  const availableIds = new Set(options.map((option) => option.id));
  const brokenIds = selected.filter((id) => !availableIds.has(id));

  return (
    <fieldset
      data-field-id={fieldId}
      tabIndex={-1}
      className={`rounded-2xl border p-3 ${
        error ? "border-red-300 bg-red-50/40" : "border-slate-200"
      }`}
    >
      <legend className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {isOrder ? "Cartes associées" : "Prestations associées"}
      </legend>
      <div className="mt-1 space-y-1">
        {brokenIds.map((id) => (
          <label
            key={`broken-${id}`}
            className="flex cursor-pointer items-center gap-3 rounded-xl bg-red-50 px-2 py-2.5 text-sm text-red-800"
          >
            <input
              type="checkbox"
              checked
              onChange={() =>
                onChange(selected.filter((selectedId) => selectedId !== id))
              }
              className="h-4 w-4 rounded border-red-300 text-red-600"
            />
            <span className="font-medium">
              {isOrder ? "Carte" : "Prestation"} indisponible #{id} — décochez
              pour retirer
            </span>
          </label>
        ))}
        {options.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
            {isOrder
              ? "Aucune carte activée pour le web."
              : "Aucune prestation traiteur active."}
          </p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id),
                  )
                }
                className="h-4 w-4 rounded border-slate-300 text-[#315fce]"
              />
              <span className="font-medium">{option.label}</span>
            </label>
          ))
        )}
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </fieldset>
  );
}
