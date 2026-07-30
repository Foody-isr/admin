"use client";

import type { CateringService, Menu } from "@/lib/api";
import {
  convertPageType,
  normalizeSlug,
} from "@/lib/website-v3/state";
import type {
  DraftPagePayload,
  FieldError,
  StatePath,
  WebsitePageType,
} from "@/lib/website-v3/types";
import { ColorField, InspectorField, InspectorGroup, ToggleField, controlClass } from "./controls";
import { CommerceSelector } from "./CommerceSelector";

export function PageInspector({
  page,
  tab,
  menus,
  services,
  errors,
  onChange,
  onReplace,
  onMakeDefault,
}: {
  page: DraftPagePayload;
  tab: "content" | "appearance" | "settings";
  menus: Menu[];
  services: CateringService[];
  errors: FieldError[];
  onChange: (path: StatePath, value: unknown) => void;
  onReplace: (page: DraftPagePayload) => void;
  onMakeDefault: () => void;
}) {
  const errorFor = (fieldId: string) =>
    errors.find((error) => error.fieldId === fieldId)?.message;

  if (tab === "content") {
    return (
      <>
        <InspectorGroup
          title="Identité de la page"
          description="Le titre est utilisé dans la navigation et comme repère dans le builder."
        >
          <InspectorField label="Nom" error={errorFor("page.title")}>
            <input
              data-field-id="page.title"
              value={page.title}
              onChange={(event) => onChange(["title"], event.target.value)}
              className={controlClass}
            />
          </InspectorField>
        </InspectorGroup>
        <InspectorGroup
          title="Sections"
          description={
            page.type === "landing" || page.type === "content"
              ? "Sélectionnez une section dans l’aperçu ou ajoutez-en depuis le canvas."
              : "Les pages commerce utilisent les cartes et prestations associées."
          }
        >
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
            {page.type === "landing" || page.type === "content"
              ? "Les blocs de contenu suivent cette page dans l’aperçu, y compris avant publication."
              : page.type === "order"
                ? "Le contenu de commande est alimenté par les cartes sélectionnées dans Réglages."
                : "Le contenu traiteur est alimenté par les prestations sélectionnées dans Réglages."}
          </p>
        </InspectorGroup>
      </>
    );
  }

  if (tab === "appearance") {
    return (
      <>
        <InspectorGroup
          title="Palette de la page"
          description="Ces valeurs remplacent le thème global uniquement sur cette page."
        >
          <ColorField
            fieldId="page.appearance_overrides.bg"
            label="Arrière-plan"
            value={page.appearance_overrides.bg ?? ""}
            fallback="#ffffff"
            onChange={(value) =>
              onChange(["appearance_overrides", "bg"], value)
            }
          />
          <ColorField
            fieldId="page.appearance_overrides.ink"
            label="Texte"
            value={page.appearance_overrides.ink ?? ""}
            fallback="#111827"
            onChange={(value) =>
              onChange(["appearance_overrides", "ink"], value)
            }
          />
          <ColorField
            fieldId="page.appearance_overrides.accent"
            label="Accent"
            value={page.appearance_overrides.accent ?? ""}
            fallback="#315fce"
            onChange={(value) =>
              onChange(["appearance_overrides", "accent"], value)
            }
          />
        </InspectorGroup>
        <InspectorGroup title="Typographie locale">
          <InspectorField label="Police des titres">
            <input
              data-field-id="page.appearance_overrides.headingFont"
              value={page.appearance_overrides.headingFont ?? ""}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "headingFont"],
                  event.target.value,
                )
              }
              className={controlClass}
              placeholder="Héritée du site"
            />
          </InspectorField>
          <InspectorField label="Police du texte">
            <input
              data-field-id="page.appearance_overrides.bodyFont"
              value={page.appearance_overrides.bodyFont ?? ""}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "bodyFont"],
                  event.target.value,
                )
              }
              className={controlClass}
              placeholder="Héritée du site"
            />
          </InspectorField>
        </InspectorGroup>
      </>
    );
  }

  const setType = (nextType: WebsitePageType) => {
    if (nextType === page.type) return;
    const removesAssociations =
      (page.type === "order" && page.settings.menu_ids.length > 0) ||
      (page.type === "catering" && page.settings.service_ids.length > 0);
    if (
      removesAssociations &&
      !window.confirm(
        "Changer le type supprimera les associations commerce de cette page. Continuer ?",
      )
    ) {
      return;
    }
    onReplace(convertPageType(page, nextType));
  };

  return (
    <>
      <InspectorGroup title="Adresse et type">
        <InspectorField
          label="Adresse publique"
          hint={`Adresse normalisée : /${normalizeSlug(page.slug)}`}
          error={errorFor("page.slug")}
        >
          <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#315fce] focus-within:ring-2 focus-within:ring-[#315fce]/10">
            <span className="text-sm text-slate-400">/</span>
            <input
              data-field-id="page.slug"
              value={page.slug}
              disabled={page.type === "landing"}
              onChange={(event) => onChange(["slug"], event.target.value)}
              onBlur={(event) =>
                onChange(["slug"], normalizeSlug(event.target.value))
              }
              className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none disabled:text-slate-400"
            />
          </div>
        </InspectorField>
        <InspectorField label="Type">
          <select
            data-field-id="page.type"
            value={page.type}
            disabled={page.type === "landing"}
            onChange={(event) =>
              setType(event.target.value as WebsitePageType)
            }
            className={controlClass}
          >
            {page.type === "landing" ? (
              <option value="landing">Accueil</option>
            ) : null}
            <option value="content">Contenu</option>
            <option value="order">Commande</option>
            <option value="catering">Traiteur</option>
          </select>
        </InspectorField>
        <ToggleField
          fieldId="page.nav_visible"
          label="Afficher dans la navigation"
          checked={page.nav_visible}
          onChange={(value) => onChange(["nav_visible"], value)}
        />
      </InspectorGroup>

      {page.type === "order" || page.type === "catering" ? (
        <InspectorGroup title="Commerce">
          <CommerceSelector
            page={page}
            menus={menus}
            services={services}
            error={errorFor(
              page.type === "order"
                ? "page.settings.menu_ids"
                : "page.settings.service_ids",
            )}
            onChange={(ids) =>
              onChange(
                [
                  "settings",
                  page.type === "order" ? "menu_ids" : "service_ids",
                ],
                ids,
              )
            }
          />
          <ToggleField
            fieldId="page.is_default"
            label="Page principale"
            description={`Cible du lien /${page.type === "order" ? "order" : "catering"}.`}
            checked={page.is_default}
            onChange={(checked) => {
              if (checked) onMakeDefault();
            }}
          />
          {errorFor("page.is_default") ? (
            <p className="text-xs font-medium text-red-600">
              {errorFor("page.is_default")}
            </p>
          ) : null}
        </InspectorGroup>
      ) : null}

      <InspectorGroup title="Référencement et partage">
        <InspectorField label="Titre SEO">
          <input
            data-field-id="page.seo.title"
            value={page.seo.title ?? ""}
            onChange={(event) =>
              onChange(["seo", "title"], event.target.value)
            }
            className={controlClass}
          />
        </InspectorField>
        <InspectorField label="Description SEO">
          <textarea
            data-field-id="page.seo.description"
            value={page.seo.description ?? ""}
            onChange={(event) =>
              onChange(["seo", "description"], event.target.value)
            }
            className={`${controlClass} min-h-24 py-2.5`}
          />
        </InspectorField>
        <InspectorField label="Image de partage">
          <input
            type="url"
            data-field-id="page.seo.share_image_url"
            value={page.seo.share_image_url ?? ""}
            onChange={(event) =>
              onChange(["seo", "share_image_url"], event.target.value)
            }
            className={controlClass}
            placeholder="https://..."
          />
        </InspectorField>
      </InspectorGroup>
    </>
  );
}
