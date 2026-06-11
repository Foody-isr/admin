# In-place updates & return navigation (cartes + articles)

**Date:** 2026-06-11
**Status:** Approved (user validated approach, scope, and exact-scroll-restore)

## Problem

1. On the carte detail page (`menu/menus/[menuId]`), every edit calls `reload()` which sets
   `loading = true`, replacing the whole page with a spinner and remounting the list —
   scroll position is lost. Reload also re-expands every group, discarding the user's
   collapsed/expanded state.
2. Clicking an article row on a carte navigates to the article editor
   (`menu/items/[itemId]`), whose Back and post-save navigation are hardcoded to the
   article library (`menu/items`). The user is stranded on the library and must
   re-navigate to the carte manually.
3. The article library (`menu/items`) remounts when returning from the editor: data
   refetches behind a full spinner and scroll resets to top — even when nothing changed.

## Decisions (user-confirmed)

- **No new libraries** (no TanStack Query). Silent refetch + local state patches.
- **Editor stays a route**; it gains a `from` parameter and returns to the exact origin.
- **Exact scroll position restored** when coming back (carte and library).
- **Scope:** carte detail page, article library page, article editor. Other admin pages
  unchanged.

## Design

### 1. Silent refetch (carte detail page)

- The full-page spinner renders only while there is no data yet (first load).
- `reload()` no longer sets `loading = true`; it refetches in the background while the
  current list stays mounted. A small inline spinner next to the title indicates syncing.
- Group expanded/collapsed state is initialized once (first load), not on every reload.
- Known-outcome edits patch local state immediately (delete group, remove item(s) from
  group, move items between groups, add items from the picker modal), then a silent
  refetch reconciles with the server. On API error: refetch restores the truth.

### 2. Return navigation (`from` parameter)

- Carte item rows navigate to `/{rid}/menu/items/{id}?from=<encoded current path>` and
  stash the item in sessionStorage (same `openEditor` pattern as the library) so the
  editor opens populated.
- The editor reads `from`; Back and post-save navigate to `from` when it is an internal
  path (starts with `/`), otherwise fall back to `/{rid}/menu/items`.

### 3. Instant remount + scroll restore (library and carte)

- A small helper module `src/lib/page-state.ts` provides:
  - a module-scope data cache (`getPageCache` / `setPageCache`) so a page remounting
    after edit→back renders instantly with the last known data, then silently refetches;
  - scroll save/restore against the layout's scrolling `<main>` element
    (`saveScroll(key)` before navigating away, `restoreScroll(key)` once data is
    rendered). Keys include the restaurant id and page identity.
- The library page seeds `categories` from the cache (no spinner on cache hit) and
  refetches silently; the carte page does the same for its menus + items data.
- Scroll is saved when navigating to the editor and restored after the first
  data-bearing render on return.

## Error handling

- Local patches are optimistic only for already-confirmed server calls (the patch runs
  after `await`), so no rollback machinery is needed; the silent refetch reconciles any
  drift. Failed calls keep their existing `alert(...)` paths.

## Validation

- `npm run lint && npx tsc --noEmit` in foodyadmin.
- Manual: edit on carte (delete/remove/reorder/add) keeps scroll; carte → article →
  back lands on the same carte at the same scroll offset; library → article → back
  keeps filters (existing) + scroll (new) with no full spinner.
