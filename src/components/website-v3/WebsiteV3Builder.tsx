"use client";
import { OrderJourneyEditor, type OrderJourneyScreen } from "./OrderJourneyEditor";
import type { CheckoutConfig } from "@/lib/api";

import {
  retargetNavigationPage,
  addNavigationPage,
  removeNavigationPage,
} from "@/lib/website-v3/navigation-links";
import { headerFromLegacy, resolvePageHeader } from "@/lib/website-v3/header";
import { resolveSelectedPage } from "@/lib/website-v3/editor-selection";
import { addSiteFooter } from "@/lib/website-v3/footer";
import { websiteOrderChoicesAvailable } from "@/lib/website-v3/fulfillment";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  discardWebsiteDraft,
  getPublicRestaurantNavigationState,
  getChainBranches,
  getRestaurant,
  getThemeCatalog,
  getWebsiteDraft,
  getWebsitePages,
  listMenus,
  publishWebsiteDraft,
  saveWebsiteDraft,
  uploadRestaurantLogo,
  type CateringService,
  type Menu,
  type Restaurant,
  type ThemeCatalog,
  type ChainOverview,
} from "@/lib/api";
import {
  squareDefaultContent as getDefaultContent,
  squareDefaultSettings as getDefaultSettings,
} from "@/lib/website-v3/square-components";
import {
  createSerializedAutosave,
  AutosaveSuspendedError,
  type AutosaveStatus,
} from "@/lib/website-v3/autosave";
import {
  recordPreviewAcknowledgement,
  stalePreviewDevices,
  type PreviewAcknowledgement,
  type PreviewAcknowledgements,
  type PreviewExpectedRevisions,
} from "@/lib/website-v3/preview-state";
import { withWebsiteV3PreviewNavigationState } from "@/lib/website-v3/preview-protocol";
import { loadOptionalCateringServices } from "@/lib/website-v3/catering-catalog";
import {
  canDeletePage,
  duplicatePage,
  makeDefaultPage,
  makeHomepagePage,
  mapWebsiteDraftError,
  movePage,
  normalizeDraftResponse,
  reconcileLegacyWebsiteDraft,
  removePage,
  updateDraftAtPath,
  updateWebsitePageAtPath,
  validateDraftForPublish,
} from "@/lib/website-v3/state";
import { publicURLForPage } from "@/lib/website-v3/url-model";
import { effectiveSurface } from "@/lib/website-v3/inspector-scope";
import type { InspectorSurface } from "@/lib/website-v3/inspector-scope";
import type {
  DraftPagePayload,
  DraftResponse,
  DraftSectionPayload,
  DraftStatePayload,
  FieldError,
  PreviewDevice,
  StatePath,
} from "@/lib/website-v3/types";
import { pageKey, sectionKey } from "@/lib/website-v3/types";
import {
  sectionsForPage,
  canDeleteSection,
  sectionBelongs,
  insertSection,
  duplicateSection,
  reorderSection,
} from "@/lib/website-v3/section-operations";
import type { PageTemplate } from "./PageLibrary";
import { normalizeSlug } from "@/lib/website-v3/state";
import { PageSettingsDialog } from "./PageSettingsDialog";
import { OrderPageEditor } from "./OrderPageEditor";
import { EditorSidebar } from "./EditorSidebar";
import { SiteColorContext } from "./ColorStylePicker";
import { SiteDesign } from "./SiteDesign";
import {
  recordDraftEdit,
  travelDraftHistory,
  type DraftHistory,
} from "@/lib/website-v3/history";
import { BuilderShell } from "./BuilderShell";
import { Inspector } from "./Inspector";
import type { SectionPanel } from "./SectionInspector";
import { MobileUnavailable } from "./MobileUnavailable";
import { PageDialog } from "./PageDialog";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { type RailSelection } from "@/lib/website-v3/editor-selection";
import { PreviewCanvas } from "./PreviewCanvas";
import { BranchWebsitePresence } from "./BranchWebsitePresence";
import { websiteManagementMode } from "@/lib/website-v3/chain-mode";
import { resolveWebsiteV3PreviewOrigin } from "@/lib/website-v3/preview-origin";
import {
  prepareWebsiteV3StateForPublication,
  requireWebsiteV3RuntimeCapabilities,
} from "@/lib/website-v3/runtime-capabilities";
import { useI18n } from "@/lib/i18n";

const EMPTY_CATALOG: ThemeCatalog = { themes: [], typography_pairings: [] };

const PREVIEW_DEVICE_LABELS: Record<PreviewDevice, string> = {
  desktop: "l’aperçu ordinateur",
  mobile: "l’aperçu mobile",
};

/** "l’aperçu mobile" / "l’aperçu ordinateur et l’aperçu mobile". */
function describePreviewDevices(devices: PreviewDevice[]): string {
  return devices.map((device) => PREVIEW_DEVICE_LABELS[device]).join(" et ");
}

type LoadedBuilder = {
  draft: DraftResponse;
  restaurant: Restaurant;
  menus: Menu[];
  services: CateringService[];
  catalog: ThemeCatalog;
  catalogWarning: string | null;
};

export function WebsiteV3Builder({ restaurantId }: { restaurantId: number }) {
  const { t } = useI18n();
  const [chainOverview, setChainOverview] = useState<
    ChainOverview | null | undefined
  >(undefined);
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getChainBranches(restaurantId)
      .then((overview) => {
        if (active) setChainOverview(overview);
      })
      .catch(() => {
        if (active) setChainOverview(null);
      });
    return () => {
      active = false;
    };
  }, [restaurantId]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWideEnough(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (chainOverview === undefined) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-[var(--surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (chainOverview === null) {
    return (
      <div className="grid min-h-[70vh] place-items-center bg-[var(--surface-2)] p-6">
        <div className="max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-sm">
          <p className="font-semibold text-fg-primary">
            {t("branch_presence_context_error")}
          </p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => window.location.reload()}
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  if (websiteManagementMode(restaurantId, chainOverview).kind === "local") {
    return (
      <BranchWebsitePresence
        restaurantId={restaurantId}
        overview={chainOverview}
      />
    );
  }

  if (wideEnough !== true) {
    return <MobileUnavailable restaurantId={restaurantId} />;
  }
  return (
    <DesktopWebsiteV3Builder
      restaurantId={restaurantId}
      chainOverview={chainOverview}
    />
  );
}

function DesktopWebsiteV3Builder({
  restaurantId,
  chainOverview,
}: {
  restaurantId: number;
  chainOverview: ChainOverview;
}) {
  const { t } = useI18n();
  const webOrigin = resolveWebsiteV3PreviewOrigin(
    process.env.NEXT_PUBLIC_WEB_URL,
    typeof window === "undefined" ? undefined : window.location.origin,
  );
  const showBranchSelector =
    chainOverview.chain_id !== null &&
    chainOverview.primary_restaurant_id === restaurantId &&
    chainOverview.branches.length > 1;
  const historyRef = useRef<DraftHistory>({ past: [], future: [] });
  const [previewOnly, setPreviewOnly] = useState(false);
  const [hoveredSectionKey, setHoveredSectionKey] = useState<string | null>(
    null,
  );
  const [pageCandidate, setPageCandidate] = useState<{
    page: DraftPagePayload;
    sections: DraftSectionPayload[];
  } | null>(null);
  const [sectionCandidate, setSectionCandidate] =
    useState<DraftSectionPayload | null>(null);
  const [themePreview, setThemePreview] = useState<DraftStatePayload | null>(
    null,
  );
  const [themePreviewPageKey, setThemePreviewPageKey] = useState<string | null>(null);
  const [previewOrderItem, setPreviewOrderItem] = useState(false);
  const [loaded, setLoaded] = useState<LoadedBuilder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selection, setSelection] = useState<RailSelection>({ kind: "site" });
  const [sectionPanel, setSectionPanel] = useState<SectionPanel>("content");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [journeyScreen, setJourneyScreen] = useState<OrderJourneyScreen>("cart");
  const [journeyOrderType, setJourneyOrderType] = useState<"delivery" | "pickup">("delivery");
  /** Which surface of the active page the preview shows. Only order pages have
   *  a checkout, so this is a *request* — `effectiveSurface` clamps it. Owned
   *  here rather than in PreviewCanvas so the inspector can show the settings
   *  that belong to the surface on screen. */
  const [requestedSurface, setRequestedSurface] =
    useState<InspectorSurface>("page");
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>("idle");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDeleteSection, setPendingDeleteSection] = useState<string | null>(null);
  const [settingsPageKey, setSettingsPageKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);
  const [acknowledgements, setAcknowledgements] =
    useState<PreviewAcknowledgements>({
      desktop: null,
      mobile: null,
    });
  const [expectedPreviewRevisions, setExpectedPreviewRevisions] =
    useState<PreviewExpectedRevisions>({
      desktop: 0,
      mobile: null,
    });
  const [previewStale, setPreviewStale] = useState(false);
  const [discardAwaitRevision, setDiscardAwaitRevision] = useState<
    number | null
  >(null);
  const [storiesNavigationAvailable, setStoriesNavigationAvailable] = useState<
    boolean | undefined
  >(undefined);

  const previewRevisionRef = useRef(0);
  const contentRevisionRef = useRef(0);
  const editRevisionRef = useRef(0);
  const lifecycleRef = useRef(0);
  const busyRef = useRef(false);
  const deviceRef = useRef<PreviewDevice>("desktop");
  const slugManualRef = useRef(new Set<string>());
  const storiesNavigationAvailableRef = useRef<boolean | undefined>(undefined);

  const autosave = useMemo(
    () =>
      createSerializedAutosave(async (state) =>
        normalizeDraftResponse(await saveWebsiteDraft(restaurantId, state)),
      ),
    [restaurantId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      requireWebsiteV3RuntimeCapabilities(webOrigin),
      getWebsiteDraft(restaurantId),
      getWebsitePages(restaurantId),
      getRestaurant(restaurantId),
      listMenus(restaurantId),
      loadOptionalCateringServices(restaurantId),
      getPublicRestaurantNavigationState(restaurantId),
      getThemeCatalog()
        .then((catalog) => ({ catalog, warning: null as string | null }))
        .catch(() => ({
          catalog: EMPTY_CATALOG,
          warning:
            "Le catalogue visuel n’est pas disponible. Les réglages existants restent modifiables.",
        })),
    ])
      .then(
        ([
          _runtimeCapabilities,
          draft,
          publishedPages,
          restaurant,
          menus,
          services,
          navigation,
          themeResult,
        ]) => {
          if (!active) return;
          const normalized = normalizeDraftResponse(draft);
          const reconciled = reconcileLegacyWebsiteDraft(
            normalized.state,
            {
              menuIds: menus
                .filter((menu) => menu.web_enabled)
                .map((menu) => menu.id),
              serviceIds: services
                .filter((service) => service.is_active)
                .map((service) => service.id),
            },
            publishedPages,
          );
          const editorDraft = {
            ...normalized,
            state: reconciled.state,
            draft_dirty: normalized.draft_dirty || reconciled.changed,
          };
          if (editorDraft.state.pages.length === 0) {
            throw new Error(
              "Aucune page n’est disponible. Publiez d’abord une configuration initiale.",
            );
          }
          storiesNavigationAvailableRef.current =
            navigation.storiesNavigationAvailable;
          setStoriesNavigationAvailable(navigation.storiesNavigationAvailable);
          setLoaded({
            draft: editorDraft,
            restaurant,
            menus,
            services,
            catalog: themeResult.catalog,
            catalogWarning: themeResult.warning,
          });
          const firstPage =
            editorDraft.state.pages.find((page) => page.is_homepage) ??
            [...editorDraft.state.pages].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0];
          setSelection({ kind: "page", key: pageKey(firstPage) });
          setSaveStatus(editorDraft.draft_dirty ? "saved" : "idle");
          if (reconciled.changed) {
            setSaveStatus("saving");
            void autosave
              .enqueue(reconciled.state)
              .then((response) => {
                if (!active || editRevisionRef.current !== 0) return;
                const saved = normalizeDraftResponse(response);
                setLoaded((current) =>
                  current ? { ...current, draft: saved } : current,
                );
                setSaveStatus("saved");
              })
              .catch((error: unknown) => {
                if (!active) return;
                setSaveStatus("error");
                setGlobalError(
                  `${readError(error)} Vos modifications restent dans cet écran.`,
                );
              });
          }
        },
      )
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(readError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [autosave, restaurantId, retryToken, webOrigin]);

  const state = loaded?.draft.state ?? null;
  const availableReferences = useMemo(
    () => ({
      menuIds: new Set(
        (loaded?.menus ?? [])
          .filter((menu) => menu.web_enabled)
          .map((menu) => menu.id),
      ),
      serviceIds: new Set(
        (loaded?.services ?? [])
          .filter((service) => service.is_active)
          .map((service) => service.id),
      ),
    }),
    [loaded?.menus, loaded?.services],
  );
  const validationErrors = useMemo(
    () => (state ? validateDraftForPublish(state, availableReferences) : []),
    [availableReferences, state],
  );
  const allErrors = [...validationErrors, ...serverErrors];
  const activePage = useMemo(
    () => (state ? resolveSelectedPage(state, selection) : null),
    [selection, state],
  );
  const activeSectionKey =
    selection.kind === "section" ? selection.sectionKey : undefined;

  const bumpPreview = useCallback(
    (contentChanged = true, targetDevice = deviceRef.current) => {
      const next = previewRevisionRef.current + 1;
      previewRevisionRef.current = next;
      setPreviewRevision(next);
      setExpectedPreviewRevisions((current) => ({
        ...current,
        [targetDevice]: next,
      }));
      if (contentChanged) {
        const nextContent = contentRevisionRef.current + 1;
        contentRevisionRef.current = nextContent;
        setContentRevision(nextContent);
      }
      setPreviewStale(false);
      return next;
    },
    [],
  );

  const themePreviewRef = useRef<string>("");
  const previewTheme = useCallback(
    (draft: DraftStatePayload | null) => {
      const serialized = draft ? JSON.stringify(draft) : "";
      if (serialized === themePreviewRef.current) return;
      themePreviewRef.current = serialized;
      setThemePreview(draft);
      setThemePreviewPageKey(current =>
        draft?.pages.some(page => pageKey(page) === current) ? current : null,
      );
      bumpPreview(false);
    },
    [bumpPreview],
  );

  const previewPage =
    pageCandidate?.page ??
    themePreview?.pages.find((page) => pageKey(page) === themePreviewPageKey) ??
    themePreview?.pages.find((page) => activePage && pageKey(page) === pageKey(activePage)) ??
    themePreview?.pages.find((page) => page.is_homepage) ??
    activePage;
  // Hover and selection messages must not resend the entire restaurant draft.
  const previewState = useMemo(() => {
    if (!state || !activePage) return null;
    const candidate =
      themePreview ??
      (pageCandidate
        ? {
            ...state,
            pages: [...state.pages, pageCandidate.page],
            sections: [...state.sections, ...pageCandidate.sections],
          }
        : sectionCandidate
          ? insertSection(state, activePage, sectionCandidate)
          : state);
    return withWebsiteV3PreviewNavigationState(
      candidate,
      storiesNavigationAvailable,
    );
  }, [
    state,
    activePage,
    themePreview,
    pageCandidate,
    sectionCandidate,
    storiesNavigationAvailable,
  ]);
  const activePageType = previewPage?.type;
  const surface = effectiveSurface(
    activePageType,
    requestedSurface,
    showBranchSelector,
  );
  const activePreviewKey = previewPage ? pageKey(previewPage) : "";
  const currentAcknowledgement = acknowledgements[device];
  const stalePreviews = stalePreviewDevices(
    acknowledgements,
    expectedPreviewRevisions,
    contentRevision,
    activePreviewKey,
  );
  const previewCovered = stalePreviews.length === 0;
  // Why Publish would refuse right now. The button stays clickable and says so:
  // a disabled button explains nothing, and the field errors below live in the
  // inspector for a selection that may not be on screen.
  const publishBlockedReason =
    themePreview || sectionCandidate || pageCandidate
      ? t("editorPreviewPending")
      : allErrors.length > 0
        ? `Corrigez les champs signalés avant de publier : ${allErrors[0].message}`
        : previewCovered
          ? null
          : `Vérifiez la dernière version sur ${describePreviewDevices(stalePreviews)} avant de publier.`;

  useEffect(() => {
    if (
      currentAcknowledgement &&
      currentAcknowledgement.revision >= previewRevision &&
      currentAcknowledgement.contentRevision === contentRevision &&
      currentAcknowledgement.activePageKey === activePreviewKey
    ) {
      setPreviewStale(false);
      return;
    }
    const timer = window.setTimeout(() => setPreviewStale(true), 5_000);
    return () => window.clearTimeout(timer);
  }, [
    activePreviewKey,
    contentRevision,
    currentAcknowledgement,
    previewRevision,
  ]);

  // Drop a stale checkout request when the selection moves to a page that has
  // no checkout. `surface` above already clamps the rendered value, so this is
  // only there to keep the stored request honest for the next order page.
  useEffect(() => {
    if (
      activePageType &&
      (activePageType !== "order" ||
        (requestedSurface === "branches" && !showBranchSelector)) &&
      requestedSurface !== "page"
    ) {
      setRequestedSurface("page");
    }
  }, [activePageType, requestedSurface, showBranchSelector]);

  useEffect(() => {
    if (
      discardAwaitRevision !== null &&
      currentAcknowledgement &&
      currentAcknowledgement.revision >= discardAwaitRevision
    ) {
      setNotice("Les modifications du brouillon ont été annulées.");
      setDiscardAwaitRevision(null);
    }
  }, [currentAcknowledgement, discardAwaitRevision]);

  const lockEditor = useCallback(() => {
    busyRef.current = true;
    setBusy(true);
  }, []);

  const unlockEditor = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  const acknowledgePreview = useCallback(
    (acknowledgement: PreviewAcknowledgement) => {
      setAcknowledgements((current) =>
        recordPreviewAcknowledgement(current, acknowledgement),
      );
    },
    [],
  );

  const setLocalState = useCallback(
    (nextState: DraftStatePayload, recordHistory = true) => {
      if (!loaded || busyRef.current) return;
      if (recordHistory)
        historyRef.current = recordDraftEdit(
          historyRef.current,
          loaded.draft.state,
          nextState,
        );
      const editRevision = editRevisionRef.current + 1;
      editRevisionRef.current = editRevision;
      const lifecycle = lifecycleRef.current;
      setLoaded((current) =>
        current
          ? {
              ...current,
              draft: {
                ...current.draft,
                state: nextState,
                draft_dirty: true,
              },
            }
          : current,
      );
      setSaveStatus("saving");
      setGlobalError(null);
      setServerErrors([]);
      setNotice(null);
      bumpPreview();

      autosave
        .enqueue(nextState)
        .then((response) => {
          if (lifecycle !== lifecycleRef.current) return;
          if (editRevision === editRevisionRef.current) {
            const normalized = normalizeDraftResponse(response);
            setLoaded((current) =>
              current
                ? {
                    ...current,
                    draft: {
                      ...normalized,
                      state: normalized.state,
                    },
                  }
                : current,
            );
            setSaveStatus("saved");
          }
        })
        .catch((error: unknown) => {
          if (lifecycle !== lifecycleRef.current) return;
          if (error instanceof AutosaveSuspendedError) return;
          setSaveStatus("error");
          const mapped = mapWebsiteDraftError(error);
          if (mapped) {
            setServerErrors([
              {
                ...mapped,
                pageKey: activePage ? pageKey(activePage) : undefined,
              },
            ]);
          } else {
            setGlobalError(
              `${readError(error)} Vos modifications restent dans cet écran.`,
            );
          }
        });
    },
    [activePage, autosave, bumpPreview, loaded],
  );

  const updateConfig = (path: StatePath, value: unknown) => {
    if (!state) return;
    setLocalState(updateDraftAtPath(state, ["config", ...path], value));
  };

  const uploadMainLogo = async (file: File) => {
    if (!state) return;
    const logoUrl = await uploadRestaurantLogo(restaurantId, file);
    setLocalState(
      updateDraftAtPath(state, ["config", "restaurant_logo_url"], logoUrl),
    );
  };

  const removeMainLogo = async () => {
    if (!state) return;
    setLocalState(
      updateDraftAtPath(state, ["config", "restaurant_logo_url"], ""),
    );
  };

  const updatePage = (key: string, path: StatePath, value: unknown) => {
    if (!state) return;
    if (path.length === 1 && path[0] === "slug") {
      slugManualRef.current.add(key);
    }
    const previous = state.pages.find((page) => pageKey(page) === key);
    const next = updateWebsitePageAtPath(state, key, path, value, {
      slugManuallyEdited: slugManualRef.current.has(key),
    });
    const updated = next.pages.find((page) => pageKey(page) === key);
    let linked = previous && updated ? retargetNavigationPage(next, previous.slug, updated.slug) : next;
    if (previous && updated && previous.nav_visible !== updated.nav_visible) {
      linked = updated.nav_visible ? addNavigationPage(linked, updated) : removeNavigationPage(linked, updated.slug);
    }
    setLocalState(linked);
  };

  const replacePage = (key: string, replacement: DraftPagePayload) => {
    if (!state) return;
    const index = state.pages.findIndex((page) => pageKey(page) === key);
    if (index < 0) return;
    setLocalState(
      retargetNavigationPage(
        updateDraftAtPath(state, ["pages", index], replacement),
        state.pages[index].slug,
        replacement.slug,
      ),
    );
  };

  const updateSection = (key: string, path: StatePath, value: unknown) => {
    if (!state) return;
    const index = state.sections.findIndex(
      (section) => sectionKey(section) === key,
    );
    if (index < 0) return;
    setLocalState(
      updateDraftAtPath(state, ["sections", index, ...path], value),
    );
  };

  const createPage = (input: {
    title: string;
    slug: string;
    type: DraftPagePayload["type"];
    menuIds: number[];
    isDefault: boolean;
  }) => {
    if (!state || busyRef.current) return;
    const tmpId = `page-${crypto.randomUUID()}`;
    const base = {
      tmp_id: tmpId,
      type: input.type,
      title: input.title,
      slug: input.slug,
      sort_order: state.pages.length,
      nav_visible: true,
      is_homepage: false,
      is_default: input.isDefault,
      seo: {},
      appearance_overrides: {},
    };
    const page: DraftPagePayload =
      input.type === "order"
        ? {
            ...base,
            type: "order",
            settings: { menu_ids: input.menuIds },
          }
        : input.type === "catering"
          ? {
              ...base,
              type: "catering",
              settings: { service_ids: [] },
            }
          : input.type === "landing"
            ? { ...base, type: "landing", settings: {}, is_default: false }
            : { ...base, type: "content", settings: {}, is_default: false };
    let next = addNavigationPage(
      { ...state, pages: [...state.pages, page] },
      page,
    );
    if (page.is_default) next = makeDefaultPage(next, pageKey(page));
    setLocalState(next);
    setSelection({ kind: "page", key: pageKey(page) });
    setSectionPanel("content");
    setDialogOpen(false);
  };

  const duplicateSelectedPage = (key: string) => {
    if (!state || busyRef.current) return;
    const duplicated = duplicatePage(state, key, () => crypto.randomUUID());
    if (!duplicated) return;
    setLocalState(addNavigationPage(duplicated.state, duplicated.page));
    setSelection({ kind: "page", key: pageKey(duplicated.page) });
  };

  const deleteSelectedPage = (key: string) => {
    if (!state || busyRef.current) return;
    const target = state.pages.find((page) => pageKey(page) === key);
    if (!target || target.type === "landing") return;
    if (!canDeletePage(state, key)) {
      setGlobalError(
        "Créez une autre page de ce type avant de supprimer l’unique page principale.",
      );
      return;
    }
    if (
      !window.confirm(`Supprimer la page « ${target.title} » et ses sections ?`)
    ) {
      return;
    }
    let next = state;
    if (target.is_default) {
      const replacement = state.pages.find(
        (page) => pageKey(page) !== key && page.type === target.type,
      );
      if (!replacement) return;
      next = makeDefaultPage(next, pageKey(replacement));
    }
    next = removeNavigationPage(removePage(next, key), target.slug);
    setLocalState(next);
    const fallback = [...next.pages].sort(
      (a, b) => a.sort_order - b.sort_order,
    )[0];
    setSelection(
      fallback ? { kind: "page", key: pageKey(fallback) } : { kind: "site" },
    );
  };

  const previewPageTemplate = (
    template: PageTemplate | null,
    title = "",
    navigation = true,
  ) => {
    if (!state || !loaded || busyRef.current) return;
    if (!template) {
      setPageCandidate(null);
      bumpPreview(false);
      return;
    }
    const baseSlug = normalizeSlug(title) || "page";
    let slug = baseSlug;
    let suffix = 2;
    while (state.pages.some((page) => page.slug === slug))
      slug = `${baseSlug}-${suffix++}`;
    const tmpId = `page-${crypto.randomUUID()}`;
    const page: DraftPagePayload = {
      tmp_id: tmpId,
      type: "content",
      title,
      slug,
      sort_order: state.pages.length,
      nav_visible: navigation,
      is_homepage: false,
      is_default: false,
      seo: {},
      settings: {},
      appearance_overrides: {},
    };
    const types = {
      about: ["hero_banner", "text_and_image", "text"],
      gallery: ["gallery"],
      locations: ["location_hours"],
      menu: ["featured_menu"],
      contact: ["forms", "location_hours"],
      home: [
        "hero_banner",
        "menu_highlights",
        "text_and_image",
        "location_hours",
      ],
      blank: [],
    }[template];
    const sections: DraftSectionPayload[] = types.map((type, index) => ({
      tmp_id: `section-${crypto.randomUUID()}`,
      section_type: type,
      page: slug,
      page_tmp_id: tmpId,
      sort_order: index,
      is_visible: true,
      layout: "default",
      settings: {
        ...getDefaultSettings(type),
        anchor: `section-${crypto.randomUUID()}`,
      },
      content: {
        ...getDefaultContent(type),
        ...(type === "hero_banner"
          ? { headline: title, image_url: loaded.restaurant.cover_url || "" }
          : {}),
        ...(template === "locations" && type === "text_and_image"
          ? {
              title: loaded.restaurant.name,
              body: loaded.restaurant.address || "",
              image_url: loaded.restaurant.cover_url || "",
            }
          : {}),
      },
    }));
    setPageCandidate({ page, sections });
    bumpPreview(false);
  };
  const addPageTemplate = () => {
    if (!state || !pageCandidate || busyRef.current) return;
    setLocalState(
      addNavigationPage(
        {
          ...state,
          pages: [...state.pages, pageCandidate.page],
          sections: [...state.sections, ...pageCandidate.sections],
        },
        pageCandidate.page,
      ),
    );
    setSelection({ kind: "page", key: pageKey(pageCandidate.page) });
    setPageCandidate(null);
  };

  const previewSection = (type: string | null, layout = "default") => {
    if (!state || !activePage || busyRef.current) return;
    setSectionCandidate(
      type
        ? {
            tmp_id: "section-preview",
            section_type: type,
            page: activePage.slug,
            page_id: activePage.id,
            page_tmp_id: activePage.tmp_id,
            sort_order: 0,
            is_visible: true,
            layout,
            content: getDefaultContent(type, layout),
            settings: {
              ...getDefaultSettings(type),
              anchor: `section-${crypto.randomUUID()}`,
            },
          }
        : null,
    );
    bumpPreview(false);
  };

  const createFooter = () => {
    if (!state || !activePage || busyRef.current) return;
    setLocalState(addSiteFooter(state, `section-${crypto.randomUUID()}`));
    setSelection({ kind: "site", pageKey: pageKey(activePage), region: "footer" });
    setSectionPanel("content");
  };

  const addSection = (type: string, layout = "default") => {
    if (!state || !activePage || busyRef.current) return;
    const section: DraftSectionPayload = {
      ...(sectionCandidate?.section_type === type
        ? sectionCandidate
        : {
            section_type: type,
            page: activePage.slug,
            page_id: activePage.id,
            page_tmp_id: activePage.tmp_id,
            sort_order: 0,
            is_visible: true,
            content: getDefaultContent(type, layout),
            settings: {
              ...getDefaultSettings(type),
              anchor: `section-${crypto.randomUUID()}`,
            },
          }),
      tmp_id: `section-${crypto.randomUUID()}`,
      layout,
    };
    setSectionCandidate(null);
    setLocalState(insertSection(state, activePage, section));
    setSelection({
      kind: "section",
      pageKey: pageKey(activePage),
      sectionKey: sectionKey(section),
    });
    setSectionPanel("appearance");
  };

  const moveSection = (key: string, direction: -1 | 1) => {
    if (!state || !activePage || busyRef.current) return;
    const pageSections = sectionsForPage(state, activePage);
    const index = pageSections.findIndex(
      (section) => sectionKey(section) === key,
    );
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= pageSections.length) return;
    [pageSections[index], pageSections[nextIndex]] = [
      pageSections[nextIndex],
      pageSections[index],
    ];
    const orders = new Map(
      pageSections.map((section, order) => [sectionKey(section), order]),
    );
    setLocalState({
      ...state,
      sections: state.sections.map((section) => {
        const order = orders.get(sectionKey(section));
        return order === undefined
          ? section
          : { ...section, sort_order: order };
      }),
    });
  };

  const confirmDeleteSection = (key: string) => {
    if (!state || busyRef.current) return;
    const target = state.sections.find((section) => sectionKey(section) === key);
    if (!target || !canDeleteSection(target)) return;
    const next: DraftStatePayload = {
      ...state,
      sections: state.sections.filter((section) => sectionKey(section) !== key),
      deleted_section_ids:
        target.id === undefined
          ? state.deleted_section_ids
          : Array.from(new Set([...state.deleted_section_ids, target.id])),
    };
    setLocalState(next);
    if (activePage) {
      setSelection({ kind: "page", key: pageKey(activePage) });
    }
  };

  const focusError = (error: FieldError) => {
    if (!state || busyRef.current) return;
    if (error.sectionKey) {
      const section = state.sections.find(
        (candidate) => sectionKey(candidate) === error.sectionKey,
      );
      const page = section
        ? state.pages.find((candidate) => sectionBelongs(section, candidate))
        : null;
      if (section && page) {
        setSelection({
          kind: "section",
          pageKey: pageKey(page),
          sectionKey: sectionKey(section),
        });
      }
    } else if (error.pageKey) {
      setSelection({ kind: "page", key: error.pageKey });
    }
    setSectionPanel(error.sectionPanel ?? "settings");
    bumpPreview();
    window.setTimeout(() => {
      const holder = document.querySelector<HTMLElement>(
        `[data-field-id="${CSS.escape(error.fieldId)}"]`,
      );
      const focusable = holder?.matches(
        "button,input,select,textarea,[tabindex]:not([tabindex='-1'])",
      )
        ? holder
        : holder?.querySelector<HTMLElement>(
            "button,input,select,textarea,[tabindex]:not([tabindex='-1'])",
          );
      focusable?.focus();
      (focusable ?? holder)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  const retrySave = () => {
    if (!state) return;
    setSaveStatus("saving");
    setGlobalError(null);
    setServerErrors([]);
    setLocalState(state);
  };

  const publish = async () => {
    if (!loaded || !state || busyRef.current) return;
    const errors = validateDraftForPublish(state, availableReferences);
    if (errors.length > 0) {
      focusError(errors[0]);
      setGlobalError(
        `Corrigez les champs signalés avant de publier. ${errors
          .map((error) => error.message)
          .join(" ")}`,
      );
      return;
    }
    if (!previewCovered) {
      // Same courtesy as focusError: put the thing that needs checking on screen.
      changeDevice(stalePreviews[0]);
      setGlobalError(
        `Vérifiez la dernière version sur ${describePreviewDevices(
          stalePreviews,
        )} avant de publier.`,
      );
      return;
    }
    try {
      await requireWebsiteV3RuntimeCapabilities(webOrigin);
    } catch (error: unknown) {
      setGlobalError(readError(error));
      return;
    }
    lockEditor();
    lifecycleRef.current += 1;
    setGlobalError(null);
    try {
      await autosave.beginLifecycle("publish");
      await saveWebsiteDraft(
        restaurantId,
        prepareWebsiteV3StateForPublication(state),
      );
      setSaveStatus("saved");
      const activePageBeforePublish = activePage;
      const response = normalizeDraftResponse(
        await publishWebsiteDraft(restaurantId),
      );
      const restaurant = await getRestaurant(restaurantId);
      autosave.reset();
      historyRef.current = { past: [], future: [] };
      setLoaded((current) =>
        current ? { ...current, draft: response, restaurant } : current,
      );
      setSaveStatus("saved");
      setNotice("Le site est publié.");
      setSelection(
        selectionAfterReload(response.state, activePageBeforePublish),
      );
      bumpPreview();
    } catch (error: unknown) {
      setSaveStatus("saved");
      const mapped = mapWebsiteDraftError(error);
      if (mapped) {
        const page = activePage ? pageKey(activePage) : undefined;
        const fieldError = { ...mapped, pageKey: page };
        setServerErrors([fieldError]);
        focusError(fieldError);
      } else {
        setGlobalError(readError(error));
      }
    } finally {
      autosave.endLifecycle();
      unlockEditor();
    }
  };

  const discard = async () => {
    if (!loaded || busyRef.current) return;
    if (
      loaded.draft.draft_dirty &&
      !window.confirm(
        "Annuler toutes les modifications non publiées de ce brouillon ?",
      )
    ) {
      return;
    }
    lockEditor();
    lifecycleRef.current += 1;
    setGlobalError(null);
    try {
      await autosave.beginLifecycle("discard");
      const activePageBeforeDiscard = activePage;
      const response = normalizeDraftResponse(
        await discardWebsiteDraft(restaurantId),
      );
      autosave.reset();
      historyRef.current = { past: [], future: [] };
      setLoaded((current) =>
        current ? { ...current, draft: response } : current,
      );
      setSaveStatus("idle");
      setSelection(
        selectionAfterReload(response.state, activePageBeforeDiscard),
      );
      const revision = bumpPreview();
      setDiscardAwaitRevision(revision);
    } catch (error: unknown) {
      setSaveStatus("error");
      setGlobalError(readError(error));
    } finally {
      autosave.endLifecycle();
      unlockEditor();
    }
  };

  const changeDevice = (next: PreviewDevice) => {
    if (busyRef.current || next === device) return;
    deviceRef.current = next;
    setDevice(next);
    bumpPreview(false, next);
  };

  /** Deliberately does NOT call bumpPreview: changing surface swaps the iframe
   *  `src`, which remounts it and replays the ready handshake on its own.
   *  Bumping would move previewRevision and could flip previewStatus and
   *  canPublish for a surface change that published nothing. */
  const openOrderJourney = (key = activePage ? pageKey(activePage) : "", screen: OrderJourneyScreen = "cart") => {
    const page = state?.pages.find(candidate => pageKey(candidate) === key);
    if (busyRef.current || themePreview || page?.type !== "order") return;
    setSectionCandidate(null);
    setPageCandidate(null);
    setHoveredSectionKey(null);
    setJourneyScreen(screen);
    setRequestedSurface("checkout");
    setSelection({ kind: "page", key, region: "order-journey" });
  };

  const changeSurface = (next: InspectorSurface) => {
    if (busyRef.current || next === requestedSurface) return;
    setRequestedSurface(next);
  };

  const selectPage = (key: string) => {
    if (busyRef.current) return;
    if (themePreview) {
      if (themePreview.pages.some(page => pageKey(page) === key)) {
        setThemePreviewPageKey(key);
        bumpPreview(false);
      }
      return;
    }
    setSectionCandidate(null);
    setPageCandidate(null);
    setHoveredSectionKey(null);
    setRequestedSurface("page");
    setSelection({ kind: "page", key });
    setSectionPanel("content");
    bumpPreview(false);
  };

  const travelHistory = (direction: "undo" | "redo") => {
    if (!state || busyRef.current) return;
    const result = travelDraftHistory(historyRef.current, state, direction);
    if (!result) return;
    historyRef.current = result.history;
    setLocalState(result.state, false);
    setSelection((current) => {
      if (current.kind === "site") return current;
      const key = current.kind === "section" ? current.pageKey : current.key;
      const pageExists = result.state.pages.some(
        (page) => pageKey(page) === key,
      );
      const sectionExists =
        current.kind !== "section" ||
        result.state.sections.some(
          (section) => sectionKey(section) === current.sectionKey,
        );
      return pageExists && sectionExists
        ? current
        : selectionAfterReload(result.state, activePage);
    });
  };

  const selectSection = (key: string, field?: string) => {
    if (!activePage || busyRef.current || themePreview) return;
    setRequestedSurface("page");
    setSelection({
      kind: "section",
      pageKey: pageKey(activePage),
      sectionKey: key,
      field,
    });
    setSectionPanel(field ? "content" : "appearance");
  };

  if (loading) {
    return <BuilderLoading />;
  }
  if (loadError || !loaded || !state || !activePage) {
    return (
      <BuilderFailure
        restaurantId={restaurantId}
        message={loadError ?? "Le builder n’a pas reçu une page exploitable."}
        onRetry={() => setRetryToken((value) => value + 1)}
      />
    );
  }

  const publicUrl = publicURLForPage({
    webOrigin,
    restaurantSlug: loaded.restaurant.slug || String(restaurantId),
    page: activePage,
  });
  const previewStatus =
    currentAcknowledgement &&
    currentAcknowledgement.revision >= previewRevision &&
    currentAcknowledgement.contentRevision === contentRevision &&
    currentAcknowledgement.activePageKey === activePreviewKey
      ? "synced"
      : previewStale
        ? "stale"
        : "syncing";

  const colorTheme = loaded.catalog.themes.find(theme => theme.id === state.config.theme_id);
  const colorConfig = {...state.config, custom_palette: state.config.custom_palette || {
    bg: colorTheme?.preview.swatches[0], surface: colorTheme?.preview.swatches[1],
    accent: state.config.brand_color || colorTheme?.preview.swatches[2], ink: colorTheme?.preview.swatches[3],
  }};
  return (
    <SiteColorContext.Provider value={colorConfig}>
      <BuilderShell
        status={saveStatus}
        previewStatus={previewStatus}
        device={device}
        publicUrl={publicUrl}
        publishBlockedReason={publishBlockedReason}
        busy={busy}
        onDeviceChange={changeDevice}
        onDiscard={discard}
        onPublish={() => {
          if (themePreview) {
            setNotice(t("editorPreviewPending"));
            return;
          }
          void publish();
        }}
        canUndo={
          !themePreview &&
          !sectionCandidate &&
          !pageCandidate &&
          historyRef.current.past.length > 0
        }
        canRedo={
          !themePreview &&
          !sectionCandidate &&
          !pageCandidate &&
          historyRef.current.future.length > 0
        }
        onUndo={() => travelHistory("undo")}
        onRedo={() => travelHistory("redo")}
        previewOnly={previewOnly}
        onPreviewChange={setPreviewOnly}
        sidebar={
          <EditorSidebar
            restaurantId={restaurantId}
            state={state}
            activePage={activePage}
            selection={selection}
            sectionPanel={sectionPanel}
            busy={busy}
            onSectionPanelChange={setSectionPanel}
            onSelectSite={(region) => {
              setRequestedSurface("page");
              setSelection({
                kind: "site",
                pageKey: pageKey(activePage),
                region,
              });
              setSectionPanel("content");
            }}
            onSelectPage={selectPage}
            onSelectSection={selectSection}
            hoveredSectionKey={hoveredSectionKey}
            onHoverSection={setHoveredSectionKey}
            onSectionChange={updateSection}
            onClearSelection={() => {
              setRequestedSurface("page");
              setSelection({ kind: "page", key: pageKey(activePage) });
            }}
            onPreviewPage={previewPageTemplate}
            onMakeHomepage={(key) =>
              setLocalState(makeHomepagePage(state, key))
            }
            onAddPageTemplate={addPageTemplate}
            onPageSettings={setSettingsPageKey}
            onAddPage={() => setDialogOpen(true)}
            onAddSection={addSection}
            onPreviewSection={previewSection}
            onDuplicateSection={(key) => {
              const newKey = `section-${crypto.randomUUID()}`;
              setLocalState(duplicateSection(state, activePage, key, newKey));
              selectSection(newKey);
            }}
            onReorderSection={(source, target) =>
              setLocalState(reorderSection(state, activePage, source, target))
            }
            onDuplicatePage={duplicateSelectedPage}
            onMovePage={(key, direction) =>
              setLocalState(movePage(state, key, direction))
            }
            onDeletePage={deleteSelectedPage}
            onMoveSection={moveSection}
            onToggleSection={(key) => {
              const section = state.sections.find((s) => sectionKey(s) === key);
              if (section)
                updateSection(key, ["is_visible"], !section.is_visible);
            }}
            onDeleteSection={setPendingDeleteSection}
            alerts={
              <>
                {globalError && (
                  <div role="alert" className="sqe-error">
                    {globalError}
                    {saveStatus === "error" && (
                      <button onClick={retrySave}>
                        Réessayer l’enregistrement
                      </button>
                    )}
                  </div>
                )}
                {notice && (
                  <div role="status" className="sqe-error">
                    {notice}
                  </div>
                )}
              </>
            }
            design={(onEditShared, initialScreen, colorTarget) => (
              <SiteDesign
                initialScreen={initialScreen}
                colorTarget={colorTarget}
                state={state}
                catalog={loaded.catalog}
                previewContext={{ webOrigin, restaurantSlug: loaded.restaurant.slug || String(restaurantId), restaurantId }}
                restaurantName={loaded.restaurant.name}
                description={loaded.restaurant.description || ""}
                image={String(loaded.restaurant.cover_url || "")}
                onChange={setLocalState}
                onPreview={previewTheme}
                previewPageKey={themePreviewPageKey ?? pageKey(activePage)}
                onSelectPreviewPage={selectPage}
                onApplied={(next) => {
                  const page = next.pages.find(page => pageKey(page) === themePreviewPageKey)
                    ?? next.pages.find(page => pageKey(page) === pageKey(activePage))
                    ?? next.pages.find(page => page.is_homepage);
                  if (page) setSelection({ kind: "page", key: pageKey(page) });
                  setRequestedSurface("page");
                }}
                onEditShared={onEditShared}
              />
            )}
            orderEditor={region => region === "order-journey" ? <OrderJourneyEditor
              restaurantId={restaurantId} colorStyle={String((activePage.appearance_overrides.website_order as {color_style?: string} | undefined)?.color_style ?? "default")} screen={journeyScreen} onScreenChange={setJourneyScreen}
              colors={activePage.appearance_overrides.order_journey}
              onColorsChange={value => updatePage(pageKey(activePage), ["appearance_overrides", "order_journey"], value)}
              orderType={journeyOrderType} onOrderTypeChange={setJourneyOrderType}
              value={state.config.checkout_config as CheckoutConfig | null}
              placesAvailable={Boolean(loaded.restaurant.google_places_api_key)}
              onChange={value => updateConfig(["checkout_config"], value)}
              onEditCartButton={() => window.dispatchEvent(new Event("foody-edit-site-buttons"))}
            /> : <OrderPageEditor restaurantHeader={resolvePageHeader(headerFromLegacy(state.config, state.pages), activePage.type, activePage.appearance_overrides).layout === "restaurant"} orderChoicesAvailable={websiteOrderChoicesAvailable(loaded.restaurant, state.config.checkout_config)} sharedHeader={Boolean((state.config.nav_layout as {header?: unknown} | undefined)?.header)} onEditHeader={() => {
              const header = resolvePageHeader(headerFromLegacy(state.config, state.pages), activePage.type, activePage.appearance_overrides);
              setSelection({kind: "site", pageKey: pageKey(activePage), region: "header", headerElement: region === "order-banner" ? "logo" : header.layout === "restaurant" ? "restaurant" : "fulfillment"});
              setSectionPanel("content");
            }} restaurantId={restaurantId} page={activePage} region={region} onPreviewItem={setPreviewOrderItem} onChange={(path, value) => updatePage(pageKey(activePage), path, value)} />}
            onSelectOrderRegion={region => { setRequestedSurface(region === "order-journey" ? "checkout" : "page"); setSelection({kind: "page", key: pageKey(activePage), region}); }}
            onOpenOrderJourney={openOrderJourney}
            inspector={
              <Inspector
                restaurantId={restaurantId}
                restaurant={loaded.restaurant}
                restaurantLogoUrl={loaded.restaurant.logo_url}
                state={state}
                selection={selection}
                sectionPanel={sectionPanel}
                surface={surface}
                showBranchSelector={showBranchSelector}
                menus={loaded.menus}
                services={loaded.services}
                catalog={loaded.catalog}
                catalogWarning={loaded.catalogWarning}
                errors={allErrors}
                onSurfaceChange={changeSurface}
                onOpenOrderJourney={activePage.type === "order" ? () => openOrderJourney() : undefined}
                onConfigChange={updateConfig}
                onOrderHeaderChange={(key, header, shared) => {
                  const next = updateWebsitePageAtPath(state, key, ["appearance_overrides", "order_header"], header);
                  const nav = state.config.nav_layout as Record<string, unknown> | undefined;
                  // Materialize a legacy header together with its first page override.
                  setLocalState(header && !nav?.header ? {
                    ...next, config: { ...next.config, nav_layout: { ...nav, header: shared } },
                  } : next);
                }}
                onPageChange={updatePage}
                onPageReplace={replacePage}
                onSectionChange={updateSection}
                onCreateFooter={createFooter}
                onMakeDefault={(key) =>
                  setLocalState(makeDefaultPage(state, key))
                }
                onMakeHomepage={(key) =>
                  setLocalState(makeHomepagePage(state, key))
                }
                onRestaurantLogoUpload={uploadMainLogo}
                onRestaurantLogoRemove={removeMainLogo}
              />
            }
          />
        }
        preview={
          <PreviewCanvas
            onOpenOrderJourney={() => openOrderJourney()}
            journeyScreen={journeyScreen}
            journeyOrderType={journeyOrderType}
            webOrigin={webOrigin}
            restaurantSlug={loaded.restaurant.slug}
            restaurantId={restaurantId}
            state={previewState ?? state}
            activePage={previewPage ?? activePage}
            activeSectionKey={
              sectionCandidate ? sectionKey(sectionCandidate) : activeSectionKey
            }
            activeField={
              selection.kind === "section" ? selection.field : undefined
            }
            activeRegion={
              selection.kind === "site" ? selection.region : selection.kind === "page" ? selection.region === "order-journey" ? undefined : selection.region : undefined
            }
            orderDialog={selection.kind === "page" && selection.region === "order-fulfillment" ? "fulfillment" : selection.kind === "page" && selection.region === "order-items" && previewOrderItem ? "item" : undefined}
            onSelectRegion={(region, headerElement) => {
              if (region === "order-items" || region === "order-banner" || region === "order-fulfillment") {
                setSelection({kind: "page", key: pageKey(activePage), region});
                return;
              }
              setSelection({
                kind: "site",
                pageKey: pageKey(activePage),
                region,
                headerElement,
              });
              setSectionPanel("content");
            }}
            hoveredSectionKey={hoveredSectionKey}
            onHoverSection={setHoveredSectionKey}
            onEditRejected={() => {
              setNotice(t("editorEditConflict"));
              bumpPreview(false);
            }}
            onEditElement={(key, field, value) => {
              setNotice(null);
              updateSection(key, ["content", field], value);
            }}
            onClearSelection={() => {
              setRequestedSurface("page");
              setSelection({ kind: "page", key: pageKey(activePage) });
            }}
            previewOnly={
              previewOnly ||
              Boolean(themePreview || sectionCandidate || pageCandidate)
            }
            device={device}
            surface={surface}
            showBranchSelector={showBranchSelector}
            onSurfaceChange={changeSurface}
            revision={previewRevision}
            contentRevision={contentRevision}
            onAcknowledged={acknowledgePreview}
            onNavigatePage={selectPage}
            onSelectSection={selectSection}
            onAddSection={addSection}
            onMoveSection={moveSection}
            onToggleSection={(key) => {
              const section = state.sections.find(
                (candidate) => sectionKey(candidate) === key,
              );
              if (section) {
                updateSection(key, ["is_visible"], !section.is_visible);
              }
            }}
            onDeleteSection={setPendingDeleteSection}
          />
        }
      />
      {settingsPageKey &&
        state.pages.find((page) => pageKey(page) === settingsPageKey) && (
          <PageSettingsDialog
            key={settingsPageKey}
            page={state.pages.find(
              (page) => pageKey(page) === settingsPageKey,
            )!}
            pages={state.pages}
            restaurantId={restaurantId}
            onClose={() => setSettingsPageKey(null)}
            onSave={(page) => {
              let next = state;
              for (const field of [
                "title",
                "slug",
                "nav_visible",
                "seo",
              ] as const) {
                next = updateWebsitePageAtPath(
                  next,
                  settingsPageKey,
                  [field],
                  page[field],
                  { slugManuallyEdited: true },
                );
              }
              slugManualRef.current.add(settingsPageKey);
              setLocalState(next);
              setSettingsPageKey(null);
            }}
          />
        )}
      <AlertDialog open={pendingDeleteSection !== null} onOpenChange={(open) => { if (!open) setPendingDeleteSection(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>{t("editorDeleteSectionConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>{t("editorDeleteSectionUndo")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => { if (pendingDeleteSection) confirmDeleteSection(pendingDeleteSection); }}>
              {t("editorDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageDialog
        open={dialogOpen && !busy}
        pages={state.pages}
        menus={loaded.menus}
        services={loaded.services}
        onClose={() => setDialogOpen(false)}
        onCreate={createPage}
      />
    </SiteColorContext.Provider>
  );
}

function selectionAfterReload(
  state: DraftStatePayload,
  preferredPage?: Pick<DraftPagePayload, "id" | "tmp_id" | "slug"> | null,
): RailSelection {
  const page =
    state.pages.find(
      (candidate) =>
        preferredPage?.id !== undefined && candidate.id === preferredPage.id,
    ) ??
    state.pages.find(
      (candidate) =>
        !!preferredPage?.tmp_id && candidate.tmp_id === preferredPage.tmp_id,
    ) ??
    state.pages.find((candidate) => candidate.slug === preferredPage?.slug) ??
    state.pages.find((candidate) => candidate.is_homepage) ??
    state.pages.find((candidate) => candidate.type === "landing") ??
    state.pages[0];
  return page ? { kind: "page", key: pageKey(page) } : { kind: "site" };
}

function readError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Une erreur inattendue a interrompu l’opération.";
}

function BuilderLoading() {
  return (
    <div className="hidden h-screen items-center justify-center bg-white lg:flex">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-black" />
        <p className="mt-4 text-sm font-medium text-neutral-500">
          Chargement de l’éditeur…
        </p>
      </div>
    </div>
  );
}

function BuilderFailure({
  restaurantId,
  message,
  onRetry,
}: {
  restaurantId: number;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="hidden h-screen items-center justify-center bg-white p-8 lg:flex">
      <section className="w-full max-w-md rounded-[26px] bg-white p-7 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">
          Chargement impossible
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950">
          Le builder n’a pas pu démarrer
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <a
            href={`/${restaurantId}/dashboard`}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Retour
          </a>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Réessayer
          </button>
        </div>
      </section>
    </div>
  );
}
