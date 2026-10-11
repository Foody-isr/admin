import { squareDefaultContent, squareDefaultSettings } from "./square-components";
import type { DraftSectionPayload, DraftStatePayload } from "./types";

/** Selects the public site's footer, falling back to a hidden one for editing. */
export function resolveSiteFooter(
  sections: readonly DraftSectionPayload[],
): DraftSectionPayload | null {
  const footers = sections.filter(
    (section) => section.section_type === "footer" && section.settings.theme_retired !== true,
  );
  return (
    footers.find((footer) => footer.page === "_site" && footer.is_visible) ??
    footers.find((footer) => footer.is_visible) ??
    footers.find((footer) => footer.page === "_site") ??
    footers[0] ??
    null
  );
}

/** Adds a shared draft footer only when no active or hidden footer exists. */
export function addSiteFooter(
  state: DraftStatePayload,
  temporaryId: string,
): DraftStatePayload {
  if (resolveSiteFooter(state.sections)) return state;
  return {
    ...state,
    sections: [
      ...state.sections,
      {
        tmp_id: temporaryId,
        section_type: "footer",
        page: "_site",
        sort_order: 0,
        is_visible: true,
        layout: "columns",
        content: squareDefaultContent("footer"),
        settings: squareDefaultSettings("footer"),
      },
    ],
  };
}
