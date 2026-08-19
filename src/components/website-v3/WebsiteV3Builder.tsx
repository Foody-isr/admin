"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  discardWebsiteDraft,
  getPublicRestaurantNavigationState,
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
} from "@/lib/api";
import { getDefaultContent } from "@/components/website/SectionEditors";
import {
  createSerializedAutosave,
  AutosaveSuspendedError,
  type AutosaveStatus,
} from "@/lib/website-v3/autosave";
import {
  hasCompletePreviewCoverage,
  recordPreviewAcknowledgement,
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
import { BuilderShell } from "./BuilderShell";
import { Inspector, type InspectorTab } from "./Inspector";
import { MobileUnavailable } from "./MobileUnavailable";
import { PageDialog } from "./PageDialog";
import { PageRail, type RailSelection } from "./PageRail";
import { PreviewCanvas } from "./PreviewCanvas";

const WEB_ORIGIN =
  process.env.NEXT_PUBLIC_WEB_URL || "https://dev-app.foody-pos.co.il";
const EMPTY_CATALOG: ThemeCatalog = { themes: [], typography_pairings: [] };

type LoadedBuilder = {
  draft: DraftResponse;
  restaurant: Restaurant;
  menus: Menu[];
  services: CateringService[];
  catalog: ThemeCatalog;
  catalogWarning: string | null;
};

export function WebsiteV3Builder({ restaurantId }: { restaurantId: number }) {
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWideEnough(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (wideEnough !== true) {
    return <MobileUnavailable restaurantId={restaurantId} />;
  }
  return <DesktopWebsiteV3Builder restaurantId={restaurantId} />;
}

function DesktopWebsiteV3Builder({
  restaurantId,
}: {
  restaurantId: number;
}) {
  const [loaded, setLoaded] = useState<LoadedBuilder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selection, setSelection] = useState<RailSelection>({ kind: "site" });
  const [tab, setTab] = useState<InspectorTab>("content");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
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
  const [discardAwaitRevision, setDiscardAwaitRevision] = useState<number | null>(
    null,
  );
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
      .then(([
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
        const reconciled = reconcileLegacyWebsiteDraft(normalized.state, {
          menuIds: menus
            .filter((menu) => menu.web_enabled)
            .map((menu) => menu.id),
          serviceIds: services
            .filter((service) => service.is_active)
            .map((service) => service.id),
        }, publishedPages);
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
        setStoriesNavigationAvailable(
          navigation.storiesNavigationAvailable,
        );
        setLoaded({
          draft: editorDraft,
          restaurant,
          menus,
          services,
          catalog: themeResult.catalog,
          catalogWarning: themeResult.warning,
        });
        const firstPage = [...editorDraft.state.pages].sort(
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
      })
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
  }, [autosave, restaurantId, retryToken]);

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
    () =>
      state
        ? validateDraftForPublish(state, availableReferences)
        : [],
    [availableReferences, state],
  );
  const allErrors = [...validationErrors, ...serverErrors];
  const activePage = useMemo(
    () => (state ? resolveSelectedPage(state, selection) : null),
    [selection, state],
  );
  const activeSectionKey =
    selection.kind === "section" ? selection.sectionKey : undefined;

  const bumpPreview = useCallback((
    contentChanged = true,
    targetDevice = deviceRef.current,
  ) => {
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
  }, []);

  const updateStoriesNavigationAvailability = useCallback(
    (available: boolean | undefined) => {
      if (storiesNavigationAvailableRef.current === available) return;
      storiesNavigationAvailableRef.current = available;
      setStoriesNavigationAvailable(available);
      bumpPreview();
    },
    [bumpPreview],
  );

  // Clamped here, above the early returns, so the value is stable for both the
  // preview and the inspector and no non-order page can resolve to "checkout".
  const activePageType = activePage?.type;
  const surface = effectiveSurface(activePageType, requestedSurface);
  const activePreviewKey = activePage ? pageKey(activePage) : "";
  const currentAcknowledgement = acknowledgements[device];
  const previewCovered = hasCompletePreviewCoverage(
    acknowledgements,
    expectedPreviewRevisions,
    contentRevision,
    activePreviewKey,
  );

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
    if (activePageType && activePageType !== "order" && requestedSurface === "checkout") {
      setRequestedSurface("page");
    }
  }, [activePageType, requestedSurface]);

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
    (nextState: DraftStatePayload) => {
      if (!loaded || busyRef.current) return;
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
      updateDraftAtPath(
        state,
        ["config", "restaurant_logo_url"],
        logoUrl,
      ),
    );
  };

  const removeMainLogo = async () => {
    if (!state) return;
    setLocalState(
      updateDraftAtPath(
        state,
        ["config", "restaurant_logo_url"],
        "",
      ),
    );
  };

  const updatePage = (key: string, path: StatePath, value: unknown) => {
    if (!state) return;
    if (path.length === 1 && path[0] === "slug") {
      slugManualRef.current.add(key);
    }
    setLocalState(
      updateWebsitePageAtPath(state, key, path, value, {
        slugManuallyEdited: slugManualRef.current.has(key),
      }),
    );
  };

  const replacePage = (key: string, replacement: DraftPagePayload) => {
    if (!state) return;
    const index = state.pages.findIndex((page) => pageKey(page) === key);
    if (index < 0) return;
    setLocalState(
      updateDraftAtPath(state, ["pages", index], replacement),
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
    serviceIds: number[];
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
              settings: { service_ids: input.serviceIds },
            }
          : input.type === "landing"
            ? { ...base, type: "landing", settings: {}, is_default: false }
            : { ...base, type: "content", settings: {}, is_default: false };
    let next = { ...state, pages: [...state.pages, page] };
    if (page.is_default) next = makeDefaultPage(next, pageKey(page));
    setLocalState(next);
    setSelection({ kind: "page", key: pageKey(page) });
    setTab("content");
    setDialogOpen(false);
  };

  const duplicateSelectedPage = (key: string) => {
    if (!state || busyRef.current) return;
    const duplicated = duplicatePage(state, key, () => crypto.randomUUID());
    if (!duplicated) return;
    setLocalState(duplicated.state);
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
    if (!window.confirm(`Supprimer la page « ${target.title} » et ses sections ?`)) {
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
    next = removePage(next, key);
    setLocalState(next);
    const fallback = [...next.pages].sort(
      (a, b) => a.sort_order - b.sort_order,
    )[0];
    setSelection(
      fallback ? { kind: "page", key: pageKey(fallback) } : { kind: "site" },
    );
  };

  const addSection = (type: string) => {
    if (!state || !activePage || busyRef.current) return;
    const sections = sectionsForPage(state, activePage);
    const section: DraftSectionPayload = {
      tmp_id: `section-${crypto.randomUUID()}`,
      section_type: type,
      page: activePage.slug,
      page_id: activePage.id,
      page_tmp_id: activePage.tmp_id,
      sort_order: sections.length,
      is_visible: true,
      layout: "default",
      content: getDefaultContent(type),
      settings: {},
    };
    setLocalState({ ...state, sections: [...state.sections, section] });
    setSelection({
      kind: "section",
      pageKey: pageKey(activePage),
      sectionKey: sectionKey(section),
    });
    setTab("content");
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
        return order === undefined ? section : { ...section, sort_order: order };
      }),
    });
  };

  const deleteSection = (key: string) => {
    if (
      !state ||
      busyRef.current ||
      !window.confirm("Supprimer cette section ?")
    ) {
      return;
    }
    const target = state.sections.find(
      (section) => sectionKey(section) === key,
    );
    if (!target) return;
    const next: DraftStatePayload = {
      ...state,
      sections: state.sections.filter(
        (section) => sectionKey(section) !== key,
      ),
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
    setTab(error.tab ?? "settings");
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
      setGlobalError(
        "Vérifiez la dernière version sur les aperçus ordinateur et mobile avant de publier.",
      );
      return;
    }
    lockEditor();
    lifecycleRef.current += 1;
    setGlobalError(null);
    try {
      await autosave.beginLifecycle("publish");
      setSaveStatus("saved");
      const activePageBeforePublish = activePage;
      const response = normalizeDraftResponse(
        await publishWebsiteDraft(restaurantId),
      );
      const restaurant = await getRestaurant(restaurantId);
      autosave.reset();
      setLoaded((current) =>
        current ? { ...current, draft: response, restaurant } : current,
      );
      setSaveStatus("saved");
      setNotice("Le site est publié.");
      setSelection(selectionAfterReload(response.state, activePageBeforePublish));
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
      setLoaded((current) =>
        current ? { ...current, draft: response } : current,
      );
      setSaveStatus("idle");
      setSelection(selectionAfterReload(response.state, activePageBeforeDiscard));
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
  const changeSurface = (next: InspectorSurface) => {
    if (busyRef.current || next === requestedSurface) return;
    setRequestedSurface(next);
  };

  const selectPage = (key: string) => {
    if (busyRef.current) return;
    setSelection({ kind: "page", key });
    setTab("content");
    bumpPreview();
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
    webOrigin: WEB_ORIGIN,
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

  return (
    <>
      <BuilderShell
        restaurantId={restaurantId}
        restaurantName={loaded.restaurant.name}
        status={saveStatus}
        previewStatus={previewStatus}
        device={device}
        publicUrl={publicUrl}
        publishedAt={loaded.draft.published_at}
        canPublish={previewCovered && allErrors.length === 0}
        busy={busy}
        onDeviceChange={changeDevice}
        onDiscard={discard}
        onPublish={publish}
        rail={
          <div className={busy ? "pointer-events-none opacity-60" : ""}>
          <PageRail
            pages={state.pages}
            selection={selection}
            onSelectSite={() => {
              if (busyRef.current) return;
              setSelection({ kind: "site" });
              setTab("content");
              bumpPreview();
            }}
            onSelectPage={selectPage}
            onCreate={() => setDialogOpen(true)}
            onDuplicate={duplicateSelectedPage}
            onMove={(key, direction) =>
              setLocalState(movePage(state, key, direction))
            }
            onDelete={deleteSelectedPage}
          />
          </div>
        }
        inspector={
          <div className={busy ? "pointer-events-none opacity-60" : ""}>
            {globalError ? (
              <div
                role="alert"
                className="m-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"
              >
                <p>{globalError}</p>
                {saveStatus === "error" ? (
                  <button
                    type="button"
                    onClick={retrySave}
                    className="mt-2 font-bold underline"
                  >
                    Réessayer l’enregistrement
                  </button>
                ) : null}
              </div>
            ) : null}
            {notice ? (
              <div
                role="status"
                className="m-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800"
              >
                {notice}
              </div>
            ) : null}
            <Inspector
              restaurantId={restaurantId}
              restaurant={loaded.restaurant}
              restaurantLogoUrl={loaded.restaurant.logo_url}
              state={state}
              selection={selection}
              tab={tab}
              surface={surface}
              menus={loaded.menus}
              services={loaded.services}
              catalog={loaded.catalog}
              catalogWarning={loaded.catalogWarning}
              errors={allErrors}
              onTabChange={setTab}
              onSurfaceChange={changeSurface}
              onConfigChange={updateConfig}
              onPageChange={updatePage}
              onPageReplace={replacePage}
              onSectionChange={updateSection}
              onMakeDefault={(key) =>
                setLocalState(makeDefaultPage(state, key))
              }
              onMakeHomepage={(key) =>
                setLocalState(makeHomepagePage(state, key))
              }
              onStoriesNavigationAvailabilityChange={
                updateStoriesNavigationAvailability
              }
              onRestaurantLogoUpload={uploadMainLogo}
              onRestaurantLogoRemove={removeMainLogo}
            />
          </div>
        }
        preview={
          <PreviewCanvas
            webOrigin={WEB_ORIGIN}
            restaurantSlug={loaded.restaurant.slug}
            restaurantId={restaurantId}
            state={withWebsiteV3PreviewNavigationState(
              state,
              storiesNavigationAvailable,
            )}
            activePage={activePage}
            activeSectionKey={activeSectionKey}
            device={device}
            surface={surface}
            onSurfaceChange={changeSurface}
            revision={previewRevision}
            contentRevision={contentRevision}
            onAcknowledged={acknowledgePreview}
            onNavigatePage={selectPage}
            onSelectSection={(key) => {
              if (busyRef.current) return;
              setSelection({
                kind: "section",
                pageKey: pageKey(activePage),
                sectionKey: key,
              });
              setTab("content");
              bumpPreview();
            }}
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
            onDeleteSection={deleteSection}
          />
        }
      />
      <PageDialog
        open={dialogOpen && !busy}
        pages={state.pages}
        menus={loaded.menus}
        services={loaded.services}
        onClose={() => setDialogOpen(false)}
        onCreate={createPage}
      />
    </>
  );
}

function resolveSelectedPage(
  state: DraftStatePayload,
  selection: RailSelection,
): DraftPagePayload | null {
  if (selection.kind === "site") {
    return (
      state.pages.find((page) => page.type === "landing") ??
      state.pages[0] ??
      null
    );
  }
  const key = selection.kind === "page" ? selection.key : selection.pageKey;
  return state.pages.find((page) => pageKey(page) === key) ?? state.pages[0] ?? null;
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
    state.pages.find((candidate) => candidate.type === "landing") ??
    state.pages[0];
  return page ? { kind: "page", key: pageKey(page) } : { kind: "site" };
}

function sectionsForPage(
  state: DraftStatePayload,
  page: DraftPagePayload,
): DraftSectionPayload[] {
  return state.sections
    .filter((section) => sectionBelongs(section, page))
    .sort((a, b) => a.sort_order - b.sort_order);
}

function sectionBelongs(
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

function readError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Une erreur inattendue a interrompu l’opération.";
}

function BuilderLoading() {
  return (
    <div className="hidden h-screen items-center justify-center bg-[#171b22] lg:flex">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#d7ff4f]" />
        <p className="mt-4 text-sm font-medium text-slate-300">
          Préparation du Website Builder V3…
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
    <div className="hidden h-screen items-center justify-center bg-[#171b22] p-8 lg:flex">
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
