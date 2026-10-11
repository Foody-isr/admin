import type { DraftPagePayload, DraftStatePayload } from "./types";
import { pageKey } from "./types";
import { makeDefaultPage, makeHomepagePage, updateWebsitePageAtPath } from "./state";
import { addNavigationPage, removeNavigationPage, retargetNavigationPage } from "./navigation-links";

/** Applies staged page metadata and commerce settings without touching appearance or identity. */
export function applyPageSettings(state: DraftStatePayload, key: string, staged: DraftPagePayload): DraftStatePayload {
  const previous = state.pages.find(page => pageKey(page) === key);
  if (!previous) return state;
  let next = state;
  for (const field of ["title", "slug", "nav_visible", "seo", "settings"] as const) {
    next = updateWebsitePageAtPath(next, key, [field], staged[field], {slugManuallyEdited: true});
  }
  if (staged.is_default && !previous.is_default) next = makeDefaultPage(next, key);
  if (staged.is_homepage && !previous.is_homepage) next = makeHomepagePage(next, key);
  const updated = next.pages.find(page => pageKey(page) === key)!;
  next = retargetNavigationPage(next, previous.slug, updated.slug);
  if (previous.nav_visible !== updated.nav_visible) {
    next = updated.nav_visible ? addNavigationPage(next, updated) : removeNavigationPage(next, updated.slug);
  }
  return next;
}
