"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { SectionImageUploader } from "./SupportingContentEditors";
import { useI18n } from "@/lib/i18n";
import {
  type DraftConfigPayload,
  type DraftPagePayload,
  type DraftSectionPayload,
} from "@/lib/website-v3/types";
import {
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";
import { HeaderInspector } from "./HeaderInspector";

/** Edits shared site identity and links to the dedicated Stories settings. */
export function SiteInspector({
  config,
  restaurantId,
  restaurantLogoUrl,
  restaurantCoverUrl,
  orderChoicesAvailable,
  pages,
  sections,
  onChange,
  onRestaurantLogoUpload,
  onRestaurantLogoRemove,
}: {
  config: DraftConfigPayload;
  restaurantId: number;
  restaurantLogoUrl?: string;
  restaurantCoverUrl?: string;
  orderChoicesAvailable?: boolean;
  pages: DraftPagePayload[];
  sections: DraftSectionPayload[];
  onChange: (path: readonly (string | number)[], value: unknown) => void;
  onRestaurantLogoUpload: (file: File) => Promise<void>;
  onRestaurantLogoRemove: () => Promise<void>;
}) {
  const { t } = useI18n();
  const effectiveRestaurantLogoUrl = Object.prototype.hasOwnProperty.call(
    config,
    "restaurant_logo_url",
  )
    ? string(config.restaurant_logo_url)
    : restaurantLogoUrl;
  const [editingHeader, setEditingHeader] = useState(false);
  const shareImageUrl = string(config.share_image_url);
  const shareImageMode =
    string(config.share_image_mode) === "cover" ? "cover" : "logo";
  const shareImageBg =
    string(config.share_image_bg) === "black" ||
    string(config.share_image_bg) === "brand"
      ? string(config.share_image_bg)
      : "white";

  if (editingHeader) return <><button className="sqe-button sqe-button-secondary m-4" onClick={() => setEditingHeader(false)}>Retour aux réglages du site</button><HeaderInspector config={config} pages={pages} sections={sections} restaurantId={restaurantId} restaurantLogoUrl={restaurantLogoUrl} restaurantCoverUrl={restaurantCoverUrl} orderChoicesAvailable={orderChoicesAvailable} onChange={onChange}/></>;
  return (
    <>
      <InspectorGroup title={t("editorSiteIntroduction")}>
        <InspectorField label={t("editorSiteTagline")}>
          <textarea data-field-id="site.tagline" value={string(config.tagline)} onChange={event => onChange(["tagline"], event.target.value)} className={`${controlClass} min-h-20 py-2.5`} />
        </InspectorField>
      </InspectorGroup>
      <InspectorGroup
        title="Logos et identité"
        description="Le logo principal est partagé par le site. Les variantes permettent de garder un bon contraste."
      >
        <RestaurantLogoUploader
          currentUrl={effectiveRestaurantLogoUrl}
          onUpload={onRestaurantLogoUpload}
          onRemove={onRestaurantLogoRemove}
        />
        <RangeField
          fieldId="site.hero_logo_size"
          label="Taille sur la couverture"
          value={number(config.hero_logo_size, 100)}
          min={50}
          max={200}
          suffix="%"
          onChange={(value) => onChange(["hero_logo_size"], value)}
        />
        <ToggleField
          fieldId="site.hide_hero_logo"
          label="Masquer le logo sur la couverture"
          checked={boolean(config.hide_hero_logo, false)}
          onChange={(value) => onChange(["hide_hero_logo"], value)}
        />
        <SectionImageUploader
          restaurantId={restaurantId}
          currentUrl={string(config.favicon_url)}
          onUploaded={(url) => onChange(["favicon_url"], url)}
          onRemove={() => onChange(["favicon_url"], "")}
          label="Favicon"
        />
        <input
          type="url"
          data-field-id="site.favicon_url"
          value={string(config.favicon_url)}
          onChange={(event) => onChange(["favicon_url"], event.target.value)}
          className={controlClass}
          placeholder="Ou collez l’URL du favicon"
        />
        <SectionImageUploader
          restaurantId={restaurantId}
          currentUrl={shareImageUrl}
          onUploaded={(url) => onChange(["share_image_url"], url)}
          onRemove={() => onChange(["share_image_url"], "")}
          label="Image de partage (WhatsApp, réseaux sociaux)"
        />
        <input
          type="url"
          value={shareImageUrl}
          onChange={(event) =>
            onChange(["share_image_url"], event.target.value)
          }
          className={controlClass}
          placeholder="Ou collez l’URL de l’image de partage"
        />
        <InspectorField
          label="Rendu de l’aperçu"
          hint={
            shareImageMode === "cover"
              ? "L’image remplit le cadre 1200×630, recadrée au centre."
              : "L’image est centrée sur un fond uni. Sans image de partage, le logo principal est utilisé."
          }
        >
          <select
            value={shareImageMode}
            onChange={(event) =>
              onChange(["share_image_mode"], event.target.value)
            }
            className={controlClass}
          >
            <option value="logo">Logo centré sur un fond</option>
            <option value="cover">Image plein cadre</option>
          </select>
        </InspectorField>
        {shareImageMode === "logo" ? (
          <InspectorField label="Fond de l’aperçu">
            <select
              value={shareImageBg}
              onChange={(event) =>
                onChange(["share_image_bg"], event.target.value)
              }
              className={controlClass}
            >
              <option value="white">Blanc</option>
              <option value="black">Noir</option>
              <option value="brand">Couleur de marque</option>
            </select>
          </InspectorField>
        ) : null}
      </InspectorGroup>

      <InspectorGroup title="En-tête" description="Personnalisez le logo, les liens, les boutons et la disposition de l’en-tête.">
        <button className="sqe-button sqe-button-secondary w-full" onClick={() => setEditingHeader(true)}>Modifier l’en-tête</button>
      </InspectorGroup>

      <InspectorGroup
        title="Liens système"
        description="Ces destinations globales complètent les pages publiées sans créer de fausses pages dans le rail."
      >
        <ToggleField
          fieldId="site.show_orders_link"
          label="Mes commandes"
          description="Affiche l’accès à l’historique des commandes dans la navigation publique."
          checked={boolean(config.show_orders_link, true)}
          onChange={(value) => onChange(["show_orders_link"], value)}
        />
        <Link href={`/${restaurantId}/settings/stories`} className="inline-flex text-sm font-semibold underline underline-offset-4">
          {t("editorManageStories")}
        </Link>
      </InspectorGroup>

    </>
  );
}

/** Uploads or removes the shared restaurant logo and surfaces persistence errors. */
export function RestaurantLogoUploader({
  currentUrl,
  onUpload,
  onRemove,
}: {
  currentUrl?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de modifier le logo.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <InspectorField label="Logo principal" error={error ?? undefined}>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt=""
            className="h-14 w-14 rounded-xl border border-slate-200 object-contain"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-300 text-[10px] text-slate-400">
            Logo
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Envoi…" : currentUrl ? "Remplacer" : "Téléverser"}
          </button>
          {currentUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(onRemove)}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Supprimer
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void run(() => onUpload(file));
        }}
      />
    </InspectorField>
  );
}

function RangeField({
  fieldId,
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  fieldId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <InspectorField label={`${label} · ${value}${suffix}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={2}
        data-field-id={fieldId}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#315fce]"
      />
    </InspectorField>
  );
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
