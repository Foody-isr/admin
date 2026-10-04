"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
  previewOnly = false,
  device,
  surface,
  revision,
  contentRevision,
  onAcknowledged,
  onSelectSection,
  onNavigatePage,
}: {
  webOrigin: string;
  restaurantSlug: string;
  restaurantId: number;
  state: DraftStatePayload;
  activePage: DraftPagePayload;
  activeSectionKey?: string;
  previewOnly?: boolean;
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
  const editorModeRef = useRef({ previewOnly, activeSectionKey });
  editorModeRef.current = { previewOnly, activeSectionKey };
  const readyRef = useRef(false);
  const protocolRef = useRef<"v3" | "legacy" | null>(null);
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
  const postEditorMode = useCallback(
    () =>
      frameRef.current?.contentWindow?.postMessage(
        {
          type: "foody.website-v3.editor-mode",
          previewOnly: editorModeRef.current.previewOnly,
          sectionKey: editorModeRef.current.activeSectionKey ?? null,
        },
        targetOrigin,
      ),
    [targetOrigin],
  );
  const restaurantPath = `/r/${encodeURIComponent(
    restaurantSlug || String(restaurantId),
  )}`;
  const source =
    surface === "checkout"
      ? `${targetOrigin}/order/checkout?restaurantId=${encodeURIComponent(
          restaurantSlug || String(restaurantId),
        )}&orderType=delivery&preview=1&pageSlug=${encodeURIComponent(activePage.slug)}`
      : surface === "branches"
        ? `${targetOrigin}${restaurantPath}/order?preview=1`
        : `${targetOrigin}${restaurantPath}?preview=1`;
  useEffect(() => {
    if (readyRef.current) postEditorMode();
    // The mode is separate from the persisted draft and never invalidates autosave.
  }, [previewOnly, activeSectionKey, postEditorMode]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== targetOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "foody-checkout-preview-ready") {
        readyRef.current = true;
        postCheckoutLatest(
          frameRef.current?.contentWindow,
          targetOrigin,
          latestRef.current,
        );
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
        if (
          canAcknowledgeLegacyWebsitePreview(latest.activePage.type, surface)
        ) {
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
        postLatest(
          frameRef.current?.contentWindow,
          targetOrigin,
          restaurantId,
          latestRef.current,
        );
        return;
      }
      if (
        !previewOnly &&
        event.data?.type === "foody.website-v3.select-section"
      ) {
        const id = String(event.data.sectionKey ?? "");
        const section = latestRef.current.state.sections.find(
          (candidate) => sectionKey(candidate) === id,
        );
        if (section) onSelectSection(id);
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
        postEditorMode();
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
  }, [
    postEditorMode,
    onAcknowledged,
    onNavigatePage,
    onSelectSection,
    previewOnly,
    restaurantId,
    surface,
    targetOrigin,
  ]);

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
      postCheckoutLatest(
        frameRef.current?.contentWindow,
        targetOrigin,
        latestRef.current,
      );
    } else {
      postLatest(
        frameRef.current?.contentWindow,
        targetOrigin,
        restaurantId,
        latestRef.current,
      );
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

  const previewIframe = (
    <iframe
      key={source}
      ref={frameRef}
      src={source}
      title={
        surface === "checkout"
          ? "Aperçu du checkout"
          : surface === "branches"
            ? "Aperçu du choix de succursale"
            : `Aperçu de ${activePage.title}`
      }
      className="h-full w-full bg-white"
    />
  );

  return (
    <div
      className={`sqe-frame ${device === "mobile" ? "sqe-frame--mobile" : ""}`}
    >
      <div className="sqe-address">{restaurantSlug || activePage.title}</div>
      <div className="sqe-frame-viewport">{previewIframe}</div>
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
  target.postMessage(
    {
      type: "foody-checkout-preview",
      checkoutConfig: latest.state.config.checkout_config ?? null,
      appearanceOverrides: latest.activePage.appearance_overrides,
      revision: latest.revision,
      contentRevision: latest.contentRevision,
      activePageKey: pageKey(latest.activePage),
      device: latest.device,
    },
    targetOrigin,
  );
}

function postLegacyLatest(
  target: Window | null | undefined,
  targetOrigin: string,
  state: DraftStatePayload,
) {
  if (!target) return;
  target.postMessage(legacyWebsiteStateMessage(state), targetOrigin);
}

type ComponentDefinition = {
  type: string;
  label: string;
  description: string;
  pageTypes?: readonly DraftPagePayload["type"][];
  singleInstance?: boolean;
};

type ComponentGroup = {
  label: string;
  items: readonly ComponentDefinition[];
};

/** Filters the component library by page capability and one-per-page rules. */
export function componentGroupsForPage(
  pageType: DraftPagePayload["type"],
  sections: DraftSectionPayload[],
): ComponentGroup[] {
  const existingTypes = new Set(
    sections.map((section) => section.section_type),
  );
  const isEditorialPage = pageType === "landing" || pageType === "content";
  return COMPONENT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (item.pageTypes
          ? item.pageTypes.includes(pageType)
          : isEditorialPage) &&
        (!item.singleInstance || !existingTypes.has(item.type)),
    ),
  })).filter((group) => group.items.length > 0);
}

const COMPONENT_GROUPS: readonly ComponentGroup[] = [
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
        type: "footer",
        label: "Pied de page",
        description: "Coordonnées, horaires et liens du restaurant.",
        singleInstance: true,
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
        type: "order_discovery",
        label: "Découverte & publicité",
        description: "Présente vos autres services directement dans le menu.",
        pageTypes: ["order"],
        singleInstance: true,
      },
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
