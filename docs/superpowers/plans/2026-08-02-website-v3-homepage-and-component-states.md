# Website V3 Homepage and Component States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a true site homepage, page-level navigation overrides, stateful category and CTA styling, editable footer appearance, and Menu Highlights card colors with identical iframe and published rendering.

**Architecture:** Persist homepage identity as a first-class `WebsitePage.is_homepage` flag while preserving `is_default` for canonical commerce aliases. Store visual extensions in the existing sparse page and section JSON contracts, then resolve them through shared Foody Web helpers used by preview and public pages. Keep global defaults intact and layer page or section overrides only when explicitly configured.

**Tech Stack:** Go 1.21, Gin, GORM, PostgreSQL migrations, Next.js 14, React 18, TypeScript, Zod, Tailwind CSS, Node test runner, Playwright.

## Global Constraints

- Work only on `develop`; never push directly to `main`.
- Do not modify any applied migration; create migration `149_website_page_homepage.sql`.
- Preserve the unrelated dirty Foody Admin files already in the workspace and never stage them.
- Keep `is_default` exclusively for canonical `/order` and `/catering` aliases.
- Exactly one published non-deleted V3 page must have `is_homepage=true` after deterministic legacy recovery.
- Missing new appearance fields must preserve the current public output.
- The Website Builder remains unavailable on mobile; public mobile rendering must consume the new settings.
- Every production behavior begins with a failing automated test and uses the same renderer in iframe preview and public pages.

---

## File Map

### Foody Server

- `migrations/149_website_page_homepage.sql`: add and backfill `is_homepage`, then enforce one homepage per restaurant with a partial unique index.
- `migrations/149_website_page_homepage_test.go`: verify deterministic migration ranking and uniqueness.
- `internal/common/models.go`: expose `WebsitePage.IsHomepage` in the API model.
- `internal/restaurants/website_draft.go`: round-trip, recover, validate, and atomically publish homepage state.
- `internal/restaurants/website_page_contract.go`: normalize legacy drafts with no homepage and reject multiple homepages.
- `internal/restaurants/website_page_backfill.go`: assign a homepage after page materialization without changing commerce defaults.
- `internal/restaurants/website_page_contract_test.go`, `website_draft_test.go`, `website_page_backfill_test.go`: contract, transaction, and compatibility coverage.

### Foody Admin

- `src/lib/website-v3/types.ts`: add homepage and sparse visual override types.
- `src/lib/api.ts`: extend the shared `WebsiteConfig.navbar_cta` response type without altering request/auth logic.
- `src/lib/i18n.tsx`: add English, Hebrew, and French labels for every new builder control.
- `src/lib/website-v3/state.ts`: normalize, select, switch, and protect homepage pages.
- `src/lib/website-v3/__tests__/state.test.ts`: state transition and legacy recovery tests.
- `src/components/website-v3/WebsiteV3Builder.tsx`: wire homepage selection to the inspector.
- `src/components/website-v3/PageInspector.tsx`: expose homepage, canonical commerce, restaurant-name, footer, category, and page CTA controls.
- `src/components/website-v3/SiteInspector.tsx`: expose global footer and CTA defaults.
- `src/components/website-v3/SectionInspector.tsx`: expose Menu Highlights section palette.
- `src/components/website-v3/NavigationCtaEditor.tsx`: shared global/page CTA state editor.
- `src/components/website-v3/FooterEditor.tsx`: shared footer content and appearance controls.
- `src/components/website-v3/CategoryBarStateEditor.tsx`: normal/sticky palette editor.
- `src/components/website-v3/MenuHighlightsAppearanceEditor.tsx`: section-scoped card palette editor.
- `src/components/website-v3/field-contracts.ts`: preview field hooks for new controls.
- `src/components/website-v3/__tests__/appearance-editors.test.tsx`, `page-addresses.test.tsx`, `field-contracts.test.ts`: UI contract coverage.

### Foody Web

- `lib/websiteV3Api.ts`: parse `is_homepage` and typed sparse appearance values.
- `lib/websiteV3Rendering.ts`: select a homepage and compute its public destination.
- `lib/websiteV3PageContext.ts`: load homepage context instead of selecting any landing page.
- `app/r/[restaurantId]/page.tsx`: render a landing homepage or redirect to the selected page address.
- `lib/websiteV3Appearance.ts`: merge page restaurant-name, CTA, and category state overrides.
- `components/PageAppearanceScope.tsx`: publish page-scoped category CSS variables.
- `components/SiteNavbar.tsx`: resolve page/global name and CTA presentation for transparent and solid states.
- `components/CategoryTabs.tsx`: consume separate normal and sticky category variables.
- `components/sections/FooterSection.tsx`: render the expanded global footer palette.
- `components/sections/MenuHighlightsSection.tsx`: render section-scoped card variables.
- `lib/__tests__/website-v3-api.test.ts`, `website-v3-alias.test.ts`, `website-v3-appearance.test.ts`, `site-navbar.test.ts`: routing and resolver coverage.
- `lib/__tests__/website-v3-section-styles.test.ts`: footer and Menu Highlights style helper coverage.

---

### Task 1: Persist Homepage Identity

**Files:**
- Create: `foodyserver/migrations/149_website_page_homepage.sql`
- Create: `foodyserver/migrations/149_website_page_homepage_test.go`
- Modify: `foodyserver/internal/common/models.go:2608`

**Interfaces:**
- Produces: `WebsitePage.IsHomepage bool` serialized as `is_homepage`.
- Produces: unique partial index `idx_website_pages_rid_homepage` on `restaurant_id WHERE is_homepage = TRUE`.

- [ ] **Step 1: Write the failing migration test**

Create a PostgreSQL migration test following migration 147's isolated-schema pattern. Seed landing, default order, default catering, and content combinations and assert this ranking:

```go
wantHomepage := map[int64]bool{
	10: true,  // restaurant 1 landing wins
	11: false, // restaurant 1 default order
	20: true,  // restaurant 2 default order wins without landing
	30: true,  // restaurant 3 default catering wins without landing/order
	40: true,  // restaurant 4 first sort_order/id wins
}
```

Also attempt a transaction that sets a second page homepage for restaurant 1 and require a unique-index error.

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
cd foodyserver
go test ./migrations -run TestMigration149AssignsOneHomepagePerRestaurant -count=1
```

Expected: FAIL because `149_website_page_homepage.sql` does not exist.

- [ ] **Step 3: Add the migration**

Implement the migration with deterministic ranking:

```sql
ALTER TABLE website_pages
    ADD COLUMN IF NOT EXISTS is_homepage BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY restaurant_id
               ORDER BY
                   CASE
                       WHEN type = 'landing' THEN 0
                       WHEN type = 'order' AND is_default THEN 1
                       WHEN type = 'catering' AND is_default THEN 2
                       ELSE 3
                   END,
                   sort_order,
                   id
           ) AS position
    FROM website_pages
), winners AS (
    SELECT id FROM ranked WHERE position = 1
)
UPDATE website_pages
SET is_homepage = website_pages.id IN (SELECT id FROM winners);

CREATE UNIQUE INDEX IF NOT EXISTS idx_website_pages_rid_homepage
    ON website_pages (restaurant_id)
    WHERE is_homepage = TRUE;
```

- [ ] **Step 4: Add the model field**

Add immediately after `IsDefault`:

```go
// IsHomepage selects the single page opened from the restaurant root route.
IsHomepage bool `gorm:"not null;default:false" json:"is_homepage"`
```

- [ ] **Step 5: Run migration and model validation**

Run:

```bash
cd foodyserver
gofmt -w migrations/149_website_page_homepage_test.go internal/common/models.go
go test ./migrations -run TestMigration149AssignsOneHomepagePerRestaurant -count=1
go test ./internal/common -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit the persistence contract**

```bash
cd foodyserver
git add migrations/149_website_page_homepage.sql migrations/149_website_page_homepage_test.go internal/common/models.go
git commit -m "feat: persist website homepage identity"
```

---

### Task 2: Recover and Publish One Homepage Atomically

**Files:**
- Modify: `foodyserver/internal/restaurants/website_draft.go`
- Modify: `foodyserver/internal/restaurants/website_page_contract.go`
- Modify: `foodyserver/internal/restaurants/website_page_backfill.go`
- Modify: `foodyserver/internal/restaurants/website_page_contract_test.go`
- Modify: `foodyserver/internal/restaurants/website_draft_test.go`
- Modify: `foodyserver/internal/restaurants/website_page_backfill_test.go`

**Interfaces:**
- Produces: `DraftPagePayload.IsHomepage bool` with JSON key `is_homepage`.
- Produces: `normalizeHomepageSelection([]DraftPagePayload) ([]DraftPagePayload, error)`.
- Produces: `selectHomepageCandidate([]DraftPagePayload) int`, returning the winner index or `-1` for no pages.
- Consumes: `WebsitePage.IsHomepage` from Task 1.

- [ ] **Step 1: Write failing contract tests**

Add table-driven cases proving:

```go
{
	name: "landing wins legacy recovery",
	pages: []DraftPagePayload{
		{ID: 1, Type: "order", IsDefault: true},
		{ID: 2, Type: "landing"},
	},
	wantHomepageID: 2,
},
{
	name: "multiple explicit homepages fail",
	pages: []DraftPagePayload{
		{ID: 1, Type: "landing", IsHomepage: true},
		{ID: 2, Type: "content", IsHomepage: true},
	},
	wantError: "exactly one homepage",
},
```

Add a publish test where a new temporary order page becomes homepage, the old landing homepage is cleared, and the order page remains the only order `is_default` target. Add a rollback assertion by forcing a later section failure.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd foodyserver
go test ./internal/restaurants -run 'TestValidateAndNormalizeWebsiteDraft_.*Homepage|TestPublishDraft_.*Homepage|TestBackfillWebsitePages_.*Homepage' -count=1
```

Expected: compile failure because `IsHomepage` is absent from `DraftPagePayload`.

- [ ] **Step 3: Extend the draft and navigation payloads**

Add `IsHomepage` to `DraftPagePayload`, `websiteNavigationPage`, `applyPagePayload`, and `pageToPayload`:

```go
IsHomepage bool `json:"is_homepage"`
```

Include `is_homepage` in the denormalized config pages JSON so legacy navigation consumers preserve the information without using it as a route alias.

- [ ] **Step 4: Implement deterministic normalization**

Implement the pure candidate order exactly once:

```go
func homepagePriority(page DraftPagePayload) int {
	switch {
	case page.Type == "landing":
		return 0
	case page.Type == "order" && page.IsDefault:
		return 1
	case page.Type == "catering" && page.IsDefault:
		return 2
	default:
		return 3
	}
}
```

If no page is explicitly homepage, sort candidates by priority, `SortOrder`, then stable ID/tmp ID and set exactly one winner. If more than one is explicit, return `errDraftValidation` with `published pages require exactly one homepage`.

- [ ] **Step 5: Enforce publication after page upserts**

Before page upserts, clear `is_homepage` for the restaurant inside the existing transaction. Save each normalized page's final flag. After inserts and deletes, query:

```go
var homepageCount int64
err := tx.Model(&common.WebsitePage{}).
	Where("restaurant_id = ? AND is_homepage = ?", restaurantID, true).
	Count(&homepageCount).Error
```

Require `homepageCount == 1`. Keep this validation in the same transaction as sections and config so any later failure restores the original homepage.

- [ ] **Step 6: Extend boot backfill**

After existing page recovery and section linkage, group restaurants with pages but no homepage. Select landing, default order, default catering, then first page by `sort_order, id`. Update only `is_homepage`; do not alter `is_default`.

- [ ] **Step 7: Verify GREEN and regression safety**

```bash
cd foodyserver
gofmt -w internal/restaurants/website_draft.go internal/restaurants/website_page_contract.go internal/restaurants/website_page_backfill.go internal/restaurants/*website*_test.go
go test ./internal/restaurants -count=1
go test ./internal/restaurants -race -count=1
```

Expected: PASS, including slug collision and legacy page identity tests.

- [ ] **Step 8: Commit the server behavior**

```bash
cd foodyserver
git add internal/restaurants/website_draft.go internal/restaurants/website_page_contract.go internal/restaurants/website_page_backfill.go internal/restaurants/website_page_contract_test.go internal/restaurants/website_draft_test.go internal/restaurants/website_page_backfill_test.go
git commit -m "feat: publish one website homepage"
```

---

### Task 3: Add Homepage and Page Override State to the Builder

**Files:**
- Modify: `foodyadmin/src/lib/website-v3/types.ts`
- Modify: `foodyadmin/src/lib/i18n.tsx`
- Modify: `foodyadmin/src/lib/website-v3/state.ts`
- Modify: `foodyadmin/src/lib/website-v3/__tests__/state.test.ts`
- Modify: `foodyadmin/src/components/website-v3/WebsiteV3Builder.tsx`
- Modify: `foodyadmin/src/components/website-v3/PageInspector.tsx`
- Modify: `foodyadmin/src/components/website-v3/__tests__/page-addresses.test.tsx`

**Interfaces:**
- Produces: `DraftPageBase.is_homepage: boolean`.
- Produces: `makeHomepagePage(state, targetKey): DraftStatePayload`.
- Produces: `canDeletePage` returning `false` for the homepage.
- Produces: `DraftAppearanceOverrides.hide_navbar_name?: boolean`.
- Consumes: server `is_homepage` from Task 2.

- [ ] **Step 1: Write failing state tests**

Add tests with real state transitions:

```ts
test("makeHomepagePage selects one page without changing commerce defaults", () => {
  const state = validState();
  const result = makeHomepagePage(state, "2");
  assert.deepEqual(
    result.pages.map((page) => [page.id, page.is_homepage, page.is_default]),
    [[1, false, false], [2, true, true], [3, false, true]],
  );
});

test("the homepage cannot be deleted", () => {
  assert.equal(canDeletePage(validState(), "1"), false);
});
```

Add normalization cases for missing `is_homepage` and multiple explicit values.

- [ ] **Step 2: Run state tests and verify RED**

```bash
cd foodyadmin
npx tsx --test src/lib/website-v3/__tests__/state.test.ts
```

Expected: compile failure because `is_homepage` and `makeHomepagePage` do not exist.

- [ ] **Step 3: Extend types and normalization**

Add:

```ts
is_homepage: boolean;
```

to `DraftPageBase`. Define the CTA types:

```ts
export type NavbarCtaSurfaceStyle = {
  variant?: "filled" | "outline" | "ghost";
  bg?: string;
  text_color?: string;
  border_color?: string;
};

export type NavbarCtaOverride = {
  enabled?: boolean;
  text?: string;
  link?: string;
  shape?: "pill" | "rounded" | "square";
  size?: "sm" | "md" | "lg";
  bg?: string;
  text_color?: string;
  border_color?: string;
  variant?: "filled" | "outline" | "ghost";
  transparent?: NavbarCtaSurfaceStyle;
  solid?: NavbarCtaSurfaceStyle;
};
```

Then add these fields to `DraftAppearanceOverrides`:

```ts
hide_navbar_name?: boolean;
navbar_cta?: NavbarCtaOverride;
```

to `DraftAppearanceOverrides`. Normalize missing homepage values with the same landing/default-order/default-catering/sort ranking as the server.

- [ ] **Step 4: Implement state transitions**

Implement:

```ts
export function makeHomepagePage(
  state: DraftStatePayload,
  targetKey: string,
): DraftStatePayload {
  if (!state.pages.some((page) => pageKey(page) === targetKey)) return state;
  return {
    ...state,
    pages: state.pages.map((page) => ({
      ...page,
      is_homepage: pageKey(page) === targetKey,
    })) as DraftPagePayload[],
  };
}
```

Make duplicated/new pages non-homepage. Keep converted pages' homepage state. Reject deletion of the homepage in `canDeletePage` before commerce checks.

- [ ] **Step 5: Wire the builder and inspector**

Add `onMakeHomepage` through `Inspector` to `PageInspector`. Under **Adresse et type**, render:

```tsx
<ToggleField
  fieldId="page.is_homepage"
  label="Page d’entrée du site"
  description="Page ouverte depuis l’adresse principale du restaurant."
  checked={page.is_homepage}
  onChange={(checked) => checked && onMakeHomepage()}
/>
```

Rename the commerce toggle to **Page commande principale** or **Page traiteur principale** and keep its description tied to `/order` or `/catering`.

Add a three-state restaurant-name select under page navigation settings. Map inherit to deleting `appearance_overrides.hide_navbar_name`, show to `false`, and hide to `true`.

Add and consume the `websiteV3Homepage`, `websiteV3HomepageDescription`, `websiteV3OrderPrimary`, `websiteV3CateringPrimary`, `websiteV3InheritSite`, `websiteV3ShowRestaurantName`, and `websiteV3HideRestaurantName` keys in all three locale dictionaries. Do not add new hardcoded user-facing copy.

- [ ] **Step 6: Run focused Admin tests**

```bash
cd foodyadmin
npx tsx --test src/lib/website-v3/__tests__/state.test.ts src/components/website-v3/__tests__/page-addresses.test.tsx
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit builder page state**

Stage only Website V3 files; do not stage the pre-existing dirty Admin files:

```bash
cd foodyadmin
git add src/lib/website-v3/types.ts src/lib/website-v3/state.ts src/lib/website-v3/__tests__/state.test.ts src/components/website-v3/WebsiteV3Builder.tsx src/components/website-v3/PageInspector.tsx src/components/website-v3/__tests__/page-addresses.test.tsx
git add -p src/lib/i18n.tsx
git commit -m "feat: configure the website entry page"
```

---

### Task 4: Build the Appearance Editors

**Files:**
- Create: `foodyadmin/src/components/website-v3/NavigationCtaEditor.tsx`
- Create: `foodyadmin/src/components/website-v3/FooterEditor.tsx`
- Create: `foodyadmin/src/components/website-v3/CategoryBarStateEditor.tsx`
- Create: `foodyadmin/src/components/website-v3/MenuHighlightsAppearanceEditor.tsx`
- Create: `foodyadmin/src/components/website-v3/__tests__/appearance-editors.test.tsx`
- Modify: `foodyadmin/src/components/website-v3/SiteInspector.tsx`
- Modify: `foodyadmin/src/components/website-v3/PageInspector.tsx`
- Modify: `foodyadmin/src/components/website-v3/SectionInspector.tsx`
- Modify: `foodyadmin/src/components/website-v3/field-contracts.ts`
- Modify: `foodyadmin/src/components/website-v3/__tests__/field-contracts.test.ts`
- Modify: `foodyadmin/src/lib/api.ts`
- Modify: `foodyadmin/src/lib/i18n.tsx`

**Interfaces:**
- Produces: `NavbarCtaOverride` with `transparent` and `solid` `NavbarCtaSurfaceStyle` objects.
- Produces: `CategoryBarPalette` with `bg`, `text`, `accent`, and `divider`.
- Produces: footer section settings `custom_muted`, `custom_accent`, `custom_divider`.
- Produces: Menu Highlights settings `card_bg`, `card_text`, `card_muted`, `price_color`, `accent_color`.

- [ ] **Step 1: Write failing editor markup tests**

Render each editor with `react-dom/server` and assert stable field IDs:

```ts
assert.match(markup, /site\.footer\.settings\.custom_bg/);
assert.match(markup, /page\.appearance_overrides\.section_colors\.categoryBarSticky\.bg/);
assert.match(markup, /page\.appearance_overrides\.navbar_cta\.transparent\.variant/);
assert.match(markup, /section\.settings\.card_bg/);
```

Extend field-contract tests so every new ID maps to the exact draft state path.

- [ ] **Step 2: Run editor tests and verify RED**

```bash
cd foodyadmin
npx tsx --test src/components/website-v3/__tests__/appearance-editors.test.tsx src/components/website-v3/__tests__/field-contracts.test.ts
```

Expected: module-not-found failures for the four new editor components.

- [ ] **Step 3: Implement `NavigationCtaEditor`**

Accept:

```ts
type NavigationCtaEditorProps = {
  value: NavbarCtaOverride;
  inherited?: NavbarCtaOverride;
  allowInherit: boolean;
  onChange: (value: NavbarCtaOverride | undefined) => void;
};
```

Edit content (`enabled`, `text`, `link`, `shape`, `size`) only for the global instance. For both global and page instances, edit `transparent` and `solid` surface fields: variant, background, text, border. Hide color fields for inherited page state until customization is enabled.

Extend the shared `WebsiteConfig.navbar_cta` type in `src/lib/api.ts` with `border_color`, `transparent`, and `solid` using the same surface shape. Preserve all existing API helper and authentication hunks in that already-dirty file.

- [ ] **Step 4: Implement `FooterEditor`**

Accept the footer section and a tab. Content mode edits `custom_text`, `show_logo`, `show_description`, `show_address`, `show_phone`, `show_hours`, and `social_links`. Appearance mode edits `layout`, `color_style`, `custom_bg`, `custom_text`, `custom_muted`, `custom_accent`, and `custom_divider`.

Mount it from `SiteInspector` in content and appearance tabs. Keep the existing site tagline group above footer content.

- [ ] **Step 5: Implement category state palettes**

`CategoryBarStateEditor` receives the page `section_colors`. Always show **Position normale**. Add an **Apparence sticky personnalisée** toggle; disabling it deletes `categoryBarSticky`. Missing sticky fields visually display inherited normal values but remain absent from the payload.

Mount it only for order pages in `PageInspector`'s appearance tab.

- [ ] **Step 6: Implement Menu Highlights palette**

Mount `MenuHighlightsAppearanceEditor` from `SectionInspector` only when `section.section_type === "menu_highlights"`. Edit section/card/text/price/accent values independently and leave empty inputs absent or empty so Foody Web falls back to theme tokens.

- [ ] **Step 7: Wire CTA global and page editors**

Replace the site CTA label-only field with the full global editor. Add the page CTA override editor beneath page navbar colors. Page values merge over `config.navbar_cta` and offer a single **Hériter du site** reset.

- [ ] **Step 8: Extend preview field contracts**

Add exact mappings such as:

```ts
page("page.appearance_overrides.hide_navbar_name", ["appearance_overrides", "hide_navbar_name"], "nav", "text"),
page("page.appearance_overrides.section_colors.categoryBarSticky.bg", ["appearance_overrides", "section_colors", "categoryBarSticky", "bg"], "order", "color"),
section("section.settings.card_bg", ["settings", "card_bg"], "menu_highlights", "color"),
```

Add English, Hebrew, and French translations for footer content/appearance, CTA transparent/solid states, normal/sticky category palettes, and Menu Highlights palette labels. Consume them through `useI18n()` in every new editor.

- [ ] **Step 9: Verify all Admin Website V3 tests**

```bash
cd foodyadmin
npm test -- src/lib/website-v3 src/components/website-v3
npm run lint
npx tsc --noEmit
```

Expected: PASS without modifying unrelated Admin files.

- [ ] **Step 10: Commit appearance editors**

```bash
cd foodyadmin
git add src/components/website-v3 src/lib/website-v3/types.ts
git add -p src/lib/api.ts src/lib/i18n.tsx
git commit -m "feat: edit website component state styles"
```

Before committing, inspect `git diff --cached --name-only` and unstage any path outside Website V3.

---

### Task 5: Route the Public Root to the Homepage

**Files:**
- Modify: `foodyweb/lib/websiteV3Api.ts`
- Modify: `foodyweb/lib/websiteV3Rendering.ts`
- Modify: `foodyweb/lib/websiteV3PageContext.ts`
- Modify: `foodyweb/app/r/[restaurantId]/page.tsx`
- Modify: `foodyweb/lib/__tests__/website-v3-api.test.ts`
- Modify: `foodyweb/lib/__tests__/website-v3-alias.test.ts`

**Interfaces:**
- Produces: `WebsiteV3BasePage.is_homepage: boolean`.
- Produces: `resolveHomepagePage(pages): WebsiteV3Page | null`.
- Produces: `homepagePublicPath(page): "/order" | "/catering" | string | null` where `null` means render landing at root.
- Consumes: public server page payload from Task 2.

- [ ] **Step 1: Write failing public contract tests**

Extend strict API fixtures with `is_homepage`. Add route resolution cases:

```ts
test("default order homepage resolves to the canonical order route", () => {
  assert.equal(homepagePublicPath(orderPage({ is_homepage: true, is_default: true })), "/order");
});

test("content homepage resolves to its slug", () => {
  assert.equal(homepagePublicPath(contentPage({ is_homepage: true, slug: "about" })), "/about");
});

test("landing homepage renders at root", () => {
  assert.equal(homepagePublicPath(landingPage({ is_homepage: true })), null);
});
```

- [ ] **Step 2: Run API and alias tests and verify RED**

```bash
cd foodyweb
node --test --import tsx lib/__tests__/website-v3-api.test.ts lib/__tests__/website-v3-alias.test.ts
```

Expected: schema failure because `is_homepage` is not parsed and resolver functions do not exist.

- [ ] **Step 3: Parse homepage identity**

Add `is_homepage: boolean` to `WebsiteV3BasePage`, Zod schemas, bootstrap page, and every test fixture. Keep the schema strict so server drift is caught immediately.

- [ ] **Step 4: Implement pure route resolution**

```ts
export function resolveHomepagePage(pages: WebsiteV3Page[]): WebsiteV3Page | null {
  return pages.find((page) => page.is_homepage) ?? null;
}

export function homepagePublicPath(page: WebsiteV3Page): string | null {
  if (page.type === "landing") return null;
  return canonicalRedirectForPage(page) ?? `/${page.slug}`;
}
```

Do not infer homepage from `landingEnabled` once a published homepage exists.

- [ ] **Step 5: Update request context and root page**

Return `{ restaurant, page: resolveHomepagePage(pages), pages }` from `getWebsiteV3LandingContext`. In the route:

```tsx
const homepagePath = homepage ? homepagePublicPath(homepage) : null;
if (homepage && homepagePath) {
  redirect(buildWebsiteAliasTarget(params.restaurantId, homepagePath.slice(1), searchParams ?? {}));
}
if (homepage?.type === "landing") {
  return <WebsitePageRenderer restaurant={restaurant} page={homepage} pages={pages} searchParams={searchParams} />;
}
```

Retain the old `landingEnabled`/navigation fallback only when no page carries `is_homepage`, protecting requests during staggered deployment.

- [ ] **Step 6: Verify route tests and type safety**

```bash
cd foodyweb
node --test --import tsx lib/__tests__/website-v3-api.test.ts lib/__tests__/website-v3-alias.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit public homepage routing**

```bash
cd foodyweb
git add lib/websiteV3Api.ts lib/websiteV3Rendering.ts lib/websiteV3PageContext.ts app/r/[restaurantId]/page.tsx lib/__tests__/website-v3-api.test.ts lib/__tests__/website-v3-alias.test.ts
git commit -m "feat: route restaurant roots to their homepage"
```

---

### Task 6: Render Page and Component State Styles

**Files:**
- Modify: `foodyweb/lib/types.ts`
- Modify: `foodyweb/lib/themes/applyTheme.ts`
- Modify: `foodyweb/lib/websiteV3Appearance.ts`
- Modify: `foodyweb/components/PageAppearanceScope.tsx`
- Modify: `foodyweb/components/SiteNavbar.tsx`
- Modify: `foodyweb/components/CategoryTabs.tsx`
- Modify: `foodyweb/components/sections/FooterSection.tsx`
- Modify: `foodyweb/components/sections/MenuHighlightsSection.tsx`
- Modify: `foodyweb/lib/__tests__/website-v3-appearance.test.ts`
- Modify: `foodyweb/lib/__tests__/site-navbar.test.ts`
- Create: `foodyweb/lib/__tests__/website-v3-section-styles.test.ts`

**Interfaces:**
- Produces: `resolveNavbarCtaSurface(cta, transparent): NavbarCtaSurfaceStyle`.
- Produces: `pageAppearanceVariables(appearance): CSSProperties`.
- Produces: `footerStyleVariables(settings): CSSProperties`.
- Produces: `menuHighlightsStyleVariables(settings): CSSProperties`.
- Consumes: sparse Admin payloads from Tasks 3 and 4.

- [ ] **Step 1: Write failing resolver and token tests**

Assert the real public helper outputs:

```ts
assert.deepEqual(
  resolveNavbarCtaSurface(cta, true),
  { variant: "outline", bg: "transparent", text_color: "#ffffff", border_color: "#ffffff" },
);
assert.equal(pageAppearanceVariables(appearance)["--cat-sticky-bg"], "#111827");
assert.equal(menuHighlightsStyleVariables(settings)["--highlight-card-bg"], "#f8fafc");
assert.equal(footerStyleVariables(settings)["--footer-divider"], "#334155");
```

Add a merge test proving page `hide_navbar_name: false` overrides global `true`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd foodyweb
node --test --import tsx lib/__tests__/website-v3-appearance.test.ts lib/__tests__/site-navbar.test.ts lib/__tests__/website-v3-section-styles.test.ts
```

Expected: missing export failures.

- [ ] **Step 3: Extend public types and page merging**

Extend `SectionColors` with:

```ts
categoryBar?: { bg?: string; text?: string; accent?: string; divider?: string };
categoryBarSticky?: { bg?: string; text?: string; accent?: string; divider?: string };
```

Add page `hide_navbar_name` and `navbar_cta` to the page config merge field list. Preserve explicit `false` by checking property ownership rather than truthiness.

- [ ] **Step 4: Scope category variables to the page**

Have `pageAppearanceVariables` map normal and sticky palettes to:

```ts
"--cat-bg"
"--cat-text"
"--cat-accent"
"--cat-divider"
"--cat-sticky-bg"
"--cat-sticky-text"
"--cat-sticky-accent"
"--cat-sticky-divider"
```

Apply the returned style to `PageAppearanceScope`. Update global theme application to support the same keys for compatibility.

- [ ] **Step 5: Switch `CategoryTabs` by stuck state**

Use state-specific variables without duplicating markup:

```tsx
style={{
  backgroundColor: stuck
    ? "var(--cat-sticky-bg, var(--cat-bg, var(--surface)))"
    : "var(--cat-bg, var(--bg-page))",
  color: stuck
    ? "var(--cat-sticky-text, var(--cat-text, var(--text)))"
    : "var(--cat-text, var(--text))",
  borderColor: stuck
    ? "var(--cat-sticky-divider, var(--cat-divider, var(--divider)))"
    : "var(--cat-divider, transparent)",
}}
```

Expose active color through a local `--cat-current-accent` variable selected from sticky or normal accent and update the existing `.category-tab.active` token consumer to use it.

- [ ] **Step 6: Resolve CTA states and restaurant name**

Export a pure `resolveNavbarCtaSurface`. New state objects win; legacy top-level CTA values feed solid state; transparent state keeps current frosted defaults. Generate the Link style from the resolved state. Ensure `resolveNavbar` receives merged page appearance so explicit page `hide_navbar_name` wins over the global value.

- [ ] **Step 7: Render footer palette**

Map footer settings to section-local variables:

```ts
{
  "--footer-bg": settings.custom_bg,
  "--footer-text": settings.custom_text,
  "--footer-muted": settings.custom_muted,
  "--footer-accent": settings.custom_accent,
  "--footer-divider": settings.custom_divider,
}
```

Use these variables in all three footer layouts for text, muted copy, social buttons, and dividers. Existing color presets remain the fallback.

- [ ] **Step 8: Render Menu Highlights palette**

Apply section-scoped variables on the section root and replace fixed card tokens:

```ts
{
  "--highlight-card-bg": settings.card_bg,
  "--highlight-card-text": settings.card_text,
  "--highlight-card-muted": settings.card_muted,
  "--highlight-price": settings.price_color,
  "--highlight-accent": settings.accent_color,
}
```

Cards fall back to `--surface`, primary text to `--text`, muted text to `--text-muted`, and price/action to `--brand`.

- [ ] **Step 9: Verify focused and full Web suites**

```bash
cd foodyweb
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit public appearance rendering**

```bash
cd foodyweb
git add lib/types.ts lib/themes/applyTheme.ts lib/websiteV3Appearance.ts components/PageAppearanceScope.tsx components/SiteNavbar.tsx components/CategoryTabs.tsx components/sections/FooterSection.tsx components/sections/MenuHighlightsSection.tsx lib/__tests__
git commit -m "feat: render website component state styles"
```

---

### Task 7: Cross-Service E2E, Validation, and Develop Deployment

**Files:**
- Create: `foodyadmin/tests/website-v3/homepage-component-states.spec.ts`
- Modify: `foodyadmin/docs/superpowers/plans/2026-08-02-website-v3-homepage-and-component-states.md` only to check completed boxes during execution.

**Interfaces:**
- Consumes: all server, admin, and web contracts from Tasks 1–6.
- Produces: a reproducible develop verification covering draft, preview, publish, and public navigation.

- [x] **Step 1: Write the failing Playwright scenarios**

Add desktop builder scenarios that:

1. select an order page as **Page d’entrée du site** while leaving it the canonical order page;
2. set page restaurant name to **Afficher** while the global default is hidden;
3. configure different normal/sticky category colors;
4. configure transparent/solid CTA variants;
5. edit footer background/text and Menu Highlights card background;
6. assert each iframe hook changes before publish;
7. publish and assert the root redirects to `/order` and public components retain the chosen values.

Use stable `data-field-id`, `data-navbar-state`, `data-footer-text`, and section hook selectors rather than visual timing guesses.

- [x] **Step 2: Run E2E and verify RED before the final integration**

```bash
cd foodyadmin
npx playwright test tests/website-v3 --grep "homepage and component states"
```

Expected before all services are running together: FAIL at the first unavailable server/public contract.

Execution evidence (review fix): valid RED captured against Foody Web `998d1f1`, where the CTA exposed its navbar state but not `data-navbar-cta-variant`; the new transparent CTA assertion expected `outline` and received `null`.

- [x] **Step 3: Run complete service validation**

```bash
cd foodyserver
gofmt -w .
go build ./...
go vet ./...
go test ./... -race

cd ../foodyadmin
npm test
npm run lint
npx tsc --noEmit
npm run build

cd ../foodyweb
npm test
npm run lint
npx tsc --noEmit
npm run build
```

If the local server race suite shows the repository's known cross-package shared-database pollution, rerun every changed package independently with `-race -count=1` and require GitHub CI's isolated database run to pass before deployment.

- [x] **Step 4: Run local or develop E2E GREEN**

Start the three services against one environment, then run:

```bash
cd foodyadmin
npx playwright test tests/website-v3 --grep "homepage and component states"
```

Expected: PASS for iframe updates, publication, root redirect, and public styles.

Execution evidence (review fix): GREEN captured against Foody Web `3a1ae67`; the focused scenario passed with hidden/show restaurant-name checks, transparent/solid CTA variant checks, and published mobile sticky category checks.

- [x] **Step 5: Commit E2E coverage only**

```bash
cd foodyadmin
git add tests/website-v3
git commit -m "test: cover website homepage and state styles"
```

- [ ] **Step 6: Push in dependency order**

Confirm each repository is on `develop`, contains only intended commits, and is synchronized with origin. Push:

```bash
git -C foodyserver push origin develop
git -C foodyadmin push origin develop
git -C foodyweb push origin develop
```

Server goes first so Admin and Web never deploy against a missing `is_homepage` contract.

- [ ] **Step 7: Monitor all CI and deployments**

Use `gh run list` and `gh run watch --exit-status` in each repository. Require Test and Deploy Dev success for the server, Admin deployment success, and Web deployment success before announcing availability.

- [ ] **Step 8: Verify development manually**

On one restaurant with landing and order pages:

- publish landing as homepage and confirm `/r/:slug` renders it;
- publish order as homepage and confirm `/r/:slug` redirects once to `/r/:slug/order`;
- verify restaurant-name override, CTA surface transition, category sticky transition, footer palette, and Menu Highlights card palette;
- verify the same published settings on a public mobile viewport while the builder itself remains unavailable on mobile.

- [ ] **Step 9: Record deployment evidence**

Add final execution notes to the active Website V3 progress ledger with commit SHAs, CI run URLs, tested restaurant, and observed public routes. Do not mark the work complete until the authenticated publish and public follow-up both pass.
