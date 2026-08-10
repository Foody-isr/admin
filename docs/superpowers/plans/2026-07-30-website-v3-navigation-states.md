# Website V3 Navigation States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Website Builder V3 show a true desktop navbar preview, configurable transparent/hover states, and per-page navigation visibility controls.

**Architecture:** Keep the existing persisted navbar fields and make their state semantics explicit in Foodyadmin. Foodyweb will detect hero-backed pages for overlay rendering, while Foodyadmin will render the desktop iframe at a fixed 1280-pixel layout viewport and scale it to the available canvas.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Node test runner, Playwright.

## Global Constraints

- No database migration or new API field.
- `navbar_color` is the overlay hover background.
- `navbar_overlay_text_color` is the transparent-state text color.
- `navbar_text_color` is the solid/hover-state text color.
- Desktop preview layout width is exactly 1280 CSS pixels.
- Mobile preview behavior is unchanged and the builder remains unavailable on mobile.

---

### Task 1: Remove legacy technical pages

**Files:**
- Modify: `src/lib/website-v3/state.ts`
- Test: `src/lib/website-v3/__tests__/state.test.ts`

**Interfaces:**
- Produces: `isTechnicalSitePage(page: DraftPagePayload): boolean`
- Preserves: footer sections as global `_site` sections.

- [ ] **Step 1: Write the failing normalization test**

Add a state test whose page has `title: "_site"` and `slug: "site"`, with a footer section referencing its ID. Assert that reconciliation removes the page, adds its ID to `deleted_page_ids`, and detaches the footer to `page: "_site"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/website-v3/__tests__/state.test.ts`

Expected: FAIL because the title-based technical page remains in `pages`.

- [ ] **Step 3: Implement technical-page recognition**

Add:

```ts
function isTechnicalSitePage(page: DraftPagePayload): boolean {
  return page.slug === "_site" || page.title.trim().toLowerCase() === "_site";
}
```

Use it consistently for `technicalPages` and `keptPages`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/lib/website-v3/__tests__/state.test.ts`

Expected: PASS.

### Task 2: Add page visibility controls

**Files:**
- Modify: `src/components/website-v3/Inspector.tsx`
- Modify: `src/components/website-v3/SiteInspector.tsx`
- Test: `tests/website-v3/navigation.spec.ts`

**Interfaces:**
- `SiteInspector` consumes `pages: DraftPagePayload[]`.
- `SiteInspector` consumes `onPageVisibilityChange(key: string, visible: boolean): void`.
- Page switches use `data-field-id="site.navigation-page.<page-key>"`.

- [ ] **Step 1: Write the failing Playwright assertion**

Create `tests/website-v3/navigation.spec.ts` and assert that the Navigation inspector contains every non-technical fixture page with a checked switch matching `nav_visible`.

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run: `npx playwright test tests/website-v3/navigation.spec.ts --project=desktop-chromium`

Expected: FAIL because the page list does not exist.

- [ ] **Step 3: Render the page list**

Pass `state.pages` and a callback based on `onPageChange(key, ["nav_visible"], visible)` from `Inspector` to `SiteInspector`. Render title, `/<slug>`, page type, and a switch for each non-technical page sorted by `sort_order`.

- [ ] **Step 4: Verify live visibility**

Extend the E2E test to uncheck one page and assert its navbar link disappears in the iframe, then recheck it and assert the link returns.

- [ ] **Step 5: Run the focused E2E test and verify GREEN**

Run: `npx playwright test tests/website-v3/navigation.spec.ts --project=desktop-chromium`

Expected: PASS.

### Task 3: Render a true desktop preview viewport

**Files:**
- Create: `src/lib/website-v3/preview-layout.ts`
- Modify: `src/components/website-v3/PreviewCanvas.tsx`
- Test: `src/lib/website-v3/__tests__/preview-layout.test.ts`
- Test: `tests/website-v3/navigation.spec.ts`

**Interfaces:**
- Produces: `resolveDesktopPreviewLayout(width: number, height: number): { scale: number; logicalHeight: number }`.
- Desktop iframe exposes a 1280-pixel `window.innerWidth`.

- [ ] **Step 1: Write the failing layout unit test**

Assert:

```ts
assert.deepEqual(resolveDesktopPreviewLayout(640, 720), {
  scale: 0.5,
  logicalHeight: 1440,
});
```

- [ ] **Step 2: Run the focused unit test and verify RED**

Run: `npm test -- src/lib/website-v3/__tests__/preview-layout.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure layout helper**

Use `DESKTOP_PREVIEW_WIDTH = 1280`, clamp scale to `(0, 1]`, and divide available height by scale to preserve the visible canvas height.

- [ ] **Step 4: Integrate ResizeObserver scaling**

Observe the desktop preview container, apply the helper, set the iframe wrapper to 1280 logical pixels, and scale from the top-left. Keep the current 390-pixel mobile frame unchanged.

- [ ] **Step 5: Verify the actual iframe viewport**

Extend Playwright to assert:

```ts
await expect.poll(() =>
  builderPage.locator('iframe').evaluate(
    (frame) => (frame as HTMLIFrameElement).contentWindow?.innerWidth,
  ),
).toBe(1280);
```

Also assert the fixture’s inline page links are visible.

- [ ] **Step 6: Run unit and E2E tests and verify GREEN**

Run:

```bash
npm test -- src/lib/website-v3/__tests__/preview-layout.test.ts
npx playwright test tests/website-v3/navigation.spec.ts --project=desktop-chromium
```

Expected: PASS.

### Task 4: Make transparent and hover states explicit

**Files:**
- Modify: `src/components/website-v3/SiteInspector.tsx`
- Modify: `src/components/website-v3/field-contracts.ts`
- Modify: `../foodyweb/components/website-v3/ContentPage.tsx`
- Modify: `../foodyweb/components/SiteNavbar.tsx`
- Modify: `../foodyweb/lib/websiteV3FieldHooks.ts`
- Test: `tests/website-v3/navigation.spec.ts`
- Test: `../foodyweb/lib/__tests__/websiteV3FieldHooks.test.ts`

**Interfaces:**
- `navbar_style`: `solid | transparent | overlay`.
- `overlay` is transparent only when the first visible page section is `hero_banner`.
- Navbar state is exposed through `data-navbar-state="transparent|solid"`.

- [ ] **Step 1: Write the failing overlay E2E test**

Set style to `overlay`, hover background to `#ffffff`, resting text to `#ffffff`, and hover text to `#111111`. Assert transparent background before hover and white background plus dark text after hover.

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run: `npx playwright test tests/website-v3/navigation.spec.ts --project=desktop-chromium`

Expected: FAIL because V3 content pages do not activate hero overlay and the text-color controls are absent.

- [ ] **Step 3: Expose the three state options**

Update the style labels to:

```text
Pleine
Toujours transparente
Transparente puis colorée au survol
```

For overlay mode, label `navbar_color` as `Fond au survol`. Add color controls for `navbar_overlay_text_color` and `navbar_text_color`.

- [ ] **Step 4: Detect a hero-backed page**

In `ContentPage`, compute the first visible section and pass:

```tsx
overHero={firstVisibleSection?.sectionType === "hero_banner"}
```

- [ ] **Step 5: Expose renderer state**

Add `data-navbar-state={transparentNow ? "transparent" : "solid"}` to the `<nav>` and keep the existing hover transition logic for overlay mode. Add the two text-color fields to field hooks and contracts.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- lib/__tests__/websiteV3FieldHooks.test.ts
npx playwright test tests/website-v3/navigation.spec.ts --project=desktop-chromium
```

Expected: PASS.

### Task 5: Full verification and deployment

**Files:**
- Modify only if verification reveals a regression in changed code.

**Interfaces:**
- Produces deployable `develop` commits for Foodyadmin and Foodyweb.

- [ ] **Step 1: Run Foodyweb verification**

Run:

```bash
cd ../foodyweb
npm test
npm run lint
npx tsc --noEmit
```

- [ ] **Step 2: Run Foodyadmin verification**

Run:

```bash
cd ../foodyadmin
npm run lint
npx tsc --noEmit
npx playwright test tests/website-v3 --project=desktop-chromium
```

- [ ] **Step 3: Commit focused changes**

Create conventional commits in each affected repository without mixing unrelated changes.

- [ ] **Step 4: Push `develop` and monitor deployments**

Push Foodyweb and Foodyadmin only after all required checks pass. Wait for Vercel success.

- [ ] **Step 5: Smoke-test development**

Verify `/24/website-v3`, `/r/moulin-doree`, transparent/hover behavior, inline links, per-page visibility, and HTTP 200 responses.
