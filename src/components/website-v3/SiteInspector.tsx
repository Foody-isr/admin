"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SectionImageUploader } from "@/components/website/SectionEditors";
import {
  loadInstagramStoriesSettings,
  updateInstagramStoriesWithRefresh,
} from "@/lib/social-navigation";
import {
  pageKey,
  type DraftConfigPayload,
  type DraftPagePayload,
  type DraftSectionPayload,
} from "@/lib/website-v3/types";
import { normalizeNavbarStyle } from "@/lib/website-v3/state";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";
import { FooterEditor } from "./FooterEditor";
import { NavigationCtaEditor } from "./NavigationCtaEditor";

export function SiteInspector({
  tab,
  config,
  restaurantId,
  restaurantLogoUrl,
  pages,
  footer,
  onChange,
  onPageVisibilityChange,
  onFooterChange,
  onStoriesNavigationAvailabilityChange,
  onRestaurantLogoUpload,
  onRestaurantLogoRemove,
}: {
  tab: "content" | "appearance" | "settings";
  config: DraftConfigPayload;
  restaurantId: number;
  restaurantLogoUrl?: string;
  pages: DraftPagePayload[];
  footer: DraftSectionPayload | null;
  onChange: (path: readonly (string | number)[], value: unknown) => void;
  onPageVisibilityChange: (key: string, visible: boolean) => void;
  onFooterChange: (
    path: readonly (string | number)[],
    value: unknown,
  ) => void;
  onStoriesNavigationAvailabilityChange: (
    available: boolean | undefined,
  ) => void;
  onRestaurantLogoUpload: (file: File) => Promise<void>;
  onRestaurantLogoRemove: () => Promise<void>;
}) {
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [storiesEnabled, setStoriesEnabled] = useState(false);
  const [storiesBusy, setStoriesBusy] = useState(false);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const effectiveRestaurantLogoUrl = Object.prototype.hasOwnProperty.call(
    config,
    "restaurant_logo_url",
  )
    ? string(config.restaurant_logo_url)
    : restaurantLogoUrl;
  const navbarStyle = normalizeNavbarStyle(config.navbar_style);

  useEffect(() => {
    let active = true;
    loadInstagramStoriesSettings(restaurantId)
      .then((settings) => {
        if (active) {
          setInstagramConnected(settings.connected);
          setStoriesEnabled(settings.storiesEnabled);
          onStoriesNavigationAvailabilityChange(
            settings.storiesNavigationAvailable,
          );
          setStoriesError(
            settings.storiesNavigationAvailable === undefined
              ? "La disponibilité publique de Stories est inconnue. Réessayez la vérification."
              : null,
          );
        }
      })
      .catch((error) => {
        if (active) {
          setInstagramConnected(false);
          onStoriesNavigationAvailabilityChange(undefined);
          setStoriesError(
            `Impossible de vérifier les réglages Stories. Réessayez. (${errorMessage(error)})`,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [onStoriesNavigationAvailabilityChange, restaurantId]);

  const updateStories = async (next: boolean) => {
    const previous = storiesEnabled;
    setStoriesEnabled(next);
    setStoriesBusy(true);
    setStoriesError(null);
    try {
      const result = await updateInstagramStoriesWithRefresh(
        restaurantId,
        next,
      );
      setStoriesEnabled(result.storiesEnabled);
      if (result.refreshError) {
        if (result.settings) {
          setInstagramConnected(result.settings.connected);
        }
        onStoriesNavigationAvailabilityChange(undefined);
        setStoriesError(
          "Stories enregistrées, mais leur disponibilité publique n’a pas pu être vérifiée. Réessayez.",
        );
      } else if (result.settings) {
        setInstagramConnected(result.settings.connected);
        onStoriesNavigationAvailabilityChange(
          result.settings.storiesNavigationAvailable,
        );
      }
    } catch (error) {
      setStoriesEnabled(previous);
      setStoriesError(
        `Impossible d’enregistrer Stories. (${errorMessage(error)})`,
      );
    } finally {
      setStoriesBusy(false);
    }
  };

  const retryStoriesRefresh = async () => {
    setStoriesBusy(true);
    setStoriesError(null);
    try {
      const settings = await loadInstagramStoriesSettings(restaurantId);
      setInstagramConnected(settings.connected);
      setStoriesEnabled(settings.storiesEnabled);
      onStoriesNavigationAvailabilityChange(
        settings.storiesNavigationAvailable,
      );
      if (settings.storiesNavigationAvailable === undefined) {
        setStoriesError(
          "La disponibilité publique de Stories reste inconnue. Réessayez la vérification.",
        );
      }
    } catch (error) {
      onStoriesNavigationAvailabilityChange(undefined);
      setStoriesError(
        `La disponibilité publique de Stories reste inconnue. Réessayez. (${errorMessage(error)})`,
      );
    } finally {
      setStoriesBusy(false);
    }
  };

  if (tab === "content") {
    return (
      <>
        <InspectorGroup
          title="Introduction"
          description="La signature est affichée par les expériences publiques compatibles."
        >
          <InspectorField label="Signature">
            <textarea
              data-field-id="site.tagline"
              value={string(config.tagline)}
              onChange={(event) => onChange(["tagline"], event.target.value)}
              className={`${controlClass} min-h-20 py-2.5`}
              placeholder="Une phrase courte qui raconte votre cuisine."
            />
          </InspectorField>
        </InspectorGroup>
        {footer ? (
          <FooterEditor
            footer={footer}
            tab="content"
            onChange={onFooterChange}
          />
        ) : (
          <MissingFooter />
        )}
      </>
    );
  }

  if (tab === "appearance") {
    return (
      <>
        <InspectorGroup
          title="Éléments visuels partagés"
          description="Le logo, la navigation et le pied de page sont globaux. Les thèmes, couleurs et typographies se règlent maintenant dans l’onglet Apparence de chaque page."
        >
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-900">
            Sélectionnez une page dans la colonne de gauche pour personnaliser son
            thème. Ouvrez Réglages ici pour modifier les logos et la barre de
            navigation partagés.
          </div>
        </InspectorGroup>
        {footer ? (
          <FooterEditor
            footer={footer}
            tab="appearance"
            onChange={onFooterChange}
          />
        ) : (
          <MissingFooter />
        )}
      </>
    );
  }

  const navLayout = record(config.nav_layout);
  const contentNav = {
    desktop: "full",
    mobile: "compact",
    bottom_bar: false,
    ...record(navLayout.content),
  };
  const shoppingNav = {
    desktop: "compact",
    mobile: "hidden",
    bottom_bar: true,
    ...record(navLayout.shopping),
  };
  const updateNavSide = (
    side: "content" | "shopping",
    patch: Record<string, unknown>,
    legacyPatch: Record<string, unknown> = {},
  ) =>
    onChange([], {
      ...config,
      ...legacyPatch,
      nav_layout: {
        ...navLayout,
        [side]: {
          ...(side === "content" ? contentNav : shoppingNav),
          ...patch,
        },
      },
    });
  return (
    <>
      <InspectorGroup
        title="Logos et identité"
        description="Le logo principal est partagé par le site. Les variantes permettent de garder un bon contraste."
      >
        <RestaurantLogoUploader
          currentUrl={effectiveRestaurantLogoUrl}
          onUpload={onRestaurantLogoUpload}
          onRemove={onRestaurantLogoRemove}
        />
        <InspectorField label="Position dans la barre">
          <select
            data-field-id="site.navbar_logo_position"
            value={string(config.navbar_logo_position) || "left"}
            onChange={(event) =>
              onChange(["navbar_logo_position"], event.target.value)
            }
            className={controlClass}
          >
            <option value="left">Gauche</option>
            <option value="center">Centre</option>
            <option value="right">Droite</option>
          </select>
        </InspectorField>
        <RangeField
          fieldId="site.logo_size"
          label="Taille dans la barre"
          value={number(config.logo_size, 40)}
          min={24}
          max={96}
          suffix="px"
          onChange={(value) => onChange(["logo_size"], value)}
        />
        <ToggleField
          fieldId="site.hide_navbar_name"
          label="Masquer le nom du restaurant"
          checked={boolean(config.hide_navbar_name, false)}
          onChange={(value) => onChange(["hide_navbar_name"], value)}
        />
        <SectionImageUploader
          restaurantId={restaurantId}
          currentUrl={string(config.navbar_scrolled_logo_url)}
          onUploaded={(url) => onChange(["navbar_scrolled_logo_url"], url)}
          onRemove={() => onChange(["navbar_scrolled_logo_url"], "")}
          label="Logo alternatif sur fond clair"
        />
        <input
          type="url"
          data-field-id="site.navbar_scrolled_logo_url"
          value={string(config.navbar_scrolled_logo_url)}
          onChange={(event) =>
            onChange(["navbar_scrolled_logo_url"], event.target.value)
          }
          className={controlClass}
          placeholder="Ou collez l’URL du logo alternatif"
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
      </InspectorGroup>

      <InspectorGroup
        title="Navigation"
        description="Composez une navigation lisible pour les pages contenu et commerce."
      >
        <InspectorField label="Style">
          <select
            data-field-id="site.navbar_style"
            value={navbarStyle}
            onChange={(event) => onChange(["navbar_style"], event.target.value)}
            className={controlClass}
          >
            <option value="solid">Pleine</option>
            <option value="transparent">Toujours transparente</option>
            <option value="overlay">
              Transparente puis colorée au survol
            </option>
          </select>
        </InspectorField>
        <ColorField
          fieldId="site.navbar_color"
          label={
            navbarStyle === "overlay"
              ? "Fond au survol"
              : "Couleur de fond"
          }
          value={string(config.navbar_color)}
          fallback="#ffffff"
          onChange={(value) => onChange(["navbar_color"], value)}
        />
        <ColorField
          fieldId="site.navbar_overlay_text_color"
          label="Texte au repos"
          value={string(config.navbar_overlay_text_color)}
          fallback="#ffffff"
          onChange={(value) =>
            onChange(["navbar_overlay_text_color"], value)
          }
        />
        <ColorField
          fieldId="site.navbar_text_color"
          label={
            navbarStyle === "overlay" ? "Texte au survol" : "Texte"
          }
          value={string(config.navbar_text_color)}
          fallback="#111111"
          onChange={(value) => onChange(["navbar_text_color"], value)}
        />
        <ToggleField
          fieldId="site.navbar_show_links"
          label="Afficher les liens sur les pages contenu"
          description="Active la navigation complète sur ordinateur."
          checked={contentNav.desktop === "full"}
          onChange={(value) =>
            updateNavSide(
              "content",
              { desktop: value ? "full" : "compact" },
              { navbar_show_links: value },
            )
          }
        />
        <div className="space-y-2">
          {pages
            .slice()
            .sort((left, right) => left.sort_order - right.sort_order)
            .map((page) => (
              <ToggleField
                key={pageKey(page)}
                fieldId={`site.navigation-page.${pageKey(page)}`}
                label={page.title}
                description={`/${page.slug} · ${page.type}`}
                checked={page.nav_visible}
                onChange={(visible) =>
                  onPageVisibilityChange(pageKey(page), visible)
                }
              />
            ))}
        </div>
        <InspectorField label="Pages contenu · ordinateur">
          <select
            value={string(contentNav.desktop) || "full"}
            onChange={(event) =>
              updateNavSide("content", { desktop: event.target.value })
            }
            className={controlClass}
          >
            <option value="full">Complète · liens visibles</option>
            <option value="compact">Compacte · flottante sans logo</option>
            <option value="hidden">Masquée</option>
          </select>
        </InspectorField>
        <InspectorField label="Pages contenu · mobile">
          <select
            data-field-id="site.navbar_hamburger"
            value={string(contentNav.mobile) || "compact"}
            onChange={(event) =>
              updateNavSide(
                "content",
                { mobile: event.target.value },
                {
                  navbar_hamburger:
                    event.target.value === "compact" ? "mobile" : "off",
                },
              )
            }
            className={controlClass}
          >
            <option value="full">Complète</option>
            <option value="compact">Compacte · sans barre ni logo</option>
            <option value="hidden">Masquée</option>
          </select>
        </InspectorField>
        <InspectorField label="Commande et traiteur · ordinateur">
          <select
            value={string(shoppingNav.desktop) || "compact"}
            onChange={(event) =>
              updateNavSide("shopping", { desktop: event.target.value })
            }
            className={controlClass}
          >
            <option value="full">Complète · liens visibles</option>
            <option value="compact">Compacte · flottante sans logo</option>
            <option value="hidden">Masquée</option>
          </select>
        </InspectorField>
        <InspectorField label="Commande et traiteur · mobile">
          <select
            value={string(shoppingNav.mobile) || "hidden"}
            onChange={(event) =>
              updateNavSide("shopping", { mobile: event.target.value })
            }
            className={controlClass}
          >
            <option value="full">Complète</option>
            <option value="compact">Compacte · sans barre ni logo</option>
            <option value="hidden">Masquée</option>
          </select>
        </InspectorField>
        <ToggleField
          fieldId={"site.nav-layout.shopping.bottom-bar"}
          label="Barre mobile de la boutique"
          description="Conserve un accès à la navigation lorsque la barre du haut est masquée."
          checked={boolean(shoppingNav.bottom_bar, true)}
          onChange={(value) =>
            updateNavSide("shopping", { bottom_bar: value })
          }
        />
        <div className="border-t border-slate-100 pt-4">
          <NavigationCtaEditor
            value={record(config.navbar_cta)}
            allowInherit={false}
            onChange={(value) => onChange(["navbar_cta"], value ?? {})}
          />
        </div>
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Instagram</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {instagramConnected
                ? "Instagram connecté"
                : "Instagram non connecté"}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              instagramConnected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {instagramConnected ? "Connecté" : "Non connecté"}
          </span>
        </div>
        <label
          className={`flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-3 ${
            instagramConnected ? "cursor-pointer" : "cursor-not-allowed opacity-60"
          }`}
        >
          <span>
            <span className="block text-sm font-medium text-slate-800">
              Afficher Stories
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
              Stories apparaît seulement lorsque cette option et la connexion
              Instagram sont actives.
            </span>
          </span>
          <input
            data-field-id="site.stories_enabled"
            type="checkbox"
            checked={storiesEnabled}
            disabled={!instagramConnected || storiesBusy}
            onChange={(event) => void updateStories(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#315fce]"
          />
        </label>
        {storiesError ? (
          <div className="space-y-1.5" role="alert">
            <p className="text-xs text-red-600">{storiesError}</p>
            <button
              type="button"
              disabled={storiesBusy}
              onClick={() => void retryStoriesRefresh()}
              className="text-xs font-semibold text-[#315fce] underline underline-offset-2 disabled:cursor-wait disabled:opacity-50"
            >
              Réessayer la vérification
            </button>
          </div>
        ) : null}
        {!instagramConnected ? (
          <Link
            href={`/${restaurantId}/reels`}
            className="inline-flex text-xs font-semibold text-[#315fce] underline underline-offset-2"
          >
            Configurer Instagram dans les réglages Reels
          </Link>
        ) : null}
      </InspectorGroup>

      <InspectorGroup title="Formulaires avancés">
        <JsonField
          fieldId="site.checkout_config"
          label="Configuration du checkout"
          value={config.checkout_config}
          onChange={(value) => onChange(["checkout_config"], value)}
        />
        <JsonField
          fieldId="site.order_page_info"
          label="Informations de la page commande"
          value={config.order_page_info}
          onChange={(value) => onChange(["order_page_info"], value)}
        />
      </InspectorGroup>
    </>
  );
}

function MissingFooter() {
  return (
    <InspectorGroup title="Pied de page">
      <p className="rounded-xl bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
        Aucune section footer canonique n’est disponible. Les réglages associés
        ne sont pas exposés pour éviter une configuration sans effet.
      </p>
    </InspectorGroup>
  );
}

function RestaurantLogoUploader({
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

function JsonField({
  fieldId,
  label,
  value,
  onChange,
}: {
  fieldId: string;
  label: string;
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const serialized = pretty(record(value));
  const [draft, setDraft] = useState(serialized);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(serialized);
    setInvalid(false);
  }, [serialized]);

  return (
    <InspectorField
      label={label}
      hint={
        invalid
          ? undefined
          : "Format JSON avancé. Les changements sont appliqués en quittant le champ."
      }
      error={invalid ? "Le JSON est invalide. Corrigez-le avant de continuer." : undefined}
    >
      <textarea
        data-field-id={fieldId}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={(event) => {
          const parsed = parseJson(event.target.value);
          if (parsed) {
            setInvalid(false);
            onChange(parsed);
          } else {
            setInvalid(true);
          }
        }}
        className={`${controlClass} min-h-32 py-2 font-mono text-xs`}
        spellCheck={false}
      />
    </InspectorField>
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function pretty(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return record(parsed);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
