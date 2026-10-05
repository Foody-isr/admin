import type { DraftStatePayload } from "./types";
/** Keeps explicit navigation targets attached when a page slug is edited. */
export function retargetNavigationPage(
  state: DraftStatePayload,
  previous: string,
  next: string,
): DraftStatePayload {
  if (previous === next) return state;
  const layout = state.config.nav_layout;
  if (!layout || typeof layout !== "object") return state;
  const record = layout as Record<string, unknown>;
  return {
    ...state,
    config: {
      ...state.config,
      nav_layout: {
        ...record,
        ...(Array.isArray(record.links)
          ? {
              links: (record.links as Record<string, unknown>[]).map((link) =>
                link.page_slug === previous
                  ? { ...link, page_slug: next }
                  : link,
              ),
            }
          : {}),
        ...(record.theme_pages && typeof record.theme_pages === "object"
          ? {
              theme_pages: Object.fromEntries(
                Object.entries(record.theme_pages).map(([role, slug]) => [
                  role,
                  slug === previous ? next : slug,
                ]),
              ),
            }
          : {}),
      },
    },
  };
}

/** Adds the page to an explicitly edited navigation without changing legacy automatic navigation. */
export function addNavigationPage(
  state: DraftStatePayload,
  page: DraftStatePayload["pages"][number],
): DraftStatePayload {
  const layout = state.config.nav_layout as Record<string, unknown> | undefined;
  if (
    !page.nav_visible ||
    !layout ||
    !Array.isArray(layout.links) ||
    layout.links.some((link) => link.page_slug === page.slug)
  )
    return state;
  return {
    ...state,
    config: {
      ...state.config,
      nav_layout: {
        ...layout,
        links: [
          ...layout.links,
          {
            id: `page-${page.id ?? page.tmp_id}`,
            label: page.title,
            page_slug: page.slug,
          },
        ],
      },
    },
  };
}
