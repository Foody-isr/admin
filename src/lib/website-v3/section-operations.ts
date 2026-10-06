import {
  pageKey,
  sectionKey,
  type DraftPagePayload,
  type DraftSectionPayload,
  type DraftStatePayload,
} from "./types";

/** Inserts a candidate immediately before the footer without changing the current draft. */
export function insertSection(
  state: DraftStatePayload,
  page: DraftPagePayload,
  candidate: DraftSectionPayload,
  afterKey?: string,
): DraftStatePayload {
  const ordered = sectionsForPage(state, page);
  const after = afterKey
    ? ordered.findIndex((section) => sectionKey(section) === afterKey)
    : -1;
  const footer = ordered.findIndex(
    (section) => section.section_type === "footer",
  );
  const position =
    after >= 0 ? after + 1 : footer >= 0 ? footer : ordered.length;
  ordered.splice(position, 0, candidate);
  const ids = new Set(ordered.map(sectionKey));
  return {
    ...state,
    sections: [
      ...state.sections.filter((section) => !ids.has(sectionKey(section))),
      ...ordered.map((section, sort_order) => ({ ...section, sort_order })),
    ],
  };
}

/** Copies section content with a new identity and keeps it beside its source. */
export function duplicateSection(
  state: DraftStatePayload,
  page: DraftPagePayload,
  key: string,
  newKey: string,
): DraftStatePayload {
  const source = sectionsForPage(state, page).find(
    (section) => sectionKey(section) === key,
  );
  if (!source || source.section_type === "footer") return state;
  const copy: DraftSectionPayload = JSON.parse(JSON.stringify(source));
  delete copy.id;
  copy.tmp_id = newKey;
  copy.settings = { ...copy.settings, anchor: `section-${newKey}` };
  copy.page = page.slug;
  copy.page_id = page.id;
  copy.page_tmp_id = page.tmp_id;
  return insertSection(state, page, copy, key);
}

/** Reorders sections only inside the current page; cross-page drag payloads are ignored. */
export function reorderSection(
  state: DraftStatePayload,
  page: DraftPagePayload,
  sourceKey: string,
  targetKey: string,
): DraftStatePayload {
  if (!pageKey(page) || sourceKey === targetKey) return state;
  const ordered = sectionsForPage(state, page);
  const source = ordered.findIndex(
    (section) => sectionKey(section) === sourceKey,
  );
  const target = ordered.findIndex(
    (section) => sectionKey(section) === targetKey,
  );
  if (
    source < 0 ||
    target < 0 ||
    ordered[source].section_type === "footer" ||
    ordered[target].section_type === "footer"
  )
    return state;
  const [moving] = ordered.splice(source, 1);
  ordered.splice(target, 0, moving);
  const positions = new Map(
    ordered.map((section, index) => [sectionKey(section), index]),
  );
  return {
    ...state,
    sections: state.sections.map((section) =>
      positions.has(sectionKey(section))
        ? { ...section, sort_order: positions.get(sectionKey(section))! }
        : section,
    ),
  };
}

/** Returns the ordered sections owned by one page. */
export function sectionsForPage(
  state: DraftStatePayload,
  page: DraftPagePayload,
): DraftSectionPayload[] {
  return state.sections
    .filter((section) => !section.settings.theme_retired && sectionBelongs(section, page))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Resolves persisted and temporary page identities before legacy slugs. */
export function sectionBelongs(
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

/** Shared chrome and the primary banner are hidden rather than deleted. */
export function canDeleteSection(section: DraftSectionPayload): boolean {
  return section.section_type !== "footer" && section.section_type !== "hero_banner";
}
