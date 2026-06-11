/**
 * Per-tab page-state helpers for list pages that round-trip to an editor
 * route and back. Two pieces:
 *
 *  - a module-scope data cache so a remounting page renders its last known
 *    data instantly (then silently refetches for freshness) instead of
 *    flashing a full-page spinner and losing the user's place;
 *  - scroll save/restore against the layout's scrolling <main> element, so
 *    "edit → back" returns the user to the exact row they left.
 *
 * Both are session-local: the data cache dies with the JS context, scroll
 * offsets live in sessionStorage so they survive the route round-trip but
 * not a new tab.
 */

const dataCache = new Map<string, unknown>();

export function getPageCache<T>(key: string): T | undefined {
  return dataCache.get(key) as T | undefined;
}

export function setPageCache<T>(key: string, value: T): void {
  dataCache.set(key, value);
}

/** The admin layout's <main> is the app's only scroll container. */
function scrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('main');
}

/** Snapshot the scroll offset before navigating away to an editor route. */
export function saveScroll(key: string): void {
  const el = scrollContainer();
  if (!el) return;
  try {
    sessionStorage.setItem(`foody.scroll.${key}`, String(el.scrollTop));
  } catch {
    /* quota — ignore */
  }
}

/**
 * Restore a previously-saved offset, then clear it so a regular fresh visit
 * starts at the top. Call after the list has rendered with data (the content
 * must be tall enough for the offset to apply).
 */
export function restoreScroll(key: string): void {
  const el = scrollContainer();
  if (!el) return;
  try {
    const raw = sessionStorage.getItem(`foody.scroll.${key}`);
    if (raw == null) return;
    sessionStorage.removeItem(`foody.scroll.${key}`);
    const top = Number(raw);
    if (Number.isFinite(top)) el.scrollTop = top;
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}
