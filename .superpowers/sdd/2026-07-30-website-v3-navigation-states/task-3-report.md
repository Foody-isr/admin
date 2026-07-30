# Task 3 Report — Website V3 Desktop Preview Viewport

## Scope

- Added a pure desktop preview layout resolver with a fixed 1280 CSS-pixel logical width.
- Scaled the desktop iframe from its top-left corner to fit its available builder canvas while preserving its visible height.
- Kept the 390-pixel mobile frame unchanged.
- Extended navigation E2E coverage to assert the iframe viewport and all fixture links rendered inline on desktop.

## Implementation

- `resolveDesktopPreviewLayout()` clamps the desktop scale to `(0, 1]` and derives the iframe's logical height from the available canvas.
- `PreviewCanvas` observes its desktop frame host with `ResizeObserver`, then renders a 1280-pixel iframe wrapper with the resolved scale and height.
- The existing navigation-visibility test now selects the mobile preview before opening the compact-menu drawer. Its visibility assertions are unchanged; desktop now intentionally renders inline links.

## TDD Evidence

1. Added `src/lib/website-v3/__tests__/preview-layout.test.ts` before creating the helper.
2. The requested `npm test -- src/lib/website-v3/__tests__/preview-layout.test.ts` command is unavailable because `package.json` has no `test` script.
3. Ran `node --experimental-strip-types --test src/lib/website-v3/__tests__/preview-layout.test.ts` and confirmed RED: `preview-layout` did not exist.
4. Added the minimal layout helper and verified GREEN with `../foodyweb/node_modules/.bin/tsx --test src/lib/website-v3/__tests__/preview-layout.test.ts`.
5. Added the desktop iframe and inline-link Playwright assertion before integrating scaling. The equivalent iframe-context assertion was required because the preview is intentionally cross-origin (`localhost:3003` → `localhost:3000`); it confirmed RED at `598`, not `1280`.
6. Added the `ResizeObserver` integration and verified the navigation suite GREEN with all three assertions passing.

## Validation

- `../foodyweb/node_modules/.bin/tsx --test src/lib/website-v3/__tests__/preview-layout.test.ts` — passed, 1 test.
- `npx playwright test tests/website-v3/navigation.spec.ts --project=desktop-chromium --reporter=line` — passed, 3 tests.
- `npx playwright test tests/website-v3/public-mobile.mobile-preview.spec.ts --project=mobile-preview-chromium` — passed, 2 tests.
- `npm run lint` — passed with existing unrelated warnings.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

## Files Included

- `src/lib/website-v3/preview-layout.ts`
- `src/lib/website-v3/__tests__/preview-layout.test.ts`
- `src/components/website-v3/PreviewCanvas.tsx`
- `tests/website-v3/navigation.spec.ts`
- `.superpowers/sdd/2026-07-30-website-v3-navigation-states/task-3-report.md`

## Notes

- The pre-existing external changes in `src/lib/api.ts`, `src/lib/i18n.tsx`, `src/components/Sidebar.tsx`, `src/app/[restaurantId]/settings/stock/`, `src/app/[restaurantId]/menu/items/[itemId]/page.tsx`, and `src/components/menu-item/ItemAvailabilityPanel.tsx` were not modified, staged, or committed.
- The E2E server emits existing warnings for a missing `payplus_recurring_uid` column and redundant Next.js fetch-cache options; neither affects these passing assertions.
