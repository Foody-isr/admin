"use client";

import { pageKey } from "@/lib/website-v3/types";
import { websiteOrderChoicesAvailable } from "@/lib/website-v3/fulfillment";
import type { OrderHeaderPresentation, WebsiteHeader } from "@/lib/website-v3/header";
import { useMemo } from "react";
import type {
  CateringService,
  Menu,
  Restaurant,
  ThemeCatalog,
} from "@/lib/api";
import type {
  DraftPagePayload,
  DraftSectionPayload,
  DraftStatePayload,
  FieldError,
  StatePath,
} from "@/lib/website-v3/types";
import { useI18n } from "@/lib/i18n";
import { isTechnicalSitePage } from "@/lib/website-v3/state";
import type {
  InspectorSurface,
} from "@/lib/website-v3/inspector-scope";
import { PageInspector } from "./PageInspector";
import type { RailSelection } from "@/lib/website-v3/editor-selection";
import { resolveSelectedPage } from "@/lib/website-v3/editor-selection";
import { resolveSiteFooter } from "@/lib/website-v3/footer";
import { SectionInspector, type SectionPanel } from "./SectionInspector";
import { HeaderInspector } from "./HeaderInspector";
import { FooterBrandingEditor } from "./FooterBrandingEditor";
import { FooterEditor } from "./FooterEditor";
import { MissingFooter } from "./MissingFooter";
import { SiteInspector } from "./SiteInspector";

/** Routes selection to the editor for that page, section or shared element. */
export function Inspector({
  restaurantId,
  restaurant,
  restaurantLogoUrl,
  state,
  selection,
  sectionPanel,
  surface,
  showBranchSelector = false,
  menus,
  services,
  catalog,
  catalogWarning,
  errors,
  onSurfaceChange,
  onOpenOrderJourney,
  onConfigChange,
  onOrderHeaderChange,
  onPageChange,
  onPageReplace,
  onSectionChange,
  onCreateFooter,
  onMakeDefault,
  onMakeHomepage,
  onRestaurantLogoUpload,
  onRestaurantLogoRemove,
}: {
  restaurantId: number;
  restaurant: Restaurant;
  restaurantLogoUrl?: string;
  state: DraftStatePayload;
  selection: RailSelection;
  sectionPanel: SectionPanel;
  /** The preview surface on screen. Scopes the page inspector's fields so it
   *  never offers a setting the visible surface does not render. */
  surface: InspectorSurface;
  showBranchSelector?: boolean;
  menus: Menu[];
  services: CateringService[];
  catalog: ThemeCatalog;
  catalogWarning?: string | null;
  errors: FieldError[];
  onSurfaceChange: (surface: InspectorSurface) => void;
  onOpenOrderJourney?: () => void;
  onConfigChange: (path: StatePath, value: unknown) => void;
  onOrderHeaderChange: (key: string, header: OrderHeaderPresentation | null, shared: WebsiteHeader) => void;
  onPageChange: (key: string, path: StatePath, value: unknown) => void;
  onPageReplace: (key: string, page: DraftPagePayload) => void;
  onSectionChange: (key: string, path: StatePath, value: unknown) => void;
  onCreateFooter: () => void;
  onMakeDefault: (key: string) => void;
  onMakeHomepage: (key: string) => void;
  onRestaurantLogoUpload: (file: File) => Promise<void>;
  onRestaurantLogoRemove: () => Promise<void>;
}) {
  const { t } = useI18n();
  const page = useMemo(
    () => resolveSelectedPage(state, selection),
    [selection, state],
  );
  const section =
    selection.kind === "section"
      ? (state.sections.find(
          (candidate) => stableSectionKey(candidate) === selection.sectionKey,
        ) ?? null)
      : null;
  const footer = resolveSiteFooter(state.sections);

  // Only an order page has two surfaces. Not offered for the site selection
  // (which resolves to the landing page) or for a section.
  const showSurfaceSwitcher =
    selection.kind === "page" && page?.type === "order";
  const surfaceOptions: Array<{ value: InspectorSurface; label: string }> = [
    ...(showBranchSelector
      ? [{ value: "branches" as const, label: t("chain_selector_surface") }]
      : []),
    { value: "page", label: t("chain_selector_menu_surface") },
    { value: "checkout", label: t("websiteV3SurfaceCheckout") },
  ];

  return (
    <div className="min-h-full">
      {showSurfaceSwitcher ? (
        <div className="flex items-center gap-2 px-6 pt-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {t("websiteV3SurfaceLabel")}
          </span>
          <div
            role="group"
            aria-label={t("websiteV3SurfaceGroupLabel")}
            className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
          >
            {surfaceOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                data-inspector-surface={value}
                aria-pressed={surface === value}
                onClick={() => onSurfaceChange(value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  surface === value
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selection.kind === "site" && selection.region === "header" ? (
        <HeaderInspector
          orderChoicesAvailable={websiteOrderChoicesAvailable(restaurant, state.config.checkout_config)}
          onOpenOrderJourney={onOpenOrderJourney}
          page={page}
          onOrderHeaderChange={page ? (header, shared) => onOrderHeaderChange(pageKey(page), header, shared) : undefined}
          activeElement={selection.headerElement}
          config={state.config}
          sections={state.sections}
          pages={state.pages.filter(candidate => !isTechnicalSitePage(candidate))}
          restaurantId={restaurantId}
          restaurantLogoUrl={restaurantLogoUrl}
          restaurantCoverUrl={restaurant.cover_url}
          onChange={onConfigChange}
        />
      ) : selection.kind === "site" && selection.region === "footer-branding" ? (
        <FooterBrandingEditor config={state.config} onChange={onConfigChange}/>
      ) : (selection.kind === "site" && selection.region === "footer") || section?.section_type === "footer" ? (
        footer ? (
          <FooterEditor
            footer={footer}
            restaurantId={restaurantId}
            pages={state.pages.filter(candidate => !isTechnicalSitePage(candidate))}
            sections={state.sections}
            onChange={(path, value) =>
              onSectionChange(stableSectionKey(footer), path, value)
            }
          />
        ) : (
          <MissingFooter onCreate={onCreateFooter} />
        )
      ) : selection.kind === "site" ? (
        <SiteInspector
          orderChoicesAvailable={websiteOrderChoicesAvailable(restaurant, state.config.checkout_config)}
          sections={state.sections}
          config={state.config}
          restaurantId={restaurantId}
          restaurantLogoUrl={restaurantLogoUrl}
          restaurantCoverUrl={restaurant.cover_url}
          pages={state.pages.filter(
            (candidate) => !isTechnicalSitePage(candidate),
          )}
          onChange={onConfigChange}
          onRestaurantLogoUpload={onRestaurantLogoUpload}
          onRestaurantLogoRemove={onRestaurantLogoRemove}
        />
      ) : section ? (
        <SectionInspector
          sectionPanel={sectionPanel}
          restaurantId={restaurantId}
          section={section}
          placementGroups={orderPlacementGroups(page, menus)}
          onChange={(path, value) =>
            onSectionChange(stableSectionKey(section), path, value)
          }
        />
      ) : page ? (
        <PageInspector
          page={page}
          pages={state.pages.filter(
            (candidate) => !isTechnicalSitePage(candidate),
          )}
          surface={surface}
          onSurfaceChange={onSurfaceChange}
          restaurantId={restaurantId}
          restaurant={restaurant}
          config={state.config}
          onConfigChange={onConfigChange}
          catalog={catalog}
          catalogWarning={catalogWarning}
          menus={menus}
          services={services}
          errors={errors.filter(
            (error) => !error.pageKey || error.pageKey === stablePageKey(page),
          )}
          onChange={(path, value) =>
            onPageChange(stablePageKey(page), path, value)
          }
          onReplace={(replacement) =>
            onPageReplace(stablePageKey(page), replacement)
          }
          onMakeDefault={() => onMakeDefault(stablePageKey(page))}
          onMakeHomepage={() => onMakeHomepage(stablePageKey(page))}
        />
      ) : (
        <div className="p-5 text-sm text-slate-500">
          Sélectionnez une page ou une section.
        </div>
      )}
    </div>
  );
}

function stablePageKey(page: DraftPagePayload): string {
  return page.id !== undefined ? String(page.id) : (page.tmp_id ?? "");
}

function orderPlacementGroups(
  page: DraftPagePayload | null,
  menus: Menu[],
): Array<{ id: string; name: string }> {
  if (page?.type !== "order") return [];
  const configuredMenuIds = Array.isArray(page.settings?.menu_ids)
    ? new Set(
        page.settings.menu_ids
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id)),
      )
    : new Set<number>();
  const selectedMenus = menus
    .filter(
      (menu) =>
        menu.web_enabled &&
        (configuredMenuIds.size === 0 || configuredMenuIds.has(menu.id)),
    )
    .sort((left, right) => left.sort_order - right.sort_order);
  const showMenuName = selectedMenus.length > 1;

  return selectedMenus.flatMap((menu) =>
    (menu.groups ?? menu.categories ?? [])
      .filter((group) => group.web_enabled && !group.is_hidden)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((group) => ({
        id: String(group.id),
        name: showMenuName ? `${group.name} — ${menu.name}` : group.name,
      })),
  );
}

function stableSectionKey(section: DraftSectionPayload): string {
  return section.id !== undefined ? String(section.id) : (section.tmp_id ?? "");
}
