"use client";

import type {
  CateringService,
  Menu,
  Restaurant,
  ThemeCatalog,
  WebsiteConfig,
} from "@/lib/api";
import { SectionImageUploader } from "@/components/website/SectionEditors";
import { OrderPageInfoEditor } from "@/components/website/OrderPageInfoEditor";
import { useI18n } from "@/lib/i18n";
import { ThemesPanel } from "@/components/website-menu/ThemesPanel";
import { TypographyPanel } from "@/components/website-menu/TypographyPanel";
import {
  convertPageType,
  normalizeSlug,
  pageAddressIsEditable,
} from "@/lib/website-v3/state";
import {
  publicAddressForPage,
} from "@/lib/website-v3/url-model";
import type {
  DraftPagePayload,
  FieldError,
  NavbarCtaOverride,
  StatePath,
  WebsitePageType,
} from "@/lib/website-v3/types";
import { ColorField, InspectorField, InspectorGroup, ToggleField, controlClass } from "./controls";
import { CategoryBarStateEditor } from "./CategoryBarStateEditor";
import { CommerceSelector } from "./CommerceSelector";
import { NavigationCtaEditor } from "./NavigationCtaEditor";
import { ReadOnlyAddress } from "./PageAddress";

export function PageInspector({
  page,
  tab,
  restaurantId,
  restaurant,
  config,
  catalog,
  catalogWarning,
  menus,
  services,
  errors,
  onChange,
  onReplace,
  onMakeDefault,
  onMakeHomepage,
}: {
  page: DraftPagePayload;
  tab: "content" | "appearance" | "settings";
  restaurantId: number;
  restaurant: Restaurant;
  config: Record<string, unknown>;
  catalog: ThemeCatalog;
  catalogWarning?: string | null;
  menus: Menu[];
  services: CateringService[];
  errors: FieldError[];
  onChange: (path: StatePath, value: unknown) => void;
  onReplace: (page: DraftPagePayload) => void;
  onMakeDefault: () => void;
  onMakeHomepage: () => void;
}) {
  const { t } = useI18n();
  const errorFor = (fieldId: string) =>
    errors.find((error) => error.fieldId === fieldId)?.message;
  const appearance = page.appearance_overrides;
  const navbarStyle = resolvePageNavbarStyle(
    appearance.navbar_style,
    config.navbar_style,
  );
  const addressIsEditable = pageAddressIsEditable(page);
  const publicAddress = publicAddressForPage(page);
  const normalizedPageSlug = normalizeSlug(page.slug);
  const slugError =
    !addressIsEditable
      ? undefined
      : normalizedPageSlug === "order"
        ? "/order est attribuée automatiquement à la page commande principale."
        : normalizedPageSlug === "catering"
          ? "/catering est attribuée automatiquement à la page traiteur principale."
          : errorFor("page.slug");
  const pageVisualConfig = {
    ...config,
    ...appearance,
    navbar_style: navbarStyle,
  } as unknown as WebsiteConfig;
  const updateAppearance = (patch: Partial<WebsiteConfig>) =>
    onChange(["appearance_overrides"], {
      ...appearance,
      ...patch,
    });

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
          title="Direction visuelle de la page"
          description="Cette page peut avoir son propre thème. Les anciennes valeurs restent utilisées tant qu’aucune surcharge n’est choisie."
        >
          {catalogWarning ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {catalogWarning}
            </p>
          ) : null}
          <ThemesPanel
            config={pageVisualConfig}
            catalog={catalog}
            excludedSectionColors={
              page.type === "order" ? ["categoryBar"] : undefined
            }
            onUpdate={updateAppearance}
          />
        </InspectorGroup>
        <InspectorGroup
          title="Typographie de la page"
          description="Les styles de titres, catégories, produits, prix et descriptions sont propres à cette page."
        >
          <TypographyPanel
            config={pageVisualConfig}
            catalog={catalog}
            restaurantId={restaurantId}
            heroNameFont={pageVisualConfig.hero_name_font ?? ""}
            heroSample={restaurant.name}
            onHeroNameFontChange={(family) =>
              updateAppearance({ hero_name_font: family })
            }
            onUpdate={updateAppearance}
            fieldIdPrefix="page.appearance_overrides.typography.roles"
          />
        </InspectorGroup>
        <InspectorGroup
          title="Ajustements rapides"
          description="Ces couleurs remplacent les variables principales du thème uniquement sur cette page."
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
            label="Texte général (par défaut)"
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
        <InspectorGroup title="Polices des pages de contenu">
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
        {page.type === "order" ? (
          <CheckoutTextColorsEditor
            value={record(appearance.checkout_text_colors)}
            onChange={(value) =>
              onChange(["appearance_overrides", "checkout_text_colors"], value)
            }
          />
        ) : null}
        {page.type === "order" ? (
          <InspectorGroup
            title={t("websiteV3CategoryBarTitle")}
            description={t("websiteV3CategoryBarDescription")}
          >
            <CategoryBarStateEditor
              value={record(appearance.section_colors)}
              onChange={(value) =>
                onChange(
                  ["appearance_overrides", "section_colors"],
                  value,
                )
              }
            />
          </InspectorGroup>
        ) : null}
        {page.type === "order" || page.type === "catering" ? (
          <CommerceAppearance
            page={page}
            restaurantId={restaurantId}
            restaurant={restaurant}
            menus={menus}
            onChange={onChange}
          />
        ) : null}
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
          error={slugError}
        >
          {addressIsEditable ? (
            <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#315fce] focus-within:ring-2 focus-within:ring-[#315fce]/10">
              <span className="text-sm text-slate-400">/</span>
              <input
                data-field-id="page.slug"
                value={page.slug}
                onChange={(event) => onChange(["slug"], event.target.value)}
                onBlur={(event) =>
                  onChange(["slug"], normalizeSlug(event.target.value))
                }
                className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
              />
            </div>
          ) : (
            <ReadOnlyAddress value={publicAddress} />
          )}
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
        <ToggleField
          fieldId="page.is_homepage"
          label={t("websiteV3Homepage")}
          description={t("websiteV3HomepageDescription")}
          checked={page.is_homepage}
          onChange={(checked) => {
            if (checked) onMakeHomepage();
          }}
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
            label={t(
              page.type === "order"
                ? "websiteV3OrderPrimary"
                : "websiteV3CateringPrimary",
            )}
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

      <InspectorGroup
        title="Navigation et pied de page"
        description="La disposition choisit les éléments affichés. Le fond et le comportement règlent uniquement l’apparence de cette page."
      >
        <InspectorField label="Disposition ordinateur">
          <select
            value={appearance.navigation_mode ?? "inherit"}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "navigation_mode"],
                event.target.value,
              )
            }
            className={controlClass}
          >
            <option value="inherit">Hériter du site</option>
            <option value="full">Complète</option>
            <option value="compact">Compacte · flottante sans logo</option>
            <option value="hidden">Masquée</option>
          </select>
        </InspectorField>
        <InspectorField label="Disposition mobile">
          <select
            value={appearance.navigation_mode_mobile ?? "inherit"}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "navigation_mode_mobile"],
                event.target.value,
              )
            }
            className={controlClass}
          >
            <option value="inherit">Hériter du site</option>
            <option value="full">Complète</option>
            <option value="compact">Compacte · flottante sans logo</option>
            <option value="hidden">Masquée</option>
          </select>
        </InspectorField>
        <InspectorField label={t("hideNavbarName")}>
          <select
            data-field-id="page.appearance_overrides.hide_navbar_name"
            value={
              appearance.hide_navbar_name === undefined
                ? "inherit"
                : appearance.hide_navbar_name
                  ? "hide"
                  : "show"
            }
            onChange={(event) => {
              const value = event.target.value;
              if (value === "inherit") {
                const { hide_navbar_name: _hidden, ...nextAppearance } =
                  appearance;
                onChange(["appearance_overrides"], nextAppearance);
                return;
              }
              onChange(
                ["appearance_overrides", "hide_navbar_name"],
                value === "hide",
              );
            }}
            className={controlClass}
          >
            <option value="inherit">{t("websiteV3InheritSite")}</option>
            <option value="show">{t("websiteV3ShowRestaurantName")}</option>
            <option value="hide">{t("websiteV3HideRestaurantName")}</option>
          </select>
        </InspectorField>
        <InspectorField label="Fond et comportement">
          <select
            data-field-id="page.appearance_overrides.navbar_style"
            value={appearance.navbar_style ?? "inherit"}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "navbar_style"],
                event.target.value,
              )
            }
            className={controlClass}
          >
            <option value="inherit">Hériter du site</option>
            <option value="solid">Plein</option>
            <option value="transparent">Toujours transparent</option>
            <option value="overlay">Transparent puis coloré</option>
          </select>
        </InspectorField>
        <ColorField
          fieldId="page.appearance_overrides.navbar_color"
          label={
            navbarStyle === "overlay"
              ? "Couleur de fond au survol"
              : "Couleur de fond normale"
          }
          value={appearance.navbar_color ?? ""}
          fallback="#ffffff"
          onChange={(value) =>
            onChange(["appearance_overrides", "navbar_color"], value)
          }
        />
        {navbarStyle === "overlay" ? (
          <ColorField
            fieldId="page.appearance_overrides.navbar_overlay_text_color"
            label="Couleur du texte normale"
            value={appearance.navbar_overlay_text_color ?? ""}
            fallback="#ffffff"
            onChange={(value) =>
              onChange(
                ["appearance_overrides", "navbar_overlay_text_color"],
                value,
              )
            }
          />
        ) : null}
        <ColorField
          fieldId="page.appearance_overrides.navbar_text_color"
          label={
            navbarStyle === "overlay"
              ? "Couleur du texte au survol"
              : "Couleur du texte normale"
          }
          value={appearance.navbar_text_color ?? ""}
          fallback="#111111"
          onChange={(value) =>
            onChange(
              ["appearance_overrides", "navbar_text_color"],
              value,
            )
          }
        />
        <div className="border-t border-slate-100 pt-4">
          <NavigationCtaEditor
            value={appearance.navbar_cta ?? {}}
            inherited={record(config.navbar_cta) as NavbarCtaOverride}
            allowInherit
            onChange={(value) => {
              if (value) {
                onChange(
                  ["appearance_overrides", "navbar_cta"],
                  value,
                );
                return;
              }
              const { navbar_cta: _cta, ...nextAppearance } = appearance;
              onChange(["appearance_overrides"], nextAppearance);
            }}
          />
        </div>
        <InspectorField label="Pied de page">
          <select
            value={appearance.footer_mode ?? "inherit"}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "footer_mode"],
                event.target.value,
              )
            }
            className={controlClass}
          >
            <option value="inherit">Hériter du site</option>
            <option value="full">Complet</option>
            <option value="compact">Compact</option>
            <option value="hidden">Masqué</option>
          </select>
        </InspectorField>
      </InspectorGroup>

      {page.type === "order" ? (
        <InspectorGroup
          title="Informations de commande"
          description="Choisissez les informations visibles dans la barre et dans la fenêtre Plus pour cette page."
        >
          <OrderPageInfoEditor
            value={pageVisualConfig.order_page_info ?? null}
            availableModes={[
              ...(restaurant.pickup_enabled ? (["pickup"] as const) : []),
              ...(restaurant.delivery_enabled ? (["delivery"] as const) : []),
              ...(restaurant.dine_in_enabled ? (["dine_in"] as const) : []),
            ]}
            locked={Boolean(
              pageVisualConfig.checkout_config?.lock_order_type,
            )}
            onChange={(value) =>
              onChange(
                ["appearance_overrides", "order_page_info"],
                value,
              )
            }
          />
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

const CHECKOUT_TEXT_COLOR_FIELDS = [
  ["heading", "Titres", "#111827"],
  ["primary", "Texte principal", "#111827"],
  ["secondary", "Texte secondaire et aides", "#64748b"],
  ["input", "Texte saisi dans les champs", "#111827"],
  ["price", "Prix et totaux", "#111827"],
  ["button", "Texte des boutons principaux", "#ffffff"],
] as const;

function CheckoutTextColorsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  return (
    <InspectorGroup
      title="Textes du checkout"
      description="Séparez les titres, aides, champs, montants et boutons de la couleur générale. Utilisez l’onglet Checkout au-dessus de l’aperçu pour voir ces changements en direct."
    >
      {CHECKOUT_TEXT_COLOR_FIELDS.map(([key, label, fallback]) => (
        <ColorField
          key={key}
          fieldId={`page.appearance_overrides.checkout_text_colors.${key}`}
          label={label}
          value={text(value[key])}
          fallback={fallback}
          onChange={(color) => onChange({ ...value, [key]: color })}
        />
      ))}
    </InspectorGroup>
  );
}

function CommerceAppearance({
  page,
  restaurantId,
  restaurant,
  menus,
  onChange,
}: {
  page: DraftPagePayload;
  restaurantId: number;
  restaurant: Restaurant;
  menus: Menu[];
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const appearance = page.appearance_overrides;
  const coverUrl = appearance.cover_url || restaurant.cover_url || "";
  const orderTypeSelector = record(appearance.order_type_selector);
  const updateOrderTypeSelector = (patch: Record<string, unknown>) =>
    onChange(["appearance_overrides", "order_type_selector"], {
      ...orderTypeSelector,
      ...patch,
    });

  return (
    <>
      <InspectorGroup
        title="Couverture"
        description="L’image, le cadrage et la composition ne s’appliquent qu’à cette page."
      >
        <SectionImageUploader
          restaurantId={restaurantId}
          currentUrl={coverUrl}
          onUploaded={(url) =>
            onChange(["appearance_overrides", "cover_url"], url)
          }
          onRemove={() =>
            onChange(["appearance_overrides", "cover_url"], "")
          }
          label="Image de couverture"
        />
        <ColorField
          fieldId={"page.appearance_overrides.background_color"}
          label="Couleur sans image"
          value={appearance.background_color ?? restaurant.background_color ?? ""}
          fallback="#111827"
          onChange={(value) =>
            onChange(["appearance_overrides", "background_color"], value)
          }
        />
        {coverUrl ? (
          <>
            <InspectorField
              label={`Point horizontal · ${appearance.cover_focal_x ?? restaurant.cover_focal_x ?? 50}%`}
            >
              <input
                type="range"
                min={0}
                max={100}
                value={appearance.cover_focal_x ?? restaurant.cover_focal_x ?? 50}
                onChange={(event) =>
                  onChange(
                    ["appearance_overrides", "cover_focal_x"],
                    Number(event.target.value),
                  )
                }
                className="w-full accent-[#315fce]"
              />
            </InspectorField>
            <InspectorField
              label={`Point vertical · ${appearance.cover_focal_y ?? restaurant.cover_focal_y ?? 50}%`}
            >
              <input
                type="range"
                min={0}
                max={100}
                value={appearance.cover_focal_y ?? restaurant.cover_focal_y ?? 50}
                onChange={(event) =>
                  onChange(
                    ["appearance_overrides", "cover_focal_y"],
                    Number(event.target.value),
                  )
                }
                className="w-full accent-[#315fce]"
              />
            </InspectorField>
          </>
        ) : null}
        <InspectorField label="Composition">
          <select
            value={appearance.hero_cover_layout ?? "card"}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "hero_cover_layout"],
                event.target.value,
              )
            }
            className={controlClass}
          >
            <option value="card">Carte avec nom et logo</option>
            <option value="logo">Logo centré</option>
            <option value="bare">Logo libre</option>
          </select>
        </InspectorField>
        <InspectorField label="Fond du cadre logo">
          <select
            value={appearance.hero_logo_bg ?? "white"}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "hero_logo_bg"],
                event.target.value,
              )
            }
            className={controlClass}
          >
            <option value="white">Blanc</option>
            <option value="black">Noir</option>
          </select>
        </InspectorField>
        <InspectorField
          label={`Taille du logo · ${appearance.hero_logo_size ?? 100}%`}
        >
          <input
            type="range"
            min={50}
            max={200}
            value={appearance.hero_logo_size ?? 100}
            onChange={(event) =>
              onChange(
                ["appearance_overrides", "hero_logo_size"],
                Number(event.target.value),
              )
            }
            className="w-full accent-[#315fce]"
          />
        </InspectorField>
      </InspectorGroup>

      {page.type === "order" ? (
        <>
          <InspectorGroup
            title="Sélecteur du type de commande"
            description="Personnalisez le bouton À emporter / Livraison sur cette page."
          >
            <InspectorField label="Forme">
              <select
                data-field-id="page.appearance_overrides.order_type_selector.shape"
                value={text(orderTypeSelector.shape) || "rounded"}
                onChange={(event) =>
                  updateOrderTypeSelector({ shape: event.target.value })
                }
                className={controlClass}
              >
                <option value="pill">Pilule</option>
                <option value="rounded">Arrondi</option>
                <option value="square">Rectangle</option>
              </select>
            </InspectorField>
            <InspectorField label="Style">
              <select
                data-field-id="page.appearance_overrides.order_type_selector.variant"
                value={text(orderTypeSelector.variant) || "filled"}
                onChange={(event) =>
                  updateOrderTypeSelector({ variant: event.target.value })
                }
                className={controlClass}
              >
                <option value="filled">Plein</option>
                <option value="outline">Contour</option>
                <option value="ghost">Transparent</option>
              </select>
            </InspectorField>
            <InspectorField label="Taille">
              <select
                data-field-id="page.appearance_overrides.order_type_selector.size"
                value={text(orderTypeSelector.size) || "md"}
                onChange={(event) =>
                  updateOrderTypeSelector({ size: event.target.value })
                }
                className={controlClass}
              >
                <option value="sm">Petite</option>
                <option value="md">Moyenne</option>
                <option value="lg">Grande</option>
              </select>
            </InspectorField>
            <ColorField
              fieldId="page.appearance_overrides.order_type_selector.bg"
              label="Fond"
              value={text(orderTypeSelector.bg)}
              fallback="#f1f5f9"
              onChange={(value) => updateOrderTypeSelector({ bg: value })}
            />
            <ColorField
              fieldId="page.appearance_overrides.order_type_selector.text_color"
              label="Texte et icône"
              value={text(orderTypeSelector.text_color)}
              fallback="#315fce"
              onChange={(value) =>
                updateOrderTypeSelector({ text_color: value })
              }
            />
            <ColorField
              fieldId="page.appearance_overrides.order_type_selector.border_color"
              label="Contour"
              value={text(orderTypeSelector.border_color)}
              fallback="#315fce"
              onChange={(value) =>
                updateOrderTypeSelector({ border_color: value })
              }
            />
          </InspectorGroup>
          <InspectorGroup
            title="Catalogue et séparateurs"
            description="Retrouvez les dispositions et styles de catégories disponibles dans la V2."
          >
          <InspectorField label="Disposition ordinateur">
            <select
              value={appearance.layout_default ?? "magazine"}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "layout_default"],
                  event.target.value,
                )
              }
              className={controlClass}
            >
              <option value="magazine">Magazine</option>
              <option value="compact">Compacte</option>
            </select>
          </InspectorField>
          <InspectorField label="Disposition mobile">
            <select
              value={appearance.layout_default_mobile ?? ""}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "layout_default_mobile"],
                  event.target.value,
                )
              }
              className={controlClass}
            >
              <option value="">Comme sur ordinateur</option>
              <option value="magazine">Magazine</option>
              <option value="compact">Compacte</option>
            </select>
          </InspectorField>
          <InspectorField label="Style des séparateurs">
            <select
              value={appearance.category_banner_style ?? ""}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "category_banner_style"],
                  event.target.value,
                )
              }
              className={controlClass}
            >
              <option value="">Hériter</option>
              <option value="image-overlay">Image avec titre</option>
              <option value="image-only">Image seule</option>
              <option value="text-block">Bloc texte</option>
              <option value="striped-rule">Ligne éditoriale</option>
              <option value="color-title">Titre coloré</option>
              <option value="none">Aucun séparateur</option>
            </select>
          </InspectorField>
          <InspectorField
            label={`Voile de l’image · ${appearance.category_banner_overlay ?? 40}%`}
          >
            <input
              type="range"
              min={0}
              max={100}
              value={appearance.category_banner_overlay ?? 40}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "category_banner_overlay"],
                  Number(event.target.value),
                )
              }
              className="w-full accent-[#315fce]"
            />
          </InspectorField>
          <InspectorField label="Recadrage ordinateur">
            <select
              value={appearance.category_banner_fit ?? ""}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "category_banner_fit"],
                  event.target.value,
                )
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
              value={appearance.category_banner_fit_mobile ?? ""}
              onChange={(event) =>
                onChange(
                  ["appearance_overrides", "category_banner_fit_mobile"],
                  event.target.value,
                )
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
          <InspectorGroup
            title="Visuels par catégorie"
            description="Chaque groupe peut avoir une image, un cadrage et un titre coloré propres à cette page de commande."
          >
            <GroupBannerEditor
              restaurantId={restaurantId}
              menus={menus}
              selectedMenuIds={page.settings.menu_ids}
              style={appearance.category_banner_style ?? ""}
              overrides={appearance.group_banners ?? {}}
              onChange={(groupBanners) =>
                onChange(
                  ["appearance_overrides", "group_banners"],
                  groupBanners,
                )
              }
            />
          </InspectorGroup>
        </>
      ) : null}
    </>
  );
}

function GroupBannerEditor({
  restaurantId,
  menus,
  selectedMenuIds,
  style,
  overrides,
  onChange,
}: {
  restaurantId: number;
  menus: Menu[];
  selectedMenuIds: number[];
  style: string;
  overrides: NonNullable<
    DraftPagePayload["appearance_overrides"]["group_banners"]
  >;
  onChange: (
    value: NonNullable<
      DraftPagePayload["appearance_overrides"]["group_banners"]
    >,
  ) => void;
}) {
  const groups = menus
    .filter(
      (menu) =>
        selectedMenuIds.length === 0 || selectedMenuIds.includes(menu.id),
    )
    .flatMap((menu) =>
      (menu.groups ?? []).map((group) => ({
        ...group,
        menuName: menu.name,
      })),
    );

  function updateGroup(
    groupId: number,
    patch: Record<string, unknown>,
  ) {
    const key = String(groupId);
    onChange({
      ...overrides,
      [key]: {
        ...overrides[key],
        ...patch,
      },
    });
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
        Aucune catégorie n’est disponible dans les cartes sélectionnées.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const override = overrides[String(group.id)] ?? {};
        const design = record(override.banner_design ?? group.banner_design);
        const title = record(design.title);
        const imageUrl =
          override.image_url !== undefined
            ? override.image_url
            : group.image_url || "";
        return (
          <details
            key={`${group.menu_id}-${group.id}`}
            className="rounded-xl border border-slate-200 bg-white"
          >
            <summary className="cursor-pointer list-none px-3 py-3">
              <span className="block text-xs font-semibold text-slate-800">
                {group.name}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-500">
                {group.menuName}
              </span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-3">
              <SectionImageUploader
                restaurantId={restaurantId}
                currentUrl={imageUrl}
                onUploaded={(url) =>
                  updateGroup(group.id, { image_url: url })
                }
                onRemove={() =>
                  updateGroup(group.id, { image_url: "" })
                }
                label="Image du séparateur"
              />
              <InspectorField
                label={`Cadrage horizontal · ${override.focal_x ?? group.banner_focal_x ?? 50}%`}
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={override.focal_x ?? group.banner_focal_x ?? 50}
                  onChange={(event) =>
                    updateGroup(group.id, {
                      focal_x: Number(event.target.value),
                    })
                  }
                  className="w-full accent-[#315fce]"
                />
              </InspectorField>
              <InspectorField
                label={`Cadrage vertical · ${override.focal_y ?? group.banner_focal_y ?? 50}%`}
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={override.focal_y ?? group.banner_focal_y ?? 50}
                  onChange={(event) =>
                    updateGroup(group.id, {
                      focal_y: Number(event.target.value),
                    })
                  }
                  className="w-full accent-[#315fce]"
                />
              </InspectorField>
              {style === "color-title" ? (
                <>
                  <ColorField
                    fieldId={`page.group-banner.${group.id}.background`}
                    label="Fond"
                    value={text(design.bgColor)}
                    fallback="#fef3c7"
                    onChange={(value) =>
                      updateGroup(group.id, {
                        banner_design: { ...design, bgColor: value },
                      })
                    }
                  />
                  <InspectorField label="Titre affiché">
                    <input
                      value={text(title.text)}
                      onChange={(event) =>
                        updateGroup(group.id, {
                          banner_design: {
                            ...design,
                            title: { ...title, text: event.target.value },
                          },
                        })
                      }
                      className={controlClass}
                      placeholder={group.name}
                    />
                  </InspectorField>
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorField label="Police">
                      <input
                        value={text(title.font)}
                        onChange={(event) =>
                          updateGroup(group.id, {
                            banner_design: {
                              ...design,
                              title: { ...title, font: event.target.value },
                            },
                          })
                        }
                        className={controlClass}
                        placeholder="Héritée"
                      />
                    </InspectorField>
                    <InspectorField label="Alignement">
                      <select
                        value={text(title.align) || "center"}
                        onChange={(event) =>
                          updateGroup(group.id, {
                            banner_design: {
                              ...design,
                              title: { ...title, align: event.target.value },
                            },
                          })
                        }
                        className={controlClass}
                      >
                        <option value="left">Gauche</option>
                        <option value="center">Centre</option>
                        <option value="right">Droite</option>
                      </select>
                    </InspectorField>
                  </div>
                  <ColorField
                    fieldId={`page.group-banner.${group.id}.text`}
                    label="Couleur du titre"
                    value={text(title.color)}
                    fallback="#111827"
                    onChange={(value) =>
                      updateGroup(group.id, {
                        banner_design: {
                          ...design,
                          title: { ...title, color: value },
                        },
                      })
                    }
                  />
                  <InspectorField
                    label={`Taille du titre · ${asNumber(title.size, 1).toFixed(2)}×`}
                  >
                    <input
                      type="range"
                      min={0.6}
                      max={2.5}
                      step={0.05}
                      value={asNumber(title.size, 1)}
                      onChange={(event) =>
                        updateGroup(group.id, {
                          banner_design: {
                            ...design,
                            title: {
                              ...title,
                              size: Number(event.target.value),
                            },
                          },
                        })
                      }
                      className="w-full accent-[#315fce]"
                    />
                  </InspectorField>
                </>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function resolvePageNavbarStyle(
  override: unknown,
  globalStyle: unknown,
): "solid" | "transparent" | "overlay" {
  return validNavbarStyle(override) ?? validNavbarStyle(globalStyle) ?? "solid";
}

function validNavbarStyle(
  value: unknown,
): "solid" | "transparent" | "overlay" | null {
  return value === "solid" || value === "transparent" || value === "overlay"
    ? value
    : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}
