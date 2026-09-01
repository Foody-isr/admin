"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import {
  canAcknowledgeLegacyWebsitePreview,
  isLegacyWebsiteReadyMessage,
  isWebsiteV3AppliedMessage,
  isWebsiteV3NavigateMessage,
  isWebsiteV3ReadyMessage,
  legacyWebsiteStateMessage,
  WEBSITE_V3_STATE,
  type WebsiteV3StateMessage,
} from "@/lib/website-v3/preview-protocol";
import {
  DESKTOP_PREVIEW_WIDTH,
  resolveDesktopPreviewLayout,
} from "@/lib/website-v3/preview-layout";
import type { InspectorSurface } from "@/lib/website-v3/inspector-scope";
import type {
  DraftPagePayload,
  DraftSectionPayload,
  DraftStatePayload,
  PreviewDevice,
} from "@/lib/website-v3/types";
import { pageKey, sectionKey } from "@/lib/website-v3/types";

export function PreviewCanvas({
  webOrigin,
  restaurantSlug,
  restaurantId,
  state,
  activePage,
  activeSectionKey,
  device,
  surface,
  showBranchSelector = false,
  onSurfaceChange,
  revision,
  contentRevision,
  onAcknowledged,
  onSelectSection,
  onNavigatePage,
  onAddSection,
  onMoveSection,
  onToggleSection,
  onDeleteSection,
}: {
  webOrigin: string;
  restaurantSlug: string;
  restaurantId: number;
  state: DraftStatePayload;
  activePage: DraftPagePayload;
  activeSectionKey?: string;
  device: PreviewDevice;
  /** Owned by the builder so the inspector can scope its fields to the surface
   *  on screen. Already clamped: only order pages ever receive "checkout". */
  surface: InspectorSurface;
  showBranchSelector?: boolean;
  onSurfaceChange: (surface: InspectorSurface) => void;
  revision: number;
  contentRevision: number;
  onAcknowledged: (acknowledgement: {
    revision: number;
    contentRevision: number;
    activePageKey: string;
    device: PreviewDevice;
  }) => void;
  onSelectSection: (sectionKey: string) => void;
  onNavigatePage: (pageKey: string) => void;
  onAddSection: (type: string) => void;
  onMoveSection: (sectionKey: string, direction: -1 | 1) => void;
  onToggleSection: (sectionKey: string) => void;
  onDeleteSection: (sectionKey: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const desktopPreviewContainerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const protocolRef = useRef<"v3" | "legacy" | null>(null);
  const [desktopLayout, setDesktopLayout] = useState(() =>
    resolveDesktopPreviewLayout(DESKTOP_PREVIEW_WIDTH, 820),
  );
  const latestRef = useRef({
    state,
    activePage,
    device,
    revision,
    contentRevision,
  });
  latestRef.current = {
    state,
    activePage,
    device,
    revision,
    contentRevision,
  };
  const targetOrigin = useMemo(() => new URL(webOrigin).origin, [webOrigin]);
  const restaurantPath = `/r/${encodeURIComponent(
    restaurantSlug || String(restaurantId),
  )}`;
  const source = surface === "checkout"
    ? `${targetOrigin}/order/checkout?restaurantId=${encodeURIComponent(
        restaurantSlug || String(restaurantId),
      )}&orderType=delivery&preview=1&pageSlug=${encodeURIComponent(activePage.slug)}`
    : surface === "branches"
      ? `${targetOrigin}${restaurantPath}/order?preview=1`
      : `${targetOrigin}${restaurantPath}?preview=1`;
  const sections = state.sections
    .filter((section) => belongsToPage(section, activePage))
    .sort((a, b) => a.sort_order - b.sort_order);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== targetOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "foody-checkout-preview-ready") {
        readyRef.current = true;
        postCheckoutLatest(frameRef.current?.contentWindow, targetOrigin, latestRef.current);
        return;
      }
      if (event.data?.type === "foody-checkout-preview-applied") {
        onAcknowledged({
          revision: event.data.revision,
          contentRevision: event.data.contentRevision,
          activePageKey: event.data.activePageKey,
          device: event.data.device,
        });
        return;
      }
      if (isLegacyWebsiteReadyMessage(event.data)) {
        const latest = latestRef.current;
        if (protocolRef.current === "v3") return;
        protocolRef.current = "legacy";
        readyRef.current = true;
        postLegacyLatest(
          frameRef.current?.contentWindow,
          targetOrigin,
          latest.state,
        );
        if (canAcknowledgeLegacyWebsitePreview(latest.activePage.type, surface)) {
          onAcknowledged({
            revision: latest.revision,
            contentRevision: latest.contentRevision,
            activePageKey: pageKey(latest.activePage),
            device: latest.device,
          });
        }
        return;
      }
      if (isWebsiteV3ReadyMessage(event.data)) {
        protocolRef.current = "v3";
        readyRef.current = true;
        postLatest(frameRef.current?.contentWindow, targetOrigin, restaurantId, latestRef.current);
        return;
      }
      if (isWebsiteV3NavigateMessage(event.data)) {
        onNavigatePage(event.data.pageKey);
        return;
      }
      if (
        isWebsiteV3AppliedMessage(event.data) &&
        event.data.activePageKey === pageKey(latestRef.current.activePage)
      ) {
        onAcknowledged({
          revision: event.data.revision,
          contentRevision: event.data.contentRevision,
          activePageKey: event.data.activePageKey,
          device: event.data.device,
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAcknowledged, onNavigatePage, restaurantId, surface, targetOrigin]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (protocolRef.current === "legacy") {
      postLegacyLatest(frameRef.current?.contentWindow, targetOrigin, state);
      if (canAcknowledgeLegacyWebsitePreview(activePage.type, surface)) {
        onAcknowledged({
          revision,
          contentRevision,
          activePageKey: pageKey(activePage),
          device,
        });
      }
    } else if (surface === "checkout") {
      postCheckoutLatest(frameRef.current?.contentWindow, targetOrigin, latestRef.current);
    } else {
      postLatest(frameRef.current?.contentWindow, targetOrigin, restaurantId, latestRef.current);
    }
  }, [
    activePage,
    contentRevision,
    device,
    restaurantId,
    revision,
    state,
    targetOrigin,
    surface,
    onAcknowledged,
  ]);

  // Stays local: readyRef tracks THIS iframe's handshake, and `source` already
  // derives from `surface`, so a surface change always invalidates it.
  useEffect(() => {
    readyRef.current = false;
    protocolRef.current = null;
  }, [surface, source]);

  useEffect(() => {
    if (device === "mobile") return;

    const container = desktopPreviewContainerRef.current;
    if (!container) return;

    const updateLayout = (width: number, height: number) => {
      setDesktopLayout(resolveDesktopPreviewLayout(width, height));
    };
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      updateLayout(entry.contentRect.width, entry.contentRect.height);
    });

    const { width, height } = container.getBoundingClientRect();
    updateLayout(width, height);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [device]);

  const previewIframe = (
    <iframe
      key={source}
      ref={frameRef}
      src={source}
      title={surface === "checkout" ? "Aperçu du checkout" : surface === "branches" ? "Aperçu du choix de succursale" : `Aperçu de ${activePage.title}`}
      className="h-full w-full bg-white"
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-[#1b2028] px-4 text-white">
        <p className="truncate text-xs font-semibold">{activePage.title}</p>
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {activePage.type}
        </span>
        {activePage.type === "order" ? (
          <div className="ml-2 flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            {([
              ...(showBranchSelector ? (["branches"] as const) : []),
              "page",
              "checkout",
            ] as InspectorSurface[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onSurfaceChange(option)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                  surface === option
                    ? "bg-white text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {option === "branches"
                  ? "Succursales"
                  : option === "page"
                    ? "Page"
                    : "Checkout"}
              </button>
            ))}
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {surface === "page" && (activePage.type === "landing" || activePage.type === "content") ? (
            <details className="group relative">
              <summary
                data-field-id="section.create"
                className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-semibold text-slate-100 hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter un composant
              </summary>
              <div className="absolute right-0 top-10 z-30 w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold">Bibliothèque de composants</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Le composant est ajouté en bas de la page et sélectionné.
                  </p>
                </div>
                <div className="max-h-[430px] space-y-4 overflow-y-auto p-3">
                  {COMPONENT_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        {group.label}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.items.map((item) => (
                          <button
                            key={item.type}
                            type="button"
                            aria-label={item.label}
                            onClick={(event) => {
                              onAddSection(item.type);
                              event.currentTarget.closest("details")?.removeAttribute("open");
                            }}
                            className="rounded-xl border border-slate-200 p-2.5 text-left transition hover:border-[#315fce] hover:bg-[#315fce]/5"
                          >
                            <span className="block text-xs font-semibold text-slate-800">
                              {item.label}
                            </span>
                            <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                              {item.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ) : (
            <span className="text-[10px] text-slate-500">
              Mise en page gérée dans Apparence
            </span>
          )}
        </div>
      </div>

      {surface === "page" && sections.length > 0 ? (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/10 bg-[#1f252e] px-3 py-2">
          {sections.map((section, index) => {
            const key = sectionKey(section);
            const active = activeSectionKey === key;
            return (
              <div
                key={key}
                className={`flex shrink-0 items-center rounded-lg border ${
                  active
                    ? "border-[#9bb3ef] bg-[#315fce]/20"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSection(key)}
                  className="px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
                >
                  {humanize(section.section_type)}
                </button>
                {active ? (
                  <span className="flex border-l border-white/10 px-1">
                    <SectionAction
                      label="Monter"
                      fieldId="section.sort_order"
                      disabled={index === 0}
                      onClick={() => onMoveSection(key, -1)}
                    >
                      <ChevronUp />
                    </SectionAction>
                    <SectionAction
                      label="Descendre"
                      fieldId="section.sort_order"
                      disabled={index === sections.length - 1}
                      onClick={() => onMoveSection(key, 1)}
                    >
                      <ChevronDown />
                    </SectionAction>
                    <SectionAction
                      label={section.is_visible ? "Masquer" : "Afficher"}
                      fieldId="section.is_visible"
                      onClick={() => onToggleSection(key)}
                    >
                      {section.is_visible ? <Eye /> : <EyeOff />}
                    </SectionAction>
                    <SectionAction
                      label="Supprimer"
                      fieldId="section.delete"
                      onClick={() => onDeleteSection(key)}
                    >
                      <Trash2 />
                    </SectionAction>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-5">
        {device === "mobile" ? (
          <div className="relative h-full min-h-[560px] w-[390px] max-h-[820px] overflow-hidden rounded-[30px] border-[8px] border-[#0e1116] bg-white shadow-[0_26px_80px_rgba(0,0,0,0.32)] transition-[width,border-radius] duration-300">
            {previewIframe}
          </div>
        ) : (
          <div
            ref={desktopPreviewContainerRef}
            className="relative h-full min-h-[560px] w-full overflow-hidden rounded-xl border border-white/10 bg-white shadow-[0_26px_80px_rgba(0,0,0,0.32)]"
          >
            <div
              style={{
                width: DESKTOP_PREVIEW_WIDTH,
                height: desktopLayout.logicalHeight,
                transform: `scale(${desktopLayout.scale})`,
                transformOrigin: "top left",
              }}
            >
              {previewIframe}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function postLatest(
  target: Window | null | undefined,
  targetOrigin: string,
  restaurantId: number,
  latest: {
    state: DraftStatePayload;
    activePage: DraftPagePayload;
    device: PreviewDevice;
    revision: number;
    contentRevision: number;
  },
) {
  if (!target) return;
  const message: WebsiteV3StateMessage = {
    type: WEBSITE_V3_STATE,
    revision: latest.revision,
    contentRevision: latest.contentRevision,
    restaurantId,
    activePageKey: pageKey(latest.activePage),
    device: latest.device,
    state: latest.state,
  };
  target.postMessage(message, targetOrigin);
}

function postCheckoutLatest(
  target: Window | null | undefined,
  targetOrigin: string,
  latest: {
    state: DraftStatePayload;
    activePage: DraftPagePayload;
    device: PreviewDevice;
    revision: number;
    contentRevision: number;
  },
) {
  if (!target) return;
  target.postMessage({
    type: "foody-checkout-preview",
    checkoutConfig: latest.state.config.checkout_config ?? null,
    appearanceOverrides: latest.activePage.appearance_overrides,
    revision: latest.revision,
    contentRevision: latest.contentRevision,
    activePageKey: pageKey(latest.activePage),
    device: latest.device,
  }, targetOrigin);
}

function postLegacyLatest(
  target: Window | null | undefined,
  targetOrigin: string,
  state: DraftStatePayload,
) {
  if (!target) return;
  target.postMessage(legacyWebsiteStateMessage(state), targetOrigin);
}

function belongsToPage(
  section: DraftSectionPayload,
  page: DraftPagePayload,
): boolean {
  if (section.page_id !== undefined || section.page_tmp_id !== undefined) {
    return (
      (page.id !== undefined && section.page_id === page.id) ||
      (!!page.tmp_id && section.page_tmp_id === page.tmp_id)
    );
  }
  return section.page === page.slug;
}

function SectionAction({
  label,
  fieldId,
  disabled,
  onClick,
  children,
}: {
  label: string;
  fieldId: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactElement;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-field-id={fieldId}
      onClick={onClick}
      className="flex h-7 w-6 items-center justify-center text-slate-400 hover:text-white disabled:opacity-25 [&_svg]:h-3 [&_svg]:w-3"
    >
      {children}
    </button>
  );
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

const COMPONENT_GROUPS = [
  {
    label: "Mise en page",
    items: [
      {
        type: "hero_banner",
        label: "Hero banner",
        description: "Grand visuel, titre et bouton principal.",
      },
      {
        type: "text_and_image",
        label: "Texte + image",
        description: "Présente une histoire, un lieu ou un service.",
      },
      {
        type: "feature_cards",
        label: "Cartes visuelles",
        description: "Liens illustrés vers les pages importantes.",
      },
      {
        type: "about",
        label: "À propos",
        description: "Plusieurs blocs éditoriaux avec images.",
      },
    ],
  },
  {
    label: "Médias",
    items: [
      {
        type: "gallery",
        label: "Galerie",
        description: "Grille de photos réordonnables.",
      },
      {
        type: "menu_highlights",
        label: "Produits populaires",
        description: "Met en avant une sélection de produits.",
      },
      {
        type: "picnic_basket",
        label: "Panier animé",
        description: "Composition visuelle et produits flottants.",
      },
      {
        type: "social_feed",
        label: "Réseaux sociaux",
        description: "Liens vers Instagram, Facebook et TikTok.",
      },
    ],
  },
  {
    label: "Conversion",
    items: [
      {
        type: "promo_banner",
        label: "Bannière promotionnelle",
        description: "Annonce une offre ou un événement.",
      },
      {
        type: "action_buttons",
        label: "Boutons d’action",
        description: "Commande, traiteur, lien externe ou ancre.",
      },
      {
        type: "testimonials",
        label: "Avis clients",
        description: "Affiche plusieurs témoignages et notes.",
      },
      {
        type: "scrolling_text",
        label: "Texte défilant",
        description: "Message animé pour une information courte.",
      },
    ],
  },
] as const;
