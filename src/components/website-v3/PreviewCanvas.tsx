"use client";
import { HEADER_ELEMENTS, type HeaderElement } from "@/lib/website-v3/header";

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
import {
  acceptsInlineEdit,
  isEditorElement,
} from "@/lib/website-v3/editor-elements";
import { pageKey, sectionKey } from "@/lib/website-v3/types";

export function PreviewCanvas({
  webOrigin,
  restaurantSlug,
  restaurantId,
  state,
  activePage,
  activeSectionKey,
  activeField,
  activeRegion,
  orderDialog,
  onSelectRegion,
  onOpenOrderJourney,
  hoveredSectionKey,
  onHoverSection,
  onEditElement,
  onEditRejected,
  onClearSelection,
  previewOnly = false,
  thumbnail = false,
  device,
  surface,
  journeyScreen = "checkout",
  journeyOrderType = "delivery",
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
  activeField?: string;
  activeRegion?: "header" | "footer" | "footer-branding" | "order-banner" | "order-items" | "order-fulfillment";
  orderDialog?: "fulfillment" | "item";
  onOpenOrderJourney?: () => void;
  onSelectRegion?: (region: "header" | "footer" | "footer-branding" | "order-banner" | "order-items" | "order-fulfillment", element?: HeaderElement) => void;
  hoveredSectionKey?: string | null;
  onHoverSection: (key: string | null) => void;
  onEditElement: (key: string, field: string, value: string) => void;
  onClearSelection: () => void;
  onEditRejected?: () => void;
  previewOnly?: boolean;
  thumbnail?: boolean;
  device: PreviewDevice;
  /** Owned by the builder so the inspector can scope its fields to the surface
   *  on screen. Already clamped: only order pages ever receive "checkout". */
  surface: InspectorSurface;
  journeyScreen?: "cart" | "checkout" | "confirmation";
  journeyOrderType?: "delivery" | "pickup";
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
  onSelectSection: (sectionKey: string, field?: string) => void;
  onNavigatePage: (pageKey: string) => void;
  onAddSection: (type: string) => void;
  onMoveSection: (sectionKey: string, direction: -1 | 1) => void;
  onToggleSection: (sectionKey: string) => void;
  onDeleteSection: (sectionKey: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const editorModeRef = useRef({
    previewOnly,
    activeSectionKey,
    activeField,
    activeRegion,
    orderDialog,
    hoveredSectionKey,
  });
  editorModeRef.current = {
    previewOnly,
    activeSectionKey,
    activeField,
    activeRegion,
    orderDialog,
    hoveredSectionKey,
  };
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
          field: editorModeRef.current.activeField ?? null,
          region: editorModeRef.current.activeRegion ?? null,
          orderDialog: editorModeRef.current.orderDialog ?? null,
          hoveredSectionKey: editorModeRef.current.hoveredSectionKey ?? null,
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
      ? `${targetOrigin}/order/${journeyScreen === "confirmation" ? "confirmation/preview" : journeyScreen}?restaurantId=${encodeURIComponent(
          restaurantSlug || String(restaurantId),
        )}&orderType=${journeyOrderType}&preview=1&pageSlug=${encodeURIComponent(activePage.slug)}`
      : surface === "branches"
        ? `${targetOrigin}${restaurantPath}/order?preview=1`
        : `${targetOrigin}${restaurantPath}?preview=1`;
  useEffect(() => {
    if (readyRef.current) postEditorMode();
    // The mode is separate from the persisted draft and never invalidates autosave.
  }, [
    previewOnly,
    activeSectionKey,
    activeField,
    activeRegion,
    orderDialog,
    hoveredSectionKey,
    postEditorMode,
  ]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== targetOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!previewOnly && event.data?.type === "foody.website-v3.open-order-journey") {
        if (latestRef.current.activePage.type === "order" && event.data.activePageKey === pageKey(latestRef.current.activePage)) onOpenOrderJourney?.();
        return;
      }
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
        event.data?.type === "foody.website-v3.select-region"
      ) {
        if (event.data.activePageKey !== pageKey(latestRef.current.activePage))
          return;
        if (event.data.region === "header" || event.data.region === "footer" || event.data.region === "footer-branding" ||
          (latestRef.current.activePage.type === "order" && ["order-banner", "order-items", "order-fulfillment"].includes(event.data.region)))
          onSelectRegion?.(event.data.region, event.data.region === "header" && HEADER_ELEMENTS.includes(event.data.element) ? event.data.element : undefined);
        return;
      }
      if (
        !previewOnly &&
        [
          "foody.website-v3.select-section",
          "foody.website-v3.hover-section",
          "foody.website-v3.edit-element",
        ].includes(event.data?.type)
      ) {
        const latest = latestRef.current;
        if (event.data.activePageKey !== pageKey(latest.activePage)) return;
        const id = event.data.sectionKey;
        if (id === null) {
          if (event.data.type === "foody.website-v3.hover-section")
            onHoverSection(null);
          else if (event.data.type === "foody.website-v3.select-section")
            onClearSelection();
          return;
        }
        const section = latest.state.sections.find(
          (candidate) =>
            sectionKey(candidate) === id &&
            (candidate.page_id !== undefined
              ? candidate.page_id === latest.activePage.id
              : candidate.page_tmp_id
                ? candidate.page_tmp_id === latest.activePage.tmp_id
                : candidate.page === latest.activePage.slug),
        );
        if (!section) {
          if (
            event.data.type === "foody.website-v3.hover-section" &&
            (id === "site:header" || id === "site:footer" || id === "site:footer-branding" ||
              (latest.activePage.type === "order" && ["site:order-banner", "site:order-items", "site:order-fulfillment"].includes(id)))
          )
            onHoverSection(id);
          return;
        }
        if (event.data.type === "foody.website-v3.hover-section")
          onHoverSection(id);
        else if (event.data.type === "foody.website-v3.edit-element") {
          if (acceptsInlineEdit(section, event.data))
            onEditElement(id, event.data.field, event.data.value);
          else if (isEditorElement(section.section_type, event.data.field))
            onEditRejected?.();
        } else
          onSelectSection(
            id,
            isEditorElement(section.section_type, event.data.field)
              ? event.data.field
              : undefined,
          );
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
    onSelectRegion,
    onOpenOrderJourney,
    onHoverSection,
    onEditElement,
    onEditRejected,
    onClearSelection,
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
      loading={thumbnail ? "lazy" : "eager"}
      tabIndex={thumbnail ? -1 : undefined}
      title={
        surface === "checkout"
          ? journeyScreen === "cart" ? "Aperçu du panier" : journeyScreen === "confirmation" ? "Aperçu de la confirmation" : "Aperçu du checkout"
          : surface === "branches"
            ? "Aperçu du choix de succursale"
            : `Aperçu de ${activePage.title}`
      }
      className="h-full w-full bg-white"
    />
  );

  if (thumbnail) return previewIframe;

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
      siteConfig: latest.state.config,
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

/** Re-export retained for the canvas consumers; insertion is owned by the Square catalogue. */
export { squareComponentGroups as componentGroupsForPage } from "@/lib/website-v3/square-components";
