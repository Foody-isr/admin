"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeCatalog } from "@/lib/api";
import { SectionImageUploader } from "@/components/website/SectionEditors";
import {
  pageKey,
  type DraftConfigPayload,
  type DraftPagePayload,
  type DraftSectionPayload,
} from "@/lib/website-v3/types";
import {
  ColorField,
  InspectorField,
  InspectorGroup,
  ToggleField,
  controlClass,
} from "./controls";

export function SiteInspector({
  tab,
  config,
  catalog,
  catalogWarning,
  restaurantId,
  restaurantLogoUrl,
  pages,
  footer,
  onChange,
  onPageVisibilityChange,
  onFooterChange,
  onRestaurantLogoUpload,
  onRestaurantLogoRemove,
}: {
  tab: "content" | "appearance" | "settings";
  config: DraftConfigPayload;
  catalog: ThemeCatalog;
  catalogWarning?: string | null;
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
  onRestaurantLogoUpload: (file: File) => Promise<void>;
  onRestaurantLogoRemove: () => Promise<void>;
}) {
  const social = socialRecord(footer?.content.social_links);
  const effectiveRestaurantLogoUrl = Object.prototype.hasOwnProperty.call(
    config,
    "restaurant_logo_url",
  )
    ? string(config.restaurant_logo_url)
    : restaurantLogoUrl;

  if (tab === "content") {
    return (
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
    );
  }

  if (tab === "appearance") {
    return (
      <>
        <InspectorGroup
          title="Direction visuelle"
          description="Le thème et la paire typographique sont appliqués au site entier."
        >
          {catalogWarning ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {catalogWarning}
            </p>
          ) : null}
          <InspectorField label="Thème">
            <select
              data-field-id="site.theme_id"
              value={string(config.theme_id)}
              onChange={(event) => onChange(["theme_id"], event.target.value)}
              className={controlClass}
            >
              <option value="">Thème par défaut</option>
              {catalog.themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </InspectorField>
          <InspectorField label="Typographie">
            <select
              data-field-id="site.pairing_id"
              value={string(config.pairing_id)}
              onChange={(event) => onChange(["pairing_id"], event.target.value)}
              className={controlClass}
            >
              <option value="">Typographie du thème</option>
              {catalog.typography_pairings.map((pairing) => (
                <option key={pairing.id} value={pairing.id}>
                  {pairing.name}
                </option>
              ))}
            </select>
          </InspectorField>
          <ColorField
            fieldId="site.brand_color"
            label="Couleur de marque"
            value={string(config.brand_color)}
            fallback="#315fce"
            onChange={(value) => onChange(["brand_color"], value)}
          />
          <InspectorField label="Police du nom du restaurant">
            <input
              data-field-id="site.hero_name_font"
              value={string(config.hero_name_font)}
              onChange={(event) =>
                onChange(["hero_name_font"], event.target.value)
              }
              className={controlClass}
              placeholder="Héritée du thème"
            />
          </InspectorField>
          <JsonField
            fieldId="site.typography"
            label="Réglages typographiques avancés"
            value={config.typography}
            onChange={(value) => onChange(["typography"], value)}
          />
        </InspectorGroup>

        <InspectorGroup title="Carte et catégories">
          <InspectorField label="Disposition ordinateur">
            <select
              data-field-id="site.layout_default"
              value={string(config.layout_default) || "compact"}
              onChange={(event) =>
                onChange(["layout_default"], event.target.value)
              }
              className={controlClass}
            >
              <option value="compact">Compacte</option>
              <option value="magazine">Magazine</option>
            </select>
          </InspectorField>
          <InspectorField label="Disposition mobile">
            <select
              data-field-id="site.layout_default_mobile"
              value={string(config.layout_default_mobile)}
              onChange={(event) =>
                onChange(["layout_default_mobile"], event.target.value)
              }
              className={controlClass}
            >
              <option value="">Comme sur ordinateur</option>
              <option value="compact">Compacte</option>
              <option value="magazine">Magazine</option>
            </select>
          </InspectorField>
          <InspectorField label="Style des catégories">
            <select
              data-field-id="site.category_banner_style"
              value={string(config.category_banner_style)}
              onChange={(event) =>
                onChange(["category_banner_style"], event.target.value)
              }
              className={controlClass}
            >
              <option value="">Par défaut</option>
              <option value="image-overlay">Image avec titre</option>
              <option value="image-only">Image seule</option>
              <option value="text-block">Bloc texte</option>
              <option value="striped-rule">Ligne éditoriale</option>
              <option value="color-title">Titre coloré</option>
              <option value="none">Sans bannière</option>
            </select>
          </InspectorField>
          <InspectorField label="Opacité de la bannière">
            <input
              type="range"
              min={0}
              max={100}
              data-field-id="site.category_banner_overlay"
              value={number(config.category_banner_overlay, 35)}
              onChange={(event) =>
                onChange(["category_banner_overlay"], Number(event.target.value))
              }
              className="w-full accent-[#315fce]"
            />
          </InspectorField>
          <InspectorField label="Recadrage ordinateur">
            <select
              data-field-id="site.category_banner_fit"
              value={string(config.category_banner_fit)}
              onChange={(event) =>
                onChange(["category_banner_fit"], event.target.value)
              }
              className={controlClass}
            >
              <option value="">Par défaut</option>
              <option value="cover">Remplir</option>
              <option value="contain">Contenir</option>
              <option value="natural">Taille naturelle</option>
            </select>
          </InspectorField>
          <InspectorField label="Recadrage mobile">
            <select
              data-field-id="site.category_banner_fit_mobile"
              value={string(config.category_banner_fit_mobile)}
              onChange={(event) =>
                onChange(["category_banner_fit_mobile"], event.target.value)
              }
              className={controlClass}
            >
              <option value="">Comme sur ordinateur</option>
              <option value="cover">Remplir</option>
              <option value="contain">Contenir</option>
              <option value="natural">Taille naturelle</option>
            </select>
          </InspectorField>
        </InspectorGroup>
      </>
    );
  }

  const cta = record(config.navbar_cta);
  const navLayout = record(config.nav_layout);
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
            value={string(config.navbar_style)}
            onChange={(event) => onChange(["navbar_style"], event.target.value)}
            className={controlClass}
          >
            <option value="solid">Pleine</option>
            <option value="overlay">Superposée au visuel</option>
          </select>
        </InspectorField>
        <ColorField
          fieldId="site.navbar_color"
          label="Couleur de fond"
          value={string(config.navbar_color)}
          fallback="#ffffff"
          onChange={(value) => onChange(["navbar_color"], value)}
        />
        <ToggleField
          fieldId="site.navbar_show_links"
          label="Afficher les liens"
          checked={boolean(config.navbar_show_links, true)}
          onChange={(value) => onChange(["navbar_show_links"], value)}
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
        <InspectorField label="Menu compact">
          <select
            data-field-id="site.navbar_hamburger"
            value={string(config.navbar_hamburger) || "mobile"}
            onChange={(event) =>
              onChange(["navbar_hamburger"], event.target.value)
            }
            className={controlClass}
          >
            <option value="mobile">Sur mobile</option>
            <option value="always">Toujours</option>
            <option value="off">Désactivé</option>
          </select>
        </InspectorField>
        <InspectorField label="Libellé du bouton">
          <input
            data-field-id="site.navbar_cta"
            value={string(cta.text)}
            onChange={(event) =>
              onChange(["navbar_cta"], {
                ...cta,
                enabled: true,
                text: event.target.value,
              })
            }
            className={controlClass}
            placeholder="Commander"
          />
        </InspectorField>
        <JsonField
          fieldId="site.nav_layout"
          label="Composition avancée"
          value={navLayout}
          onChange={(value) => onChange(["nav_layout"], value)}
        />
      </InspectorGroup>

      {footer ? (
        <>
          <InspectorGroup
            title="Pied de page"
            description="Navigation et pied de page sont regroupés dans les réglages globaux du site."
          >
            <input
              data-field-id="section.content.custom_text"
              value={string(footer.content.custom_text)}
              onChange={(event) =>
                onFooterChange(["content", "custom_text"], event.target.value)
              }
              className={controlClass}
              placeholder="© Votre restaurant"
            />
            <ToggleField
              fieldId="section.content.show_address"
              label="Afficher l’adresse"
              checked={boolean(footer.content.show_address, true)}
              onChange={(value) =>
                onFooterChange(["content", "show_address"], value)
              }
            />
            <ToggleField
              fieldId="section.content.show_phone"
              label="Afficher le téléphone"
              checked={boolean(footer.content.show_phone, true)}
              onChange={(value) =>
                onFooterChange(["content", "show_phone"], value)
              }
            />
            <ToggleField
              fieldId="section.content.show_hours"
              label="Afficher les horaires"
              checked={boolean(footer.content.show_hours, true)}
              onChange={(value) =>
                onFooterChange(["content", "show_hours"], value)
              }
            />
          </InspectorGroup>
          <InspectorGroup
            title="Réseaux sociaux"
            description="Seuls les liens renseignés sont affichés."
          >
            {(["instagram", "facebook", "tiktok"] as const).map((network) => (
              <InspectorField
                key={network}
                label={network.charAt(0).toUpperCase() + network.slice(1)}
              >
                <input
                  type="url"
                  data-field-id="section.content.social_links"
                  value={social[network] ?? ""}
                  onChange={(event) =>
                    onFooterChange(
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
            ))}
          </InspectorGroup>
        </>
      ) : (
        <InspectorGroup title="Pied de page">
          <p className="rounded-xl bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
            Aucune section footer canonique n’est disponible. Les réglages
            associés ne sont pas exposés pour éviter une configuration sans
            effet.
          </p>
        </InspectorGroup>
      )}

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
