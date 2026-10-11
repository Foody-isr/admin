"use client";

import { pageKey } from "@/lib/website-v3/types";
import { websiteOrderChoicesAvailable } from "@/lib/website-v3/fulfillment";
import type { OrderHeaderPresentation, WebsiteHeader } from "@/lib/website-v3/header";
import { useMemo } from "react";
import type {
  CateringService,
  Menu,
  Restaurant,
} from "@/lib/api";
import type {
  DraftPagePayload,
  DraftSectionPayload,
  DraftStatePayload,
  StatePath,
} from "@/lib/website-v3/types";
import { isTechnicalSitePage } from "@/lib/website-v3/state";
import { CateringPageEditor } from "./CateringPageEditor";
import { ChainOrderEntryEditor } from "./ChainOrderEntryEditor";
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
  menus,
  services,
  onOpenOrderJourney,
  onConfigChange,
  onOrderHeaderChange,
  onPageChange,
  onSectionChange,
  onCreateFooter,
  onRestaurantLogoUpload,
  onRestaurantLogoRemove,
}: {
  restaurantId: number;
  restaurant: Restaurant;
  restaurantLogoUrl?: string;
  state: DraftStatePayload;
  selection: RailSelection;
  sectionPanel: SectionPanel;
  menus: Menu[];
  services: CateringService[];
  onOpenOrderJourney?: () => void;
  onConfigChange: (path: StatePath, value: unknown) => void;
  onOrderHeaderChange: (key: string, header: OrderHeaderPresentation | null, shared: WebsiteHeader) => void;
  onPageChange: (key: string, path: StatePath, value: unknown) => void;
  onSectionChange: (key: string, path: StatePath, value: unknown) => void;
  onCreateFooter: () => void;
  onRestaurantLogoUpload: (file: File) => Promise<void>;
  onRestaurantLogoRemove: () => Promise<void>;
}) {
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

  return (
    <div className="min-h-full">
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
      ) : page?.type === "catering" && selection.kind === "page" && selection.region === "catering-content" ? (
        <CateringPageEditor restaurantId={restaurantId} page={page} services={services} onChange={(path, value) => onPageChange(pageKey(page), path, value)} />
      ) : page?.type === "order" && selection.kind === "page" && selection.region === "branch-selector" ? (
        <ChainOrderEntryEditor restaurantId={restaurantId} appearance={page.appearance_overrides} onChange={(path, value) => onPageChange(pageKey(page), path, value)} />
      ) : null}
    </div>
  );
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
