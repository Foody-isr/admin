"use client";

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
  InspectorTab,
} from "@/lib/website-v3/inspector-scope";
import { PageInspector } from "./PageInspector";
import type { RailSelection } from "./PageRail";
import { SectionInspector } from "./SectionInspector";
import { SiteInspector } from "./SiteInspector";

/** Re-exported for the many components that already import it from here.
 *  The type itself lives with the scope table it keys. */
export type { InspectorTab };

export function Inspector({
  restaurantId,
  restaurant,
  restaurantLogoUrl,
  state,
  selection,
  tab,
  surface,
  showBranchSelector = false,
  menus,
  services,
  catalog,
  catalogWarning,
  errors,
  onTabChange,
  onSurfaceChange,
  onConfigChange,
  onPageChange,
  onPageReplace,
  onSectionChange,
  onMakeDefault,
  onMakeHomepage,
  onStoriesNavigationAvailabilityChange,
  onRestaurantLogoUpload,
  onRestaurantLogoRemove,
}: {
  restaurantId: number;
  restaurant: Restaurant;
  restaurantLogoUrl?: string;
  state: DraftStatePayload;
  selection: RailSelection;
  tab: InspectorTab;
  /** The preview surface on screen. Scopes the page inspector's fields so it
   *  never offers a setting the visible surface does not render. */
  surface: InspectorSurface;
  showBranchSelector?: boolean;
  menus: Menu[];
  services: CateringService[];
  catalog: ThemeCatalog;
  catalogWarning?: string | null;
  errors: FieldError[];
  onTabChange: (tab: InspectorTab) => void;
  onSurfaceChange: (surface: InspectorSurface) => void;
  onConfigChange: (path: StatePath, value: unknown) => void;
  onPageChange: (key: string, path: StatePath, value: unknown) => void;
  onPageReplace: (key: string, page: DraftPagePayload) => void;
  onSectionChange: (key: string, path: StatePath, value: unknown) => void;
  onMakeDefault: (key: string) => void;
  onMakeHomepage: (key: string) => void;
  onStoriesNavigationAvailabilityChange: (
    available: boolean | undefined,
  ) => void;
  onRestaurantLogoUpload: (file: File) => Promise<void>;
  onRestaurantLogoRemove: () => Promise<void>;
}) {
  const { t } = useI18n();
  const page = useMemo(
    () =>
      selection.kind === "page" || selection.kind === "section"
        ? state.pages.find((candidate) => stablePageKey(candidate) === (
            selection.kind === "page" ? selection.key : selection.pageKey
          )) ?? null
        : null,
    [selection, state.pages],
  );
  const section =
    selection.kind === "section"
      ? state.sections.find(
          (candidate) => stableSectionKey(candidate) === selection.sectionKey,
        ) ?? null
      : null;
  const footer =
    state.sections.find(
      (candidate) =>
        candidate.section_type === "footer" && candidate.page === "_site",
    ) ??
    state.sections.find((candidate) => candidate.section_type === "footer") ??
    null;

  const title =
    selection.kind === "site"
      ? "Identité du site"
      : section
        ? section.section_type.replace(/_/g, " ")
        : page?.title || "Page";

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
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 pb-0 pt-5 backdrop-blur">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#315fce]">
          Inspecteur
        </p>
        <h2 className="mt-1 truncate text-xl font-semibold capitalize tracking-tight text-slate-950">
          {title}
        </h2>
        {showSurfaceSwitcher ? (
          // Deliberately styled unlike the tab strip below: the surface picks
          // WHAT you are editing, the tab picks which aspect of it. If it read
          // as a fourth tab it would recreate the confusion this fixes.
          <div className="mt-4 flex items-center gap-2">
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
        <div
          className={`${showSurfaceSwitcher ? "mt-3" : "mt-5"} grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1`}
        >
          {(
            [
              ["content", "Contenu"],
              ["appearance", "Apparence"],
              ["settings", "Réglages"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                tab === value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selection.kind === "site" ? (
        <SiteInspector
          tab={tab}
          config={state.config}
          restaurantId={restaurantId}
          restaurantLogoUrl={restaurantLogoUrl}
          pages={state.pages.filter(
            (candidate) => !isTechnicalSitePage(candidate),
          )}
          footer={footer}
          onChange={onConfigChange}
          onPageVisibilityChange={(key, visible) =>
            onPageChange(key, ["nav_visible"], visible)
          }
          onFooterChange={(path, value) =>
            footer
              ? onSectionChange(stableSectionKey(footer), path, value)
              : undefined
          }
          onStoriesNavigationAvailabilityChange={
            onStoriesNavigationAvailabilityChange
          }
          onRestaurantLogoUpload={onRestaurantLogoUpload}
          onRestaurantLogoRemove={onRestaurantLogoRemove}
        />
      ) : section ? (
        <SectionInspector
          restaurantId={restaurantId}
          section={section}
          tab={tab}
          placementGroups={orderPlacementGroups(page, menus)}
          onChange={(path, value) =>
            onSectionChange(stableSectionKey(section), path, value)
          }
        />
      ) : page ? (
        <PageInspector
          page={page}
          tab={tab}
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
            (error) =>
              !error.pageKey || error.pageKey === stablePageKey(page),
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
  return page.id !== undefined ? String(page.id) : page.tmp_id ?? "";
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
  return section.id !== undefined ? String(section.id) : section.tmp_id ?? "";
}
