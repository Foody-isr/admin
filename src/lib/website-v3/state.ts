import type {
  DraftPagePayload,
  DraftResponse,
  DraftSectionPayload,
  DraftStatePayload,
  FieldError,
  StatePath,
  WebsitePageType,
} from "./types";
import { pageKey, sectionKey } from "./types";

const RESERVED_SLUGS = new Set([
  "order",
  "catering",
  "checkout",
  "tracking",
  "account",
  "table",
  "api",
]);

export function isTechnicalSitePage(page: DraftPagePayload): boolean {
  return page.slug === "_site" || page.title.trim().toLowerCase() === "_site";
}

/** Normalizes an API response into the strict V3 editor contract. */
export function normalizeDraftResponse(response: {
  state: unknown;
  draft_dirty: boolean;
  draft_saved_at?: string | null;
  published_at?: string | null;
}): DraftResponse {
  const source = response;
  return {
    draft_dirty: Boolean(source.draft_dirty),
    draft_saved_at: source.draft_saved_at,
    published_at: source.published_at,
    state: normalizeDraftState(source.state),
  };
}

/** Normalizes legacy and partial API payloads into strict V3 state. */
export function normalizeDraftState(state: unknown): DraftStatePayload {
  const source = isRecord(state) ? state : {};
  return {
    config: isRecord(source.config) ? source.config : {},
    pages: Array.isArray(source.pages) ? source.pages.map(normalizePage) : [],
    sections: Array.isArray(source.sections)
      ? source.sections.map(normalizeSection)
      : [],
    deleted_section_ids: uniquePositiveIds(source.deleted_section_ids),
    deleted_page_ids: uniquePositiveIds(source.deleted_page_ids),
  };
}

/** Repairs legacy V2 page artifacts before the V3 editor autosaves them. */
export function reconcileLegacyWebsiteDraft(
  state: DraftStatePayload,
  references: { menuIds: number[]; serviceIds: number[] },
  publishedPages: unknown[] = [],
): { state: DraftStatePayload; changed: boolean } {
  const normalizedPublishedPages = normalizeDraftState({
    pages: publishedPages,
  }).pages;
  const sourcePages =
    state.pages.length > 0
      ? state.pages
      : normalizedPublishedPages.length > 0
        ? normalizedPublishedPages
        : legacyPagesFromSections(state.sections);
  const technicalPages = sourcePages.filter(isTechnicalSitePage);
  const technicalPageIDs = new Set(
    technicalPages.flatMap((page) => page.id === undefined ? [] : [page.id]),
  );
  const keptPages = sourcePages.filter((page) => !isTechnicalSitePage(page));
  const reservedReplacements = new Map<number | string, string>();
  const usedSlugs = new Set(
    keptPages
      .map((page) => normalizeSlug(page.slug))
      .filter((slug) => slug !== "order" && slug !== "catering"),
  );

  const pages = keptPages.map((page) => {
    let slug = normalizeSlug(page.slug);
    const originalSlug = slug;
    if (
      (slug === "order" && page.type === "order") ||
      (slug === "catering" && page.type === "catering")
    ) {
      slug = nextAvailableSlug(
        page.type === "order" ? "commander" : "traiteur",
        usedSlugs,
      );
      reservedReplacements.set(page.id ?? page.tmp_id ?? page.slug, slug);
      reservedReplacements.set(originalSlug, slug);
    }
    usedSlugs.add(slug);

    if (page.type === "order") {
      return {
        ...page,
        slug,
        settings: {
          menu_ids:
            page.settings.menu_ids.length > 0
              ? page.settings.menu_ids
              : uniquePositiveIds(references.menuIds),
        },
      };
    }
    if (page.type === "catering") {
      return {
        ...page,
        slug,
        settings: {
          service_ids:
            page.settings.service_ids.length > 0
              ? page.settings.service_ids
              : uniquePositiveIds(references.serviceIds),
        },
      };
    }
    return { ...page, slug };
  }) as DraftPagePayload[];

  for (const type of ["order", "catering"] as const) {
    const candidates = pages
      .filter((page) => page.type === type)
      .sort((left, right) => left.sort_order - right.sort_order);
    if (candidates.length > 0 && !candidates.some((page) => page.is_default)) {
      const defaultKey = pageKey(candidates[0]);
      for (const page of pages) {
        if (pageKey(page) === defaultKey) page.is_default = true;
      }
    }
  }

  const pageSlugByID = new Map(
    pages.flatMap((page) =>
      page.id === undefined ? [] : [[page.id, page.slug] as const],
    ),
  );
  const pageSlugByTmpID = new Map(
    pages.flatMap((page) =>
      page.tmp_id ? [[page.tmp_id, page.slug] as const] : [],
    ),
  );
  const sections = state.sections.map((section) => {
    if (
      section.page === "_site" ||
      (section.page_id !== undefined && technicalPageIDs.has(section.page_id))
    ) {
      return {
        ...section,
        page: "_site",
        page_id: undefined,
        page_tmp_id: undefined,
      };
    }
    const replacementSlug = reservedReplacements.get(section.page);
    const page =
      (section.page_id !== undefined
        ? pages.find((candidate) => candidate.id === section.page_id)
        : undefined) ??
      (section.page_tmp_id
        ? pages.find((candidate) => candidate.tmp_id === section.page_tmp_id)
        : undefined) ??
      pages.find(
        (candidate) =>
          candidate.slug === section.page ||
          (replacementSlug !== undefined &&
            candidate.slug === replacementSlug),
      );
    const replacement =
      page?.slug ??
      (section.page_id !== undefined
        ? pageSlugByID.get(section.page_id)
        : undefined) ??
      (section.page_tmp_id
        ? pageSlugByTmpID.get(section.page_tmp_id)
        : undefined) ??
      reservedReplacements.get(section.page);
    if (!replacement) return section;
    return {
      ...section,
      page: replacement,
      page_id: page?.id,
      page_tmp_id: page?.id === undefined ? page?.tmp_id : undefined,
    };
  });
  const nextState: DraftStatePayload = {
    ...state,
    pages: pages
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((page, index) => ({ ...page, sort_order: index })),
    sections,
    deleted_page_ids: uniquePositiveIds([
      ...state.deleted_page_ids,
      ...technicalPages.flatMap((page) =>
        page.id === undefined ? [] : [page.id],
      ),
    ]),
  };
  return {
    state: nextState,
    changed: JSON.stringify(nextState) !== JSON.stringify(state),
  };
}

/** Clones only the arrays and objects along a state path. */
export function updateDraftAtPath(
  state: DraftStatePayload,
  path: StatePath,
  value: unknown,
): DraftStatePayload {
  if (path.length === 0) {
    if (!isRecord(value)) throw new Error("Draft root must be an object");
    return value as DraftStatePayload;
  }
  return cloneWithValue(state, path, 0, value) as DraftStatePayload;
}

/** Converts a page while clearing settings that are illegal for its new type. */
export function convertPageType(
  page: DraftPagePayload,
  nextType: WebsitePageType,
): DraftPagePayload {
  const base = {
    ...page,
    type: nextType,
    is_default:
      nextType === "order" || nextType === "catering"
        ? page.type === nextType && page.is_default
        : false,
  };
  switch (nextType) {
    case "landing":
      return { ...base, type: "landing", settings: {} };
    case "content":
      return { ...base, type: "content", settings: {} };
    case "order":
      return {
        ...base,
        type: "order",
        settings: {
          menu_ids: page.type === "order" ? [...page.settings.menu_ids] : [],
        },
      };
    case "catering":
      return {
        ...base,
        type: "catering",
        settings: {
          service_ids:
            page.type === "catering" ? [...page.settings.service_ids] : [],
        },
      };
  }
}

/** Deletes a page and all sections canonically attached to it. */
export function removePage(
  state: DraftStatePayload,
  targetKey: string,
): DraftStatePayload {
  const page = state.pages.find((candidate) => pageKey(candidate) === targetKey);
  if (!page) return state;

  const removedSections = state.sections.filter((section) =>
    sectionBelongsToPage(section, page),
  );
  return {
    ...state,
    pages: reindexPages(
      state.pages.filter((candidate) => pageKey(candidate) !== targetKey),
    ),
    sections: state.sections.filter(
      (section) => !removedSections.includes(section),
    ),
    deleted_page_ids:
      page.id === undefined
        ? state.deleted_page_ids
        : uniquePositiveIds([...state.deleted_page_ids, page.id]),
    deleted_section_ids: uniquePositiveIds([
      ...state.deleted_section_ids,
      ...removedSections.flatMap((section) =>
        section.id === undefined ? [] : [section.id],
      ),
    ]),
  };
}

/** Duplicates a page and its sections using draft-only stable identities. */
export function duplicatePage(
  state: DraftStatePayload,
  targetKey: string,
  createId: () => string,
): { state: DraftStatePayload; page: DraftPagePayload } | null {
  const page = state.pages.find((candidate) => pageKey(candidate) === targetKey);
  if (!page || page.type === "landing") return null;
  const tmpId = `page-${createId()}`;
  const clone = normalizePage({
    ...page,
    id: undefined,
    tmp_id: tmpId,
    title: `${page.title} — copie`,
    slug: uniqueSlug(`${page.slug}-copie`, state.pages),
    sort_order: state.pages.length,
    is_default: false,
  });
  const clonedSections = state.sections
    .filter((section) => sectionBelongsToPage(section, page))
    .map((section, index) => ({
      ...section,
      id: undefined,
      tmp_id: `section-${createId()}`,
      page: clone.slug,
      page_id: undefined,
      page_tmp_id: tmpId,
      sort_order: index,
      content: { ...section.content },
      settings: { ...section.settings },
    }));
  return {
    page: clone,
    state: {
      ...state,
      pages: [...state.pages, clone],
      sections: [...state.sections, ...clonedSections],
    },
  };
}

/** Reorders pages and recomputes contiguous sort orders. */
export function movePage(
  state: DraftStatePayload,
  targetKey: string,
  direction: -1 | 1,
): DraftStatePayload {
  const pages = [...state.pages].sort((a, b) => a.sort_order - b.sort_order);
  const currentIndex = pages.findIndex((page) => pageKey(page) === targetKey);
  const nextIndex = currentIndex + direction;
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= pages.length
  ) {
    return state;
  }
  [pages[currentIndex], pages[nextIndex]] = [pages[nextIndex], pages[currentIndex]];
  return { ...state, pages: reindexPages(pages) };
}

/** Makes one commerce page primary and clears its same-type siblings. */
export function makeDefaultPage(
  state: DraftStatePayload,
  targetKey: string,
): DraftStatePayload {
  const target = state.pages.find((page) => pageKey(page) === targetKey);
  if (!target || (target.type !== "order" && target.type !== "catering")) {
    return state;
  }
  return {
    ...state,
    pages: state.pages.map((page) => ({
      ...page,
      is_default:
        page.type === target.type ? pageKey(page) === targetKey : page.is_default,
    })) as DraftPagePayload[],
  };
}

/** Returns publish-blocking field errors keyed to the field registry. */
export function validateDraftForPublish(
  state: DraftStatePayload,
  references?: { menuIds: ReadonlySet<number>; serviceIds: ReadonlySet<number> },
): FieldError[] {
  const errors: FieldError[] = [];
  const slugs = new Map<string, string>();
  const landingPages = state.pages.filter((page) => page.type === "landing");

  if (landingPages.length !== 1) {
    errors.push({
      fieldId: "page.type",
      message: "Le site doit contenir exactement une page d’accueil.",
      pageKey: landingPages[0] ? pageKey(landingPages[0]) : undefined,
      tab: "settings",
    });
  }

  state.pages.forEach((page) => {
    const key = pageKey(page);
    const slug = normalizeSlug(page.slug);
    if (!page.title.trim()) {
      errors.push({
        fieldId: "page.title",
        message: "Le nom de la page est requis.",
        pageKey: key,
        tab: "content",
      });
    }
    if (!slug) {
      errors.push({
        fieldId: "page.slug",
        message: "L’adresse de la page est requise.",
        pageKey: key,
        tab: "settings",
      });
    } else if (RESERVED_SLUGS.has(slug)) {
      errors.push({
        fieldId: "page.slug",
        message: "Cette adresse est réservée par Foody.",
        pageKey: key,
        tab: "settings",
      });
    } else if (slugs.has(slug)) {
      errors.push({
        fieldId: "page.slug",
        message: "Cette adresse est déjà utilisée par une autre page.",
        pageKey: key,
        tab: "settings",
      });
    } else {
      slugs.set(slug, key);
    }

    if (page.type === "order" && page.settings.menu_ids.length === 0) {
      errors.push({
        fieldId: "page.settings.menu_ids",
        message: "Sélectionnez au moins une carte.",
        pageKey: key,
        tab: "settings",
      });
    } else if (page.type === "order" && references) {
      const broken = page.settings.menu_ids.filter(
        (id) => !references.menuIds.has(id),
      );
      if (broken.length > 0) {
        errors.push({
          fieldId: "page.settings.menu_ids",
          message: `Retirez ou remplacez les cartes indisponibles : ${broken.join(", ")}.`,
          pageKey: key,
          tab: "settings",
        });
      }
    }
    if (
      page.type === "catering" &&
      page.settings.service_ids.length === 0
    ) {
      errors.push({
        fieldId: "page.settings.service_ids",
        message: "Sélectionnez au moins une prestation traiteur.",
        pageKey: key,
        tab: "settings",
      });
    } else if (page.type === "catering" && references) {
      const broken = page.settings.service_ids.filter(
        (id) => !references.serviceIds.has(id),
      );
      if (broken.length > 0) {
        errors.push({
          fieldId: "page.settings.service_ids",
          message: `Retirez ou remplacez les prestations indisponibles : ${broken.join(", ")}.`,
          pageKey: key,
          tab: "settings",
        });
      }
    }
    if (
      (page.type === "landing" || page.type === "content") &&
      page.is_default
    ) {
      errors.push({
        fieldId: "page.is_default",
        message: "Seules les pages commande et traiteur peuvent être principales.",
        pageKey: key,
        tab: "settings",
      });
    }
  });

  (["order", "catering"] as const).forEach((type) => {
    const candidates = state.pages.filter((page) => page.type === type);
    const defaults = candidates.filter((page) => page.is_default);
    if (candidates.length > 0 && defaults.length !== 1) {
      errors.push({
        fieldId: "page.is_default",
        message: `Choisissez une page ${type === "order" ? "commande" : "traiteur"} principale.`,
        pageKey: pageKey(defaults[0] ?? candidates[0]),
        tab: "settings",
      });
    }
  });

  state.sections.forEach((section) => {
    const valid = state.pages.some((page) => sectionBelongsToPage(section, page));
    if (!valid) {
      errors.push({
        fieldId: "section.page_id",
        message: "Cette section n’est reliée à aucune page.",
        sectionKey: sectionKey(section),
        tab: "settings",
      });
    }
  });

  return errors;
}

/** Maps server validation errors back to deterministic field identifiers. */
export function mapWebsiteDraftError(error: unknown): FieldError | null {
  const message =
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof error.details === "string" &&
    error.details.trim()
      ? error.details
      : error instanceof Error
        ? error.message
        : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("reserved slug")) {
    return { fieldId: "page.slug", message, tab: "settings" };
  }
  if (normalized.includes("at least one menu")) {
    return {
      fieldId: "page.settings.menu_ids",
      message,
      tab: "settings",
    };
  }
  if (normalized.includes("at least one service")) {
    return {
      fieldId: "page.settings.service_ids",
      message,
      tab: "settings",
    };
  }
  if (
    normalized.includes("default") &&
    (normalized.includes("unique") ||
      normalized.includes("at most one") ||
      normalized.includes("is allowed"))
  ) {
    return { fieldId: "page.is_default", message, tab: "settings" };
  }
  if (normalized.includes("section") && normalized.includes("page")) {
    return { fieldId: "section.page_id", message, tab: "settings" };
  }
  return null;
}

/** Produces a URL-safe lowercase slug without deciding uniqueness. */
export function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Checks whether deleting this page would remove the only default of its type. */
export function canDeletePage(
  state: DraftStatePayload,
  targetKey: string,
): boolean {
  const target = state.pages.find((page) => pageKey(page) === targetKey);
  if (!target || target.type === "landing") return false;
  if (!target.is_default) return true;
  return state.pages.some(
    (page) =>
      pageKey(page) !== targetKey &&
      page.type === target.type,
  );
}

function normalizePage(value: unknown): DraftPagePayload {
  const page = isRecord(value) ? value : {};
  const legacySettings = isRecord(page.settings) ? page.settings : {};
  const legacyCommerce =
    legacySettings.commerce === "classic" ||
    legacySettings.commerce === "order"
      ? "order"
      : legacySettings.commerce === "catering"
        ? "catering"
        : null;
  const type: WebsitePageType =
    page.type === "landing" ||
    page.type === "order" ||
    page.type === "catering"
      ? page.type
      : legacyCommerce ?? "content";
  const base = {
    id: positiveInteger(page.id),
    tmp_id: typeof page.tmp_id === "string" ? page.tmp_id : undefined,
    type,
    slug: typeof page.slug === "string" ? page.slug : "",
    title: typeof page.title === "string" ? page.title : "",
    sort_order: Number.isInteger(page.sort_order) ? Number(page.sort_order) : 0,
    nav_visible:
      typeof page.nav_visible === "boolean" ? page.nav_visible : true,
    is_default: typeof page.is_default === "boolean" ? page.is_default : false,
    seo: isRecord(page.seo) ? { ...page.seo } : {},
    appearance_overrides: isRecord(page.appearance_overrides)
      ? { ...page.appearance_overrides }
      : {},
  };
  if (type === "order") {
    const raw = isRecord(page.settings) ? page.settings.menu_ids : [];
    return {
      ...base,
      type,
      settings: { menu_ids: uniquePositiveIds(raw) },
    };
  }
  if (type === "catering") {
    const raw = isRecord(page.settings) ? page.settings.service_ids : [];
    return {
      ...base,
      type,
      settings: { service_ids: uniquePositiveIds(raw) },
    };
  }
  if (type === "landing") {
    return { ...base, type: "landing", settings: {} };
  }
  return { ...base, type: "content", settings: {} };
}

function normalizeSection(value: unknown): DraftSectionPayload {
  const section = isRecord(value) ? value : {};
  return {
    id: positiveInteger(section.id),
    tmp_id: typeof section.tmp_id === "string" ? section.tmp_id : undefined,
    section_type:
      typeof section.section_type === "string" ? section.section_type : "text",
    page: typeof section.page === "string" ? section.page : "",
    page_id: positiveInteger(section.page_id),
    page_tmp_id:
      typeof section.page_tmp_id === "string"
        ? section.page_tmp_id
        : undefined,
    sort_order: Number.isInteger(section.sort_order)
      ? Number(section.sort_order)
      : 0,
    is_visible:
      typeof section.is_visible === "boolean" ? section.is_visible : true,
    layout: typeof section.layout === "string" ? section.layout : "default",
    content: isRecord(section.content) ? { ...section.content } : {},
    settings: isRecord(section.settings) ? { ...section.settings } : {},
  };
}

function sectionBelongsToPage(
  section: DraftSectionPayload,
  page: DraftPagePayload,
): boolean {
  if (
    section.section_type === "footer" &&
    section.page === "_site" &&
    section.page_id === undefined &&
    section.page_tmp_id === undefined
  ) {
    return true;
  }
  if (section.page_id !== undefined || section.page_tmp_id !== undefined) {
    return (
      (page.id !== undefined && section.page_id === page.id) ||
      (!!page.tmp_id && section.page_tmp_id === page.tmp_id)
    );
  }
  return section.page === page.slug;
}

function reindexPages(pages: DraftPagePayload[]): DraftPagePayload[] {
  return pages.map((page, index) => ({ ...page, sort_order: index }));
}

function uniqueSlug(base: string, pages: DraftPagePayload[]): string {
  const taken = new Set(pages.map((page) => normalizeSlug(page.slug)));
  const normalized = normalizeSlug(base) || "page";
  if (!taken.has(normalized)) return normalized;
  let suffix = 2;
  while (taken.has(`${normalized}-${suffix}`)) suffix += 1;
  return `${normalized}-${suffix}`;
}

function nextAvailableSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function legacyPagesFromSections(
  sections: DraftSectionPayload[],
): DraftPagePayload[] {
  const sectionSlugs = Array.from(
    new Set(
      sections
        .map((section) => normalizeSlug(section.page))
        .filter((slug) => slug && slug !== "_site"),
    ),
  );
  const slugs = sectionSlugs.includes("home")
    ? sectionSlugs
    : ["home", ...sectionSlugs];
  const pages: DraftPagePayload[] = [];
  slugs.forEach((slug, index) => {
    const base = {
      tmp_id: `legacy-page-${slug}`,
      slug,
      title:
        slug === "home"
          ? "Accueil"
          : slug
              .split("-")
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" "),
      sort_order: index,
      nav_visible: true,
      is_default: false,
      seo: {},
      appearance_overrides: {},
    };
    if (slug === "home") {
      pages.push({ ...base, type: "landing", settings: {} });
      return;
    }
    if (slug === "order") {
      pages.push({ ...base, type: "order", settings: { menu_ids: [] } });
      return;
    }
    if (slug === "catering") {
      pages.push({
        ...base,
        type: "catering",
        settings: { service_ids: [] },
      });
      return;
    }
    pages.push({ ...base, type: "content", settings: {} });
  });
  return pages;
}

function uniquePositiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is number =>
          Number.isInteger(entry) && Number(entry) > 0,
      ),
    ),
  );
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0
    ? Number(value)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneWithValue(
  source: unknown,
  path: StatePath,
  index: number,
  value: unknown,
): unknown {
  if (index === path.length) return value;
  const segment = path[index];
  if (Array.isArray(source)) {
    if (typeof segment !== "number") {
      throw new Error(`Expected an array index, received ${String(segment)}`);
    }
    const clone = [...source];
    clone[segment] = cloneWithValue(source[segment], path, index + 1, value);
    return clone;
  }
  const record = isRecord(source) ? source : {};
  return {
    ...record,
    [String(segment)]: cloneWithValue(
      record[String(segment)],
      path,
      index + 1,
      value,
    ),
  };
}
