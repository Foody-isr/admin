# Task 4 Report — Explicit Transparent and Hover Navbar States

## Scope

- Exposed the three supported Website V3 navbar styles in Foodyadmin: solid, always transparent, and transparent with a colored hover state.
- Kept the existing persistence model unchanged:
  - `navbar_color` is the overlay hover background.
  - `navbar_overlay_text_color` is the transparent/resting text color.
  - `navbar_text_color` is the solid/hover text color.
- Activated overlay rendering only when the first visible content-page section is a `hero_banner`.
- Exposed the current renderer state as `data-navbar-state="transparent|solid"`.
- Added editor-to-renderer field contracts and hooks for both navbar text colors.
- Added no API field, database field, or migration.

## Implementation

### Foodyadmin

- Updated the Navigation style labels to:
  - `Pleine`
  - `Toujours transparente`
  - `Transparente puis colorée au survol`
- Relabeled `navbar_color` as `Fond au survol` when overlay mode is selected.
- Added color controls for the resting/transparent and solid/hover text colors.
- Registered both text-color fields in the Website V3 field-contract test matrix.
- Extended the existing navigation E2E without changing or weakening its page-control or 1280-pixel viewport assertions.

### Foodyweb

- `ContentPage` now finds the first visible canonical section and passes `overHero` only when that section is a hero banner.
- `SiteNavbar` exposes its resolved transparent/solid state on the `<nav>` while retaining the existing overlay hover transition logic.
- Website V3 page field hooks now serialize `navbarOverlayTextColor` and `navbarTextColor`.

## TDD Evidence

1. Added the overlay E2E and both field-hook assertions before implementation.
2. Added a focused field-contract assertion before registering the new contracts.
3. Confirmed RED:
   - Foodyweb hooks: `data-field-site-navbar-overlay-text-color` was `undefined`.
   - Foodyadmin contracts: `site.navbar_overlay_text_color` was missing.
   - Navigation E2E: timed out waiting for the absent `site.navbar_overlay_text_color` editor control.
4. Implemented the minimal controls, contracts, hooks, hero detection, and renderer state attribute.
5. Confirmed GREEN:
   - Foodyweb test command passed all 131 tests.
   - Foodyadmin field-contract suite passed all 3 tests.
   - Focused navigation suite passed all 4 tests, including the unchanged 1280-pixel viewport assertion.

## Validation

### Foodyweb

- `npm test` — passed, 131 tests.
- `npm run lint` — passed with existing unrelated warnings.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

### Foodyadmin

- `npm run lint` — passed with existing unrelated warnings.
- `npx tsc --noEmit` — passed.
- `npx playwright test tests/website-v3/navigation.spec.ts --project=desktop-chromium` — passed, 4 tests.
- `npx playwright test tests/website-v3 --project=desktop-chromium` — 76 passed; one unrelated commerce-isolation test timed out after the browser session closed.
- Isolated retry of the failed commerce-isolation test — passed, 1 test in 23 seconds, with no code changes.
- `git diff --check` — passed.

## Files Included

### Foodyadmin

- `src/components/website-v3/SiteInspector.tsx`
- `src/components/website-v3/field-contracts.ts`
- `src/components/website-v3/__tests__/field-contracts.test.ts`
- `tests/website-v3/navigation.spec.ts`
- `.superpowers/sdd/2026-07-30-website-v3-navigation-states/task-4-report.md`

### Foodyweb

- `components/website-v3/ContentPage.tsx`
- `components/SiteNavbar.tsx`
- `lib/websiteV3FieldHooks.ts`
- `lib/__tests__/website-v3-field-hooks.test.ts`

## Commits

- Foodyweb: `e0821a1d09b8ff6e227d91e7a09235cc03e64d20` — `feat(website-v3): expose navbar overlay states`
- Foodyadmin: this report is included in the focused Task 4 commit.

## Notes

- The unrelated external Foodyadmin changes in `src/lib/api.ts`, `src/lib/i18n.tsx`, `src/components/Sidebar.tsx`, `src/app/[restaurantId]/settings/stock/`, `src/app/[restaurantId]/menu/items/[itemId]/page.tsx`, and `src/components/menu-item/ItemAvailabilityPanel.tsx` were not modified, staged, or committed.
- Existing E2E server warnings remain for the missing `payplus_recurring_uid` column and redundant Next.js fetch-cache options.
- No push, deployment, API change, or database change was performed.

## Round 1 Review Fixes

### Findings Resolved

- H1: Added the pure `visibleSectionsInRenderOrder` helper and used it for both section rendering and first-visible-hero detection. Reordered, hidden, and footer sections now follow one canonical sequence.
- M1: Overlay navigation enters its colored state when keyboard focus is anywhere within the navbar and returns to transparent when focus leaves.
- M2: Extended the navigation E2E with mouse-leave restoration, focus-enter/focus-leave transitions, and a reordered non-hero-first negative path.
- L1: Restricted resolved `NavbarSettings.style` to `solid | transparent | overlay`; legacy `custom` and `hidden` inputs remain accepted and normalize to `solid`, while the raw legacy style still feeds navigation-layout compatibility.

### Round 1 TDD Evidence

1. Added the helper/style unit tests and navigation E2E assertions before implementation.
2. Confirmed RED:
   - Focused Foodyweb tests failed because `custom` resolved as `custom` and `visibleSectionsInRenderOrder` did not exist.
   - Navigation E2E failed on keyboard focus remaining transparent and reordered non-hero content incorrectly retaining the transparent overlay.
3. Implemented the shared ordering helper, renderer-boundary normalization, and hover/focus interaction state.
4. Confirmed GREEN:
   - Focused Foodyweb unit tests: 11 passed.
   - Foodyweb full tests: 133 passed.
   - Foodyadmin navigation E2E: 5 passed, including the unchanged 1280-pixel viewport and page-control coverage.

### Round 1 Validation

- Foodyweb `npm test` — passed, 133 tests.
- Foodyweb `npm run lint` — passed with existing unrelated warnings.
- Foodyweb `npx tsc --noEmit` — passed.
- Foodyadmin `npx playwright test tests/website-v3/navigation.spec.ts --reporter=line` — passed, 5 tests.
- Foodyadmin `npm run lint` — passed with existing unrelated warnings.
- Foodyadmin `npm run typecheck` — passed.
- Both repositories `git diff --check` — passed.

### Round 1 Commit

- Foodyweb: `c881b09` — `fix(website-v3): correct navbar overlay states`
- Foodyadmin: this report and the navigation E2E changes are included in the focused Round 1 admin commit.

### Round 1 Notes

- No API, database, migration, deployment, or push changes were made.
- All unrelated Foodyadmin working-tree changes remain unstaged and excluded.
- Existing lint and E2E server warnings remain unchanged.
