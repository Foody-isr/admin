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
import { SECTION_TYPE_META } from "@/components/website/SectionEditors";
import {
  isWebsiteV3AppliedMessage,
  isWebsiteV3NavigateMessage,
  isWebsiteV3ReadyMessage,
  WEBSITE_V3_STATE,
  type WebsiteV3StateMessage,
} from "@/lib/website-v3/preview-protocol";
import {
  DESKTOP_PREVIEW_WIDTH,
  resolveDesktopPreviewLayout,
} from "@/lib/website-v3/preview-layout";
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
  const source = `${targetOrigin}${restaurantPath}?preview=1`;
  const sections = state.sections
    .filter((section) => belongsToPage(section, activePage))
    .sort((a, b) => a.sort_order - b.sort_order);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== targetOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (isWebsiteV3ReadyMessage(event.data)) {
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
  }, [onAcknowledged, onNavigatePage, restaurantId, targetOrigin]);

  useEffect(() => {
    if (!readyRef.current) return;
    postLatest(frameRef.current?.contentWindow, targetOrigin, restaurantId, latestRef.current);
  }, [
    activePage,
    contentRevision,
    device,
    restaurantId,
    revision,
    state,
    targetOrigin,
  ]);

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
      ref={frameRef}
      src={source}
      title={`Aperçu de ${activePage.title}`}
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
        <div className="ml-auto flex items-center gap-1.5">
          <select
            aria-label="Ajouter une section"
            data-field-id="section.create"
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) return;
              onAddSection(event.target.value);
              event.target.value = "";
            }}
            className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] font-semibold text-slate-200 outline-none"
            disabled={activePage.type === "order" || activePage.type === "catering"}
          >
            <option value="">+ Ajouter une section</option>
            {Object.entries(SECTION_TYPE_META)
              .filter(([type]) => type !== "footer")
              .map(([type]) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
          </select>
        </div>
      </div>

      {sections.length > 0 ? (
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
