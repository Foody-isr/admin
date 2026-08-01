"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { CateringService, Menu } from "@/lib/api";
import { normalizeSlug, pageAddressIsEditable } from "@/lib/website-v3/state";
import {
  isReservedPublicSlug,
  publicAddressForPage,
  suggestSpecificSlug,
} from "@/lib/website-v3/url-model";
import type {
  DraftPagePayload,
  WebsitePageType,
} from "@/lib/website-v3/types";
import { ReadOnlyAddress } from "./PageAddress";

type CreatePageInput = {
  title: string;
  slug: string;
  type: WebsitePageType;
  menuIds: number[];
  serviceIds: number[];
  isDefault: boolean;
};

export function PageDialog({
  open,
  pages,
  menus,
  services,
  onClose,
  onCreate,
}: {
  open: boolean;
  pages: DraftPagePayload[];
  menus: Menu[];
  services: CateringService[];
  onClose: () => void;
  onCreate: (input: CreatePageInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [type, setType] = useState<WebsitePageType>("content");
  const [menuIds, setMenuIds] = useState<number[]>([]);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const needsDefault = useMemo(
    () => !pages.some((page) => page.type === type && page.is_default),
    [pages, type],
  );
  const [makeDefault, setMakeDefault] = useState(true);

  if (!open) return null;

  const normalizedSlug = normalizeSlug(slug);
  const duplicate = pages.some(
    (page) => normalizeSlug(page.slug) === normalizedSlug,
  );
  const reserved = isReservedPublicSlug(normalizedSlug);
  const isDefaultCommercePage =
    (type === "order" || type === "catering") &&
    (needsDefault || makeDefault);
  const addressIsEditable = pageAddressIsEditable({
    type,
    is_default: isDefaultCommercePage,
  });
  const publicAddress = publicAddressForPage({
    type,
    slug,
    is_default: isDefaultCommercePage,
  });
  const associationsValid =
    type === "order"
      ? menuIds.length > 0
      : type === "catering"
        ? serviceIds.length > 0
        : true;
  const valid =
    title.trim().length > 0 &&
    normalizedSlug.length > 0 &&
    !duplicate &&
    !reserved &&
    associationsValid;

  const updateTitle = (value: string) => {
    setTitle(value);
    if (!slugEdited) setSlug(normalizeSlug(value));
  };

  const submit = () => {
    if (!valid) return;
    onCreate({
      title: title.trim(),
      slug: normalizedSlug,
      type,
      menuIds,
      serviceIds,
      isDefault:
        (type === "order" || type === "catering") &&
        (needsDefault || makeDefault),
    });
    setTitle("");
    setSlug("");
    setSlugEdited(false);
    setType("content");
    setMenuIds([]);
    setServiceIds([]);
    setMakeDefault(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="website-v3-create-page"
        className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-[26px] bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#315fce]">
              Nouvelle page
            </p>
            <h2
              id="website-v3-create-page"
              className="mt-1 text-2xl font-semibold tracking-tight text-slate-950"
            >
              Ajouter une expérience
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <Field label="Nom de la page">
            <input
              autoFocus
              data-field-id="page.create.title"
              value={title}
              onChange={(event) => updateTitle(event.target.value)}
              placeholder="Brunch du dimanche"
              className={inputClass}
            />
          </Field>
          <Field label="Type de page">
            <div className="grid grid-cols-3 gap-2">
              {(["content", "order", "catering"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  data-field-id="page.create.type"
                  onClick={() => {
                    setType(candidate);
                    if (
                      candidate === "order" ||
                      candidate === "catering"
                    ) {
                      setSlug(suggestSpecificSlug(candidate, pages));
                      setSlugEdited(false);
                    }
                    setMakeDefault(
                      !pages.some(
                        (page) =>
                          page.type === candidate && page.is_default,
                      ),
                    );
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                    type === candidate
                      ? "border-[#315fce] bg-[#edf2ff] text-[#244ca9]"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {candidate === "content"
                    ? "Contenu"
                    : candidate === "order"
                      ? "Commande"
                      : "Traiteur"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Adresse publique">
            {addressIsEditable ? (
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-[#315fce] focus-within:ring-2 focus-within:ring-[#315fce]/10">
                <span className="text-sm text-slate-400">/</span>
                <input
                  data-field-id="page.create.slug"
                  value={slug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(event.target.value);
                  }}
                  className="min-h-11 flex-1 bg-transparent px-1 text-sm outline-none"
                />
              </div>
            ) : (
              <ReadOnlyAddress value={publicAddress} />
            )}
            {duplicate || reserved ? (
              <p className="mt-1.5 text-xs font-medium text-red-600">
                {duplicate
                  ? "Cette adresse est déjà utilisée."
                  : normalizedSlug === "order"
                    ? "/order est attribuée automatiquement à la page commande principale."
                    : normalizedSlug === "catering"
                      ? "/catering est attribuée automatiquement à la page traiteur principale."
                      : "Cette adresse est utilisée par une fonction Foody."}
              </p>
            ) : null}
          </Field>

          {type === "order" ? (
            <AssociationPicker
              fieldId="page.create.menu_ids"
              label="Cartes visibles"
              empty="Aucune carte web n’est disponible."
              options={menus
                .filter((menu) => menu.web_enabled)
                .map((menu) => ({ id: menu.id, label: menu.name }))}
              selected={menuIds}
              onChange={setMenuIds}
            />
          ) : null}
          {type === "catering" ? (
            <AssociationPicker
              fieldId="page.create.service_ids"
              label="Prestations visibles"
              empty="Aucune prestation active n’est disponible."
              options={services
                .filter((service) => service.is_active)
                .map((service) => ({ id: service.id, label: service.name }))}
              selected={serviceIds}
              onChange={setServiceIds}
            />
          ) : null}

          {type === "order" || type === "catering" ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                type="checkbox"
                data-field-id="page.create.is_default"
                checked={needsDefault || makeDefault}
                disabled={needsDefault}
                onChange={(event) => setMakeDefault(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#315fce]"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Page principale
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  Utilisée par le lien compatible /{type === "order" ? "order" : "catering"}.
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="mt-7 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Créer la page
          </button>
        </div>
      </section>
    </div>
  );
}

function AssociationPicker({
  fieldId,
  label,
  empty,
  options,
  selected,
  onChange,
}: {
  fieldId: string;
  label: string;
  empty: string;
  options: { id: number; label: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  return (
    <Field label={label}>
      <div
        data-field-id={fieldId}
        tabIndex={-1}
        className="space-y-2 rounded-xl border border-slate-200 p-2"
      >
        {options.length === 0 ? (
          <p className="px-2 py-3 text-xs text-slate-500">{empty}</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
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
              />
              {option.label}
            </label>
          ))
        )}
      </div>
      {options.length > 0 && selected.length === 0 ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">
          Sélectionnez au moins une option.
        </p>
      ) : null}
    </Field>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#315fce] focus:ring-2 focus:ring-[#315fce]/10";
