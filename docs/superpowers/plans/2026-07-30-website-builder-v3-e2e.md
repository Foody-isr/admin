# Website Builder V3 E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated `/website-v3` editor whose page, commerce, appearance, section, preview, draft, and publication fields work end-to-end across foodyadmin, foodyserver, and foodyweb.

**Architecture:** `WebsitePage` is the canonical page entity. The server owns validation, primary commerce-page resolution, draft publication, and public page lookup; foodyweb renders every page type through one page-aware renderer; foodyadmin edits the same canonical payload and proves field connectivity through a registry-driven Playwright suite. Existing `/website` and `/website-v2` remain unchanged for live comparison.

**Tech Stack:** Go 1.21, Gin, GORM/PostgreSQL, Next.js 14 App Router, React 18, TypeScript 5.4, Tailwind CSS, Node test runner, Playwright 1.59.

## Global Constraints

- Keep `/website` and `/website-v2` available and behaviorally unchanged.
- Add the new builder only at `/[restaurantId]/website-v3`.
- Do not expose the builder UI on mobile; customer preview must support desktop and mobile.
- Canonical public page URL is `/r/{restaurantSlug}/{pageSlug}`; the landing page remains `/r/{restaurantSlug}`.
- Reserve `/order` and `/catering` as compatibility aliases to explicit primary commerce pages.
- Supported page types are exactly `landing`, `content`, `order`, and `catering`.
- Order pages store only `{ menu_ids: number[] }`; catering pages store only `{ service_ids: number[] }`.
- `appearance_overrides` is the only canonical per-page appearance field.
- Sections attach canonically by `page_id` or `page_tmp_id`; the legacy string slug is compatibility-only.
- Every editable field must update draft state, receive a matching preview acknowledgement, survive reload, publish, and render publicly.
- Empty order or catering associations are invalid at publication time.
- Do not modify existing applied migrations; add `147_website_page_defaults.sql`.
- Do not overwrite unrelated dirty worktree changes.
- Do not commit unless the user explicitly authorizes commits; use review checkpoints instead.

---

## File Map

### Foodyserver

- `foodyserver/migrations/147_website_page_defaults.sql`: schema and compatibility data migration.
- `foodyserver/internal/common/models.go`: add `WebsitePage.IsDefault`.
- `foodyserver/internal/common/website_page_test.go`: model and page-type contract tests.
- `foodyserver/internal/restaurants/website_page_contract.go`: page settings normalization and payload validation.
- `foodyserver/internal/restaurants/website_page_contract_test.go`: validation matrix.
- `foodyserver/internal/restaurants/website_draft.go`: round-trip `is_default`, validate saves, publish transaction.
- `foodyserver/internal/restaurants/website_draft_test.go`: draft and transactional publication tests.
- `foodyserver/internal/restaurants/website_pages.go`: public page/default resolvers.
- `foodyserver/internal/restaurants/website_pages_test.go`: slug/default resolution tests.
- `foodyserver/internal/restaurants/handler.go`: public page-by-slug and default-page handlers.
- `foodyserver/cmd/server/main.go`: register public routes.
- `foodyserver/cmd/websitev3seed/main.go`: deterministic local E2E fixture command.

### Foodyweb

- `foodyweb/lib/websiteV3Api.ts`: strict page contract and public lookup functions.
- `foodyweb/lib/__tests__/website-v3-api.test.ts`: page/default/filter contract tests.
- `foodyweb/lib/preview/websiteV3Protocol.ts`: typed preview message protocol.
- `foodyweb/lib/preview/__tests__/website-v3-protocol.test.ts`: revision and origin validation.
- `foodyweb/components/website-v3/WebsitePageRenderer.tsx`: universal page-type renderer.
- `foodyweb/components/website-v3/WebsitePagePreviewBridge.tsx`: preview state application and acknowledgements.
- `foodyweb/components/website-v3/ContentPage.tsx`: landing/content composition.
- `foodyweb/components/website-v3/OrderPage.tsx`: menu-scoped ordering composition.
- `foodyweb/components/website-v3/CateringPage.tsx`: service-scoped catering composition.
- `foodyweb/app/r/[restaurantId]/[page]/page.tsx`: canonical slug resolver.
- `foodyweb/app/r/[restaurantId]/page.tsx`: landing page through the universal renderer.
- `foodyweb/app/r/[restaurantId]/order/page.tsx`: compatibility redirect.
- `foodyweb/app/r/[restaurantId]/catering/page.tsx`: compatibility redirect.

### Foodyadmin

- `foodyadmin/package.json`: add Playwright scripts and development dependency.
- `foodyadmin/playwright.config.ts`: cross-service E2E configuration.
- `foodyadmin/src/lib/api.ts`: V3 page types and canonical draft payload.
- `foodyadmin/src/lib/website-v3/types.ts`: editor-only types and discriminated page settings.
- `foodyadmin/src/lib/website-v3/state.ts`: immutable editor mutations and publication validation.
- `foodyadmin/src/lib/website-v3/autosave.ts`: serialized save queue.
- `foodyadmin/src/lib/website-v3/preview-protocol.ts`: typed editor-side protocol.
- `foodyadmin/src/components/website-v3/field-contracts.ts`: exhaustive field connectivity registry.
- `foodyadmin/src/components/website-v3/WebsiteV3Builder.tsx`: orchestration and data loading.
- `foodyadmin/src/components/website-v3/BuilderShell.tsx`: Focus Canvas desktop layout.
- `foodyadmin/src/components/website-v3/MobileUnavailable.tsx`: mobile builder gate.
- `foodyadmin/src/components/website-v3/PageRail.tsx`: page/global navigation.
- `foodyadmin/src/components/website-v3/Inspector.tsx`: content/appearance/settings tabs.
- `foodyadmin/src/components/website-v3/PreviewCanvas.tsx`: iframe, device switch, revision status.
- `foodyadmin/src/components/website-v3/PageDialog.tsx`: page creation and type conversion.
- `foodyadmin/src/components/website-v3/CommerceSelector.tsx`: menu/service association controls.
- `foodyadmin/src/components/website-v3/SiteInspector.tsx`: global config fields.
- `foodyadmin/src/components/website-v3/PageInspector.tsx`: page metadata, SEO, appearance, commerce.
- `foodyadmin/src/components/website-v3/SectionInspector.tsx`: section controls using existing editors.
- `foodyadmin/src/app/[restaurantId]/website-v3/layout.tsx`: isolated full-screen route layout.
- `foodyadmin/src/app/[restaurantId]/website-v3/page.tsx`: V3 route entry.
- `foodyadmin/src/components/Sidebar.tsx`: desktop-only beta link.
- `foodyadmin/tests/website-v3/fixtures.ts`: login and deterministic fixture helpers.
- `foodyadmin/tests/website-v3/page-lifecycle.spec.ts`: CRUD and publication.
- `foodyadmin/tests/website-v3/commerce-isolation.spec.ts`: page-specific menus/services.
- `foodyadmin/tests/website-v3/field-connectivity.spec.ts`: registry-driven field matrix.
- `foodyadmin/tests/website-v3/draft-recovery.spec.ts`: save, discard, and failure behavior.

---

### Task 1: Persist Primary Commerce Pages

**Files:**
- Create: `foodyserver/migrations/147_website_page_defaults.sql`
- Modify: `foodyserver/internal/common/models.go`
- Modify: `foodyserver/internal/common/website_page_test.go`

**Interfaces:**
- Produces: `WebsitePage.IsDefault bool` serialized as `is_default`.
- Produces: one database-enforced default per `(restaurant_id, type)` for `order` and `catering`.

- [ ] **Step 1: Write the failing model test**

Add a JSON round-trip test asserting:

```go
page := common.WebsitePage{
    RestaurantID: 42,
    Type:         "order",
    Slug:         "commande",
    IsDefault:    true,
}
encoded, err := json.Marshal(page)
if err != nil {
    t.Fatal(err)
}
if !bytes.Contains(encoded, []byte(`"is_default":true`)) {
    t.Fatalf("missing is_default: %s", encoded)
}
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
cd foodyserver && go test ./internal/common -run TestWebsitePageJSONIncludesDefault -count=1
```

Expected: compilation fails because `WebsitePage.IsDefault` does not exist.

- [ ] **Step 3: Add the model field**

Add to `WebsitePage`:

```go
// IsDefault selects the compatibility alias target for order or catering pages.
IsDefault bool `gorm:"not null;default:false" json:"is_default"`
```

- [ ] **Step 4: Add the migration**

Create migration SQL that:

```sql
ALTER TABLE website_pages
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY restaurant_id, type
               ORDER BY sort_order, id
           ) AS position
    FROM website_pages
    WHERE type IN ('order', 'catering')
)
UPDATE website_pages
SET is_default = TRUE
FROM ranked
WHERE website_pages.id = ranked.id
  AND ranked.position = 1;

WITH reserved_pages AS (
    SELECT id,
           restaurant_id,
           CASE WHEN slug = 'order' THEN 'commande' ELSE 'traiteur' END AS preferred_slug
    FROM website_pages
    WHERE slug IN ('order', 'catering')
),
resolved_slugs AS (
    SELECT reserved_pages.id,
           CASE
               WHEN EXISTS (
                   SELECT 1
                   FROM website_pages collision
                   WHERE collision.restaurant_id = reserved_pages.restaurant_id
                     AND collision.slug = reserved_pages.preferred_slug
                     AND collision.id <> reserved_pages.id
               )
               THEN reserved_pages.preferred_slug || '-legacy-' || reserved_pages.id::text
               ELSE reserved_pages.preferred_slug
           END AS next_slug
    FROM reserved_pages
)
UPDATE website_pages
SET slug = resolved_slugs.next_slug
FROM resolved_slugs
WHERE website_pages.id = resolved_slugs.id;

UPDATE website_pages
SET appearance_overrides_json = settings_json->'appearance'
WHERE (appearance_overrides_json IS NULL OR appearance_overrides_json = '{}'::jsonb)
  AND settings_json ? 'appearance';

CREATE UNIQUE INDEX IF NOT EXISTS idx_website_pages_primary_commerce
    ON website_pages (restaurant_id, type)
    WHERE is_default = TRUE
      AND type IN ('order', 'catering');
```

Add a migration fixture containing pre-existing `commande` and `traiteur` slugs and assert migrated reserved rows receive `commande-legacy-{id}` and `traiteur-legacy-{id}` without violating the existing unique index.

- [ ] **Step 5: Run model tests**

Run:

```bash
cd foodyserver && gofmt -w internal/common/models.go internal/common/website_page_test.go && go test ./internal/common -run WebsitePage -count=1
```

Expected: PASS.

- [ ] **Step 6: Review checkpoint**

Inspect:

```bash
git -C foodyserver diff --check
git -C foodyserver diff -- migrations/147_website_page_defaults.sql internal/common/models.go internal/common/website_page_test.go
```

Do not commit without explicit user authorization.

---

### Task 2: Validate Canonical Page Payloads

**Files:**
- Create: `foodyserver/internal/restaurants/website_page_contract.go`
- Create: `foodyserver/internal/restaurants/website_page_contract_test.go`
- Modify: `foodyserver/internal/restaurants/website_draft.go`

**Interfaces:**
- Consumes: `common.IsValidPageType(string) bool`.
- Produces: `ValidateAndNormalizeWebsiteDraft(payload DraftStatePayload) (DraftStatePayload, error)`.
- Produces: `NormalizePageSettings(pageType string, raw json.RawMessage) (json.RawMessage, error)`.

- [ ] **Step 1: Write the failing table-driven validation tests**

Cover these exact cases:

```go
tests := []struct {
    name    string
    page    DraftPagePayload
    wantErr string
}{
    {"reserved order slug", DraftPagePayload{Type: "content", Slug: "order"}, "reserved slug"},
    {"reserved catering slug", DraftPagePayload{Type: "content", Slug: "catering"}, "reserved slug"},
    {"order requires menus", DraftPagePayload{Type: "order", Slug: "commande", Settings: raw(`{"menu_ids":[]}`)}, "at least one menu"},
    {"catering requires services", DraftPagePayload{Type: "catering", Slug: "traiteur", Settings: raw(`{"service_ids":[]}`)}, "at least one service"},
    {"order rejects services", DraftPagePayload{Type: "order", Slug: "commande", Settings: raw(`{"menu_ids":[1],"service_ids":[2]}`)}, "service_ids"},
    {"content clears commerce", DraftPagePayload{Type: "content", Slug: "a-propos", Settings: raw(`{"menu_ids":[1]}`)}, ""},
}
```

Also test:

- duplicate slugs after lowercase/trim normalization;
- exactly one landing page;
- at most one default for each commerce type;
- default forbidden on landing/content;
- all `section.page_id` values belong to a payload page;
- all `section.page_tmp_id` values resolve to a new payload page;
- `settings.appearance` is removed after copying into `appearance_overrides`;
- unknown settings keys are rejected for order/catering pages.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
cd foodyserver && go test ./internal/restaurants -run 'TestValidateAndNormalizeWebsiteDraft|TestNormalizePageSettings' -count=1
```

Expected: compilation fails because the validation functions do not exist.

- [ ] **Step 3: Implement strict discriminated settings**

Define private wire structs:

```go
type orderPageSettings struct {
    MenuIDs []uint `json:"menu_ids"`
}

type cateringPageSettings struct {
    ServiceIDs []uint `json:"service_ids"`
}
```

Decode with `json.Decoder.DisallowUnknownFields()`. Normalize IDs by removing zeroes and duplicates while retaining first-seen order. For `landing` and `content`, return `{}`.

- [ ] **Step 4: Implement draft normalization**

`ValidateAndNormalizeWebsiteDraft` must:

1. trim titles and lowercase/slugify slugs;
2. reject `order` and `catering` slugs;
3. normalize page settings and appearance;
4. validate page/default uniqueness;
5. validate section page references;
6. return a normalized copy without mutating the caller’s payload.

Reuse the existing `errDraftValidation` sentinel from `website_draft.go`. Wrap actionable field messages with `%w`, for example:

```go
return payload, fmt.Errorf("%w: page %q requires at least one menu", errDraftValidation, page.Title)
```

- [ ] **Step 5: Connect save and publish**

In `SaveDraft`, normalize before serializing `DraftState`.

In `PublishDraft`, normalize again immediately after unmarshalling the stored draft so an old or manually-corrupted draft cannot bypass validation.

Extend `DraftPagePayload`:

```go
IsDefault bool `json:"is_default"`
```

Round-trip the field in `applyPagePayload` and `pageToPayload`.

- [ ] **Step 6: Run contract and draft tests**

Run:

```bash
cd foodyserver && gofmt -w internal/restaurants/website_page_contract.go internal/restaurants/website_page_contract_test.go internal/restaurants/website_draft.go && go test ./internal/restaurants -run 'WebsiteDraft|WebsitePageContract|NormalizePageSettings' -count=1
```

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Run `git -C foodyserver diff --check` and inspect only the Task 2 files. Do not commit.

---

### Task 3: Publish Atomically and Preserve Drafts

**Files:**
- Modify: `foodyserver/internal/restaurants/website_draft.go`
- Modify: `foodyserver/internal/restaurants/website_draft_test.go`

**Interfaces:**
- Consumes: normalized `DraftStatePayload`.
- Produces: atomic page/default/section/config publication with draft retention on failure.

- [ ] **Step 1: Write failing transaction tests**

Add tests that:

- publish two commerce pages while switching `is_default` from old to new;
- delete the current default and promote another page in the same payload;
- reject deletion of the only order page when its alias would have no target;
- force a section write failure and confirm config/pages remain unchanged;
- confirm `DraftDirty` and `DraftState` remain intact after any failure;
- confirm successful publication clears dirty state and updates `PublishedAt`.

Use a GORM callback to force a deterministic write error:

```go
db.Callback().Update().Before("gorm:update").Register("force_section_failure", func(tx *gorm.DB) {
    if tx.Statement.Schema != nil && tx.Statement.Schema.Table == "website_sections" {
        tx.AddError(errors.New("forced section failure"))
    }
})
```

- [ ] **Step 2: Run tests and verify the intended failure**

Run:

```bash
cd foodyserver && go test ./internal/restaurants -run 'TestPublishDraft_(SwitchesDefaultAtomically|RollsBackAndKeepsDraft)' -count=1
```

Expected: at least the default switch fails because saving the new default can violate the unique index before the old default is cleared.

- [ ] **Step 3: Implement safe default switching**

Inside the existing transaction:

1. set all published order/catering `is_default` values to false for the restaurant;
2. upsert the normalized payload pages;
3. delete staged pages;
4. write sections;
5. verify one default exists per published commerce type;
6. save config and clear draft bookkeeping last.

Keep all operations on `tx`; do not call `s.db` from inside the transaction.

- [ ] **Step 4: Run draft tests**

Run:

```bash
cd foodyserver && gofmt -w internal/restaurants/website_draft.go internal/restaurants/website_draft_test.go && go test ./internal/restaurants -run WebsiteDraft -count=1
```

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Run `git -C foodyserver diff --check`. Do not commit.

---

### Task 4: Add Public Page Resolvers

**Files:**
- Modify: `foodyserver/internal/restaurants/website_pages.go`
- Modify: `foodyserver/internal/restaurants/website_pages_test.go`
- Modify: `foodyserver/internal/restaurants/handler.go`
- Modify: `foodyserver/cmd/server/main.go`

**Interfaces:**
- Produces: `GetWebsitePageWithSections(restaurantID uint, slug string) (*WebsitePageWithSections, error)`.
- Produces: `GetDefaultWebsitePage(restaurantID uint, pageType string) (*WebsitePageWithSections, error)`.
- Produces: `GET /api/v1/public/restaurants/:idOrSlug/website-pages/:slug`.
- Produces: `GET /api/v1/public/restaurants/:idOrSlug/website-pages/default/:type`.

- [ ] **Step 1: Write failing resolver tests**

Assert:

```go
page, err := service.GetWebsitePageWithSections(restaurantID, "commande-midi")
```

returns only visible sections ordered by `sort_order`, matched by `page_id`, and never leaks another restaurant’s page.

Assert:

```go
page, err := service.GetDefaultWebsitePage(restaurantID, "order")
```

returns only `is_default = true`, rejects `content`, and returns `gorm.ErrRecordNotFound` when no default exists.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd foodyserver && go test ./internal/restaurants -run 'TestGetWebsitePageWithSections|TestGetDefaultWebsitePage' -count=1
```

Expected: compilation fails because resolver methods do not exist.

- [ ] **Step 3: Implement service resolvers**

Use restaurant-scoped queries and reuse one private section loader:

```go
func (s *Service) visibleSectionsForPage(restaurantID, pageID uint) ([]common.WebsiteSection, error)
```

Do not fall back to the first page by type.

- [ ] **Step 4: Add handlers and routes**

Handlers resolve `idOrSlug`, call the service, return:

```json
{ "page": { "id": 1, "type": "order", "slug": "commande", "is_default": true, "sections": [] } }
```

Map not found to HTTP 404 and invalid default type to HTTP 400.

Register the static `default/:type` route before `:slug`:

```go
public.GET("/restaurants/:idOrSlug/website-pages/default/:type", restaurantHandler.GetDefaultWebsitePagePublic)
public.GET("/restaurants/:idOrSlug/website-pages/:slug", restaurantHandler.GetWebsitePagePublic)
```

- [ ] **Step 5: Run focused and package tests**

Run:

```bash
cd foodyserver && gofmt -w internal/restaurants/website_pages.go internal/restaurants/website_pages_test.go internal/restaurants/handler.go cmd/server/main.go && go test ./internal/restaurants -run WebsitePage -count=1
```

Expected: PASS.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyserver diff --check`. Do not commit.

---

### Task 5: Create a Deterministic E2E Fixture

**Files:**
- Create: `foodyserver/cmd/websitev3seed/main.go`
- Create: `foodyserver/cmd/websitev3seed/main_test.go`

**Interfaces:**
- Produces command: `go run ./cmd/websitev3seed --restaurant-slug website-v3-e2e`.
- Produces JSON stdout containing `restaurant_id`, `restaurant_slug`, `email`, `password`, `menu_ids`, and `service_ids`.

- [ ] **Step 1: Write the failing idempotency test**

Extract:

```go
func seedWebsiteV3Fixture(db *gorm.DB, slug string) (*fixtureResult, error)
```

Call it twice and assert stable restaurant, menu, and service IDs with no duplicate page slugs.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
cd foodyserver && go test ./cmd/websitev3seed -count=1
```

Expected: package or function does not exist.

- [ ] **Step 3: Implement the fixture**

Seed:

- one owner user with password `testpass123`;
- restaurant slug `website-v3-e2e`;
- two web-enabled menus with distinct group/item labels;
- two active catering services with distinct labels;
- landing, content, two order, and two catering pages;
- one explicit default order page and one explicit default catering page;
- representative sections and global config.

Use `FirstOrCreate` plus explicit updates so reruns reset mutable fixture values.

- [ ] **Step 4: Emit machine-readable output**

The command’s final stdout line must be one JSON object:

```json
{"restaurant_id":1,"restaurant_slug":"website-v3-e2e","email":"website-v3-e2e@foody.test","password":"testpass123","menu_ids":[11,12],"service_ids":[21,22]}
```

Never print JWTs or production credentials.

- [ ] **Step 5: Run tests**

Run:

```bash
cd foodyserver && gofmt -w cmd/websitev3seed && go test ./cmd/websitev3seed -count=1
```

Expected: PASS.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyserver diff --check`. Do not commit.

---

### Task 6: Define the Foodyweb V3 Page Contract

**Files:**
- Create: `foodyweb/lib/websiteV3Api.ts`
- Create: `foodyweb/lib/__tests__/website-v3-api.test.ts`

**Interfaces:**
- Produces: discriminated `WebsiteV3Page`.
- Produces: `parseWebsiteV3Page(input: unknown): WebsiteV3Page`.
- Produces: `fetchWebsitePage(idOrSlug: string, pageSlug: string): Promise<WebsiteV3Page | null>`.
- Produces: `fetchDefaultWebsitePage(idOrSlug: string, type: "order" | "catering"): Promise<WebsiteV3Page | null>`.
- Produces: `filterBySelectedIds<T extends { id: number }>(items: T[], ids: number[]): T[]`.

- [ ] **Step 1: Write failing unit tests**

Test:

```ts
const orderPage: WebsiteV3Page = {
  id: 1,
  restaurant_id: 9,
  type: "order",
  slug: "commande-midi",
  title: "Commander",
  sort_order: 1,
  nav_visible: true,
  is_default: true,
  seo: {},
  settings: { menu_ids: [11] },
  appearance_overrides: {},
  sections: [],
};
```

Assert filters never treat an empty ID list as “all”: an empty published association returns an empty list and is rendered as an unavailable state.

Mock `global.fetch` and assert URL encoding, 404→`null`, and non-404 failures throw.

Assert `parseWebsiteV3Page` rejects an unknown type, order settings containing `service_ids`, and catering settings containing `menu_ids`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd foodyweb && npm test -- --test-name-pattern='website v3'
```

Expected: module not found.

- [ ] **Step 3: Implement strict types**

Use:

```ts
type WebsiteV3BasePage = {
  id: number;
  restaurant_id: number;
  slug: string;
  title: string;
  sort_order: number;
  nav_visible: boolean;
  is_default: boolean;
  seo: { title?: string; description?: string; share_image_url?: string };
  appearance_overrides: PageAppearanceOverrides;
  sections: WebsiteSection[];
};

export type WebsiteV3Page =
  | (WebsiteV3BasePage & { type: "landing"; settings: Record<string, never> })
  | (WebsiteV3BasePage & { type: "content"; settings: Record<string, never> })
  | (WebsiteV3BasePage & { type: "order"; settings: { menu_ids: number[] } })
  | (WebsiteV3BasePage & { type: "catering"; settings: { service_ids: number[] } });
```

Define matching strict Zod schemas and implement:

```ts
export function parseWebsiteV3Page(input: unknown): WebsiteV3Page {
  return websiteV3PageSchema.parse(input) as WebsiteV3Page;
}
```

- [ ] **Step 4: Implement fetch behavior**

Use `cache: "no-store"`. Return `null` only for 404. Throw an `Error` containing status and endpoint for all other failures. Parse successful `data.page` values with `parseWebsiteV3Page`; never cast unvalidated JSON.

- [ ] **Step 5: Run unit tests and typecheck**

Run:

```bash
cd foodyweb && npm test -- --test-name-pattern='website v3' && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyweb diff --check`. Do not commit.

---

### Task 7: Build the Universal Public Renderer

**Files:**
- Create: `foodyweb/components/website-v3/WebsitePageRenderer.tsx`
- Create: `foodyweb/components/website-v3/ContentPage.tsx`
- Create: `foodyweb/components/website-v3/OrderPage.tsx`
- Create: `foodyweb/components/website-v3/CateringPage.tsx`
- Modify: `foodyweb/app/r/[restaurantId]/[page]/page.tsx`
- Modify: `foodyweb/app/r/[restaurantId]/page.tsx`

**Interfaces:**
- Consumes: `WebsiteV3Page`, `Restaurant`.
- Produces: `WebsitePageRenderer({ restaurant, page, previewState? })`.
- Produces: canonical rendering by page slug for every supported page type.

- [ ] **Step 1: Add renderer dispatch tests**

Create a pure helper in `WebsitePageRenderer.tsx`:

```ts
export function rendererKind(page: WebsiteV3Page): WebsiteV3Page["type"] {
  return page.type;
}
```

Test all four discriminants; malformed payload rejection remains covered by `website-v3-api.test.ts`.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
cd foodyweb && npm test -- --test-name-pattern='website page renderer'
```

Expected: module not found.

- [ ] **Step 3: Implement content rendering**

`ContentPage` composes:

```tsx
<SiteNavbar restaurant={restaurant} activeKey={page.slug} pageType="content" />
<SectionRenderer sections={page.sections} restaurant={restaurant} />
<SiteFooter restaurant={restaurant} />
```

Use the existing empty-state copy when `sections.length === 0`.

- [ ] **Step 4: Implement order rendering**

Fetch the full public menu, then:

```ts
const scopedMenu = {
  ...menu,
  menus: filterBySelectedIds(menu.menus, page.settings.menu_ids),
};
```

Render existing `OrderExperience` inside:

```tsx
<PageAppearanceScope appearance={page.appearance_overrides}>
```

Preserve existing `type`, `preview_date`, `item`, and `lang` query behavior by moving the current order-page logic into the V3 order component instead of duplicating it.

- [ ] **Step 5: Implement catering rendering**

Fetch active services and filter strictly by `page.settings.service_ids`. Render existing `CateringExperience` inside `PageAppearanceScope`.

- [ ] **Step 6: Route landing and slug pages through one renderer**

For `/r/[restaurantId]/[page]`, fetch the page by slug and call `notFound()` only when it is absent.

For `/r/[restaurantId]`, resolve the single landing page and render it through the same `WebsitePageRenderer`; retain the existing legacy landing fallback only when no typed landing page exists.

- [ ] **Step 7: Run tests, lint, and typecheck**

Run:

```bash
cd foodyweb && npm test && npm run lint && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Review checkpoint**

Run `git -C foodyweb diff --check`. Do not commit.

---

### Task 8: Convert Compatibility Routes to Explicit Aliases

**Files:**
- Modify: `foodyweb/app/r/[restaurantId]/order/page.tsx`
- Modify: `foodyweb/app/r/[restaurantId]/catering/page.tsx`
- Create: `foodyweb/lib/__tests__/website-v3-alias.test.ts`

**Interfaces:**
- Consumes: `fetchDefaultWebsitePage`.
- Produces: redirects preserving the complete query string.

- [ ] **Step 1: Write failing alias URL tests**

Extract:

```ts
export function buildWebsiteAliasTarget(
  restaurantId: string,
  pageSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
): string
```

Assert:

```ts
buildWebsiteAliasTarget("demo", "commande-midi", {
  type: "delivery",
  item: "42",
  lang: "fr",
})
```

equals:

```text
/r/demo/commande-midi?type=delivery&item=42&lang=fr
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd foodyweb && npm test -- --test-name-pattern='website v3 alias'
```

Expected: helper does not exist.

- [ ] **Step 3: Implement order alias**

Resolve the server’s explicit default order page and call:

```ts
redirect(buildWebsiteAliasTarget(params.restaurantId, page.slug, searchParams));
```

If no default exists, call `notFound()`; never select the first order page.

- [ ] **Step 4: Implement catering alias**

Use the identical flow for the explicit default catering page.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd foodyweb && npm test -- --test-name-pattern='website v3 alias' && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyweb diff --check`. Do not commit.

---

### Task 9: Establish the Revisioned Preview Protocol

**Files:**
- Create: `foodyweb/lib/preview/websiteV3Protocol.ts`
- Create: `foodyweb/lib/preview/__tests__/website-v3-protocol.test.ts`
- Create: `foodyweb/components/website-v3/WebsitePagePreviewBridge.tsx`
- Create: `foodyadmin/src/lib/website-v3/preview-protocol.ts`

**Interfaces:**
- Produces message `foody.website-v3.state`.
- Produces acknowledgement `foody.website-v3.applied`.
- Produces readiness message `foody.website-v3.ready`.

- [ ] **Step 1: Write failing protocol tests**

Define and test these exact shapes:

```ts
type WebsiteV3StateMessage = {
  type: "foody.website-v3.state";
  revision: number;
  restaurantId: number;
  activePageKey: string;
  device: "desktop" | "mobile";
  state: DraftStatePayload;
};

type WebsiteV3AppliedMessage = {
  type: "foody.website-v3.applied";
  revision: number;
  activePageKey: string;
};
```

Assert stale revisions are ignored and messages with a mismatched restaurant ID are rejected.

- [ ] **Step 2: Run protocol tests and verify failure**

Run:

```bash
cd foodyweb && npm test -- --test-name-pattern='website v3 preview protocol'
```

Expected: module not found.

- [ ] **Step 3: Implement shared semantics**

Both admin and web modules must export matching string constants and type guards. Do not import code across repositories; duplicate only the wire constants/types, not behavior.

Allow origins from:

- the configured admin origin;
- `http://localhost:3003`;
- the current origin when the preview runs in local development.

Reject wildcard-origin trust in the receive handler.

- [ ] **Step 4: Implement the web preview bridge**

In preview mode:

1. post `ready`;
2. accept only newer revisions;
3. derive the active page by `id` or `tmp_id`;
4. pass draft config/page/sections into `WebsitePageRenderer`;
5. post `applied` after React commits the revision.

Outside preview mode, attach no message listener.

- [ ] **Step 5: Run tests and typecheck both clients**

Run:

```bash
cd foodyweb && npm test -- --test-name-pattern='website v3 preview protocol' && npx tsc --noEmit
cd ../foodyadmin && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyweb diff --check` and `git -C foodyadmin diff --check`. Do not commit.

---

### Task 10: Build V3 Editor State and Serialized Autosave

**Files:**
- Modify: `foodyadmin/src/lib/api.ts`
- Create: `foodyadmin/src/lib/website-v3/types.ts`
- Create: `foodyadmin/src/lib/website-v3/state.ts`
- Create: `foodyadmin/src/lib/website-v3/autosave.ts`

**Interfaces:**
- Produces discriminated `DraftPagePayload`.
- Produces `updateDraftAtPath(state, path, value): DraftStatePayload`.
- Produces `validateDraftForPublish(state): FieldError[]`.
- Produces `createSerializedAutosave(save): SerializedAutosave`.

- [ ] **Step 1: Add strict API types**

Extend `DraftSectionPayload` with:

```ts
page_id?: number;
page_tmp_id?: string;
```

Replace loose page settings with:

```ts
export type DraftPagePayload =
  | (DraftPageBase & { type: "landing"; settings: Record<string, never> })
  | (DraftPageBase & { type: "content"; settings: Record<string, never> })
  | (DraftPageBase & { type: "order"; settings: { menu_ids: number[] } })
  | (DraftPageBase & { type: "catering"; settings: { service_ids: number[] } });
```

Add `is_default: boolean` and typed `appearance_overrides`.

- [ ] **Step 2: Write state helper tests as executable examples**

Because foodyadmin has no unit-test runner yet, place pure-state assertions in the initial Playwright suite and test through the UI:

- page title change mutates only the active page;
- converting order→content clears `menu_ids` and `is_default`;
- converting content→order initializes `{ menu_ids: [] }`;
- deleting a page removes sections linked by `page_id` and `page_tmp_id`;
- publication validation returns field IDs from the registry.

- [ ] **Step 3: Implement immutable mutations**

Use path arrays instead of string `eval`:

```ts
export type StatePath = readonly (string | number)[];

export function updateDraftAtPath(
  state: DraftStatePayload,
  path: StatePath,
  value: unknown,
): DraftStatePayload;
```

Clone only objects/arrays along the path.

- [ ] **Step 4: Implement the serialized save queue**

Required behavior:

```ts
type SerializedAutosave = {
  enqueue(state: DraftStatePayload): Promise<DraftResponse>;
  flush(): Promise<DraftResponse | null>;
  getStatus(): "idle" | "saving" | "saved" | "error";
};
```

Only one request may be in flight. If edits arrive while saving, persist only the newest queued snapshot next. A failed request retains the queued snapshot and rejects `flush()`.

- [ ] **Step 5: Remove the out-of-band commerce write from V3**

V3 must never call `setWebsitePageSettings`. Commerce associations travel only through `saveWebsiteDraft`, so a draft cannot partially alter live page settings.

- [ ] **Step 6: Run admin validation**

Run:

```bash
cd foodyadmin && npm run lint && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 11: Scaffold the Isolated Focus Canvas Builder

**Files:**
- Create: `foodyadmin/src/app/[restaurantId]/website-v3/layout.tsx`
- Create: `foodyadmin/src/app/[restaurantId]/website-v3/page.tsx`
- Create: `foodyadmin/src/components/website-v3/WebsiteV3Builder.tsx`
- Create: `foodyadmin/src/components/website-v3/BuilderShell.tsx`
- Create: `foodyadmin/src/components/website-v3/MobileUnavailable.tsx`
- Create: `foodyadmin/src/components/website-v3/PageRail.tsx`
- Create: `foodyadmin/src/components/website-v3/Inspector.tsx`
- Create: `foodyadmin/src/components/website-v3/PreviewCanvas.tsx`
- Modify: `foodyadmin/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: V3 draft API and preview protocol.
- Produces: desktop/tablet-only three-column Focus Canvas editor.

- [ ] **Step 1: Add the route and mobile gate**

`page.tsx` renders:

```tsx
export default function WebsiteV3Page({ params }: { params: { restaurantId: string } }) {
  return <WebsiteV3Builder restaurantId={Number(params.restaurantId)} />;
}
```

`MobileUnavailable` appears below `1024px` and contains a clear French message plus a back link. Do not mount the iframe or fetch builder data while gated.

- [ ] **Step 2: Implement the shell**

Desktop grid:

```text
240px page rail | minmax(320px, 420px) inspector | minmax(640px, 1fr) preview
```

Header contains:

- V3 beta label;
- save status;
- desktop/mobile preview switch;
- open-public-page button;
- discard button;
- publish button.

- [ ] **Step 3: Implement data loading**

Load in parallel:

```ts
Promise.all([
  getWebsiteDraft(restaurantId),
  getRestaurant(restaurantId),
  listMenus(restaurantId),
  listCateringServices(restaurantId),
  getThemeCatalog(),
])
```

Display explicit retry UI when any required source fails. Theme catalog may degrade to an empty catalog with a warning.

- [ ] **Step 4: Implement preview synchronization**

Increment a local `revision` for every draft mutation. Send the complete draft after iframe `ready`, after active page change, after device change, and after every mutation. Show:

- `Aperçu à jour` when acknowledged revision equals current revision;
- `Mise à jour…` while waiting;
- `Aperçu désynchronisé` after five seconds without acknowledgement.

- [ ] **Step 5: Add the sidebar entry**

Point the desktop-only website entry to `/website-v3`, label it `Website Builder V3`, and add a small `Beta` badge. Keep direct routes to `/website` and `/website-v2` functional.

- [ ] **Step 6: Run admin validation**

Run:

```bash
cd foodyadmin && npm run lint && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 12: Implement Page Lifecycle and Commerce Controls

**Files:**
- Create: `foodyadmin/src/components/website-v3/PageDialog.tsx`
- Create: `foodyadmin/src/components/website-v3/CommerceSelector.tsx`
- Create: `foodyadmin/src/components/website-v3/PageInspector.tsx`
- Modify: `foodyadmin/src/components/website-v3/PageRail.tsx`
- Modify: `foodyadmin/src/components/website-v3/WebsiteV3Builder.tsx`

**Interfaces:**
- Produces page create, rename, reorder, delete, type conversion, primary selection, menu selection, and service selection.

- [ ] **Step 1: Implement page creation**

Generate temporary keys with:

```ts
const tmpId = `page-${crypto.randomUUID()}`;
```

Create defaults:

```ts
content  -> settings: {}
order    -> settings: { menu_ids: [] }
catering -> settings: { service_ids: [] }
```

Never offer a second landing page.

- [ ] **Step 2: Implement slug handling**

Autogenerate the slug from the title until the user edits the slug manually. Reject:

- blank slug;
- duplicate normalized slug;
- `order`;
- `catering`;
- route-reserved values from the public dynamic route.

Expose errors next to the slug field and disable publish.

- [ ] **Step 3: Implement type conversion**

Use an explicit confirmation dialog when conversion removes commerce associations. Apply:

```text
order → content: settings {}, is_default false
catering → content: settings {}, is_default false
content → order: settings {menu_ids: []}
content → catering: settings {service_ids: []}
```

Sections stay attached to the page.

- [ ] **Step 4: Implement commerce selectors**

Order pages show only web-enabled menus. Catering pages show only active services. Use checkboxes with labels and stable IDs:

```text
page.settings.menu_ids
page.settings.service_ids
```

Show an inline error when none are selected. Do not interpret empty as “all”.

- [ ] **Step 5: Implement primary selection**

Only order/catering pages show `Page principale`. Selecting it clears `is_default` from sibling pages of the same type in the local draft.

Prevent deleting the only default commerce page unless another page of that type is selected as primary in the same operation.

- [ ] **Step 6: Implement reorder and delete**

Recompute contiguous `sort_order` values after drag/drop. When deleting:

- persisted page ID goes to `deleted_page_ids`;
- persisted section IDs go to `deleted_section_ids`;
- draft-only page and sections are removed directly.

- [ ] **Step 7: Run admin validation**

Run:

```bash
cd foodyadmin && npm run lint && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 13: Register and Wire Every Editable Field

**Files:**
- Create: `foodyadmin/src/components/website-v3/field-contracts.ts`
- Create: `foodyadmin/src/components/website-v3/SiteInspector.tsx`
- Modify: `foodyadmin/src/components/website-v3/PageInspector.tsx`
- Create: `foodyadmin/src/components/website-v3/SectionInspector.tsx`
- Modify: `foodyadmin/src/components/website-v3/Inspector.tsx`
- Reuse: `foodyadmin/src/components/website/SectionEditors.tsx`
- Reuse: `foodyadmin/src/components/website/NavbarPanel.tsx`
- Reuse: `foodyadmin/src/components/website/CheckoutEditor.tsx`
- Reuse: `foodyadmin/src/components/website/OrderPageInfoEditor.tsx`
- Reuse: `foodyadmin/src/components/website-menu/ThemesPanel.tsx`
- Reuse: `foodyadmin/src/components/website-menu/TypographyPanel.tsx`
- Reuse: `foodyadmin/src/components/website-menu/BrandingPanel.tsx`

**Interfaces:**
- Produces exhaustive `FIELD_CONTRACTS`.
- Every rendered control exposes `data-field-id`.

- [ ] **Step 1: Define the contract type**

```ts
export type FieldContract = {
  id: string;
  scope: "site" | "page" | "section";
  statePath: readonly (string | number)[];
  pageTypes: readonly WebsitePageType[] | "all";
  devices: readonly ("desktop" | "mobile")[];
  preview: {
    selector: string;
    assertion: "text" | "value" | "style" | "visible" | "hidden" | "count";
  };
  public: {
    selector: string;
    assertion: "text" | "value" | "style" | "visible" | "hidden" | "count";
  };
};
```

- [ ] **Step 2: Register site-wide fields**

Include every V3-exposed field from:

- theme and pairing;
- brand color;
- typography;
- navbar desktop/mobile composition;
- logo and scrolled logo;
- navigation links and CTA;
- footer;
- contact details and social links;
- favicon and site SEO;
- checkout;
- order-page information;
- menu layout and category banners.

Each entry uses the exact canonical `DraftConfigPayload` path.

- [ ] **Step 3: Register page fields**

Include:

```text
page.title
page.slug
page.nav_visible
page.is_default
page.seo.title
page.seo.description
page.seo.share_image_url
page.appearance_overrides.bg
page.appearance_overrides.ink
page.appearance_overrides.accent
page.appearance_overrides.headingFont
page.appearance_overrides.bodyFont
page.settings.menu_ids
page.settings.service_ids
```

- [ ] **Step 4: Register section fields**

Derive entries from each editable `SectionSettingsPanel` control. Every section control must map to `section.content.*`, `section.settings.*`, `section.layout`, or `section.is_visible`.

Do not expose a field without a preview and public assertion strategy.

- [ ] **Step 5: Stamp controls**

Every input, select, switch, upload trigger, and reorder control receives:

```tsx
data-field-id={contract.id}
```

Wrap reused editors with an adapter that supplies contract IDs and funnels changes through one `onFieldChange(path, value)` callback.

- [ ] **Step 6: Connect inspector tabs**

Use exactly:

```text
Contenu | Apparence | Réglages
```

The selected page or site item determines the available panels; unsupported fields are not rendered rather than silently ignored.

- [ ] **Step 7: Run admin validation**

Run:

```bash
cd foodyadmin && npm run lint && npm run check:i18n && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 14: Make Save, Discard, and Publish Failure-Safe

**Files:**
- Modify: `foodyadmin/src/components/website-v3/WebsiteV3Builder.tsx`
- Modify: `foodyadmin/src/lib/website-v3/autosave.ts`
- Modify: `foodyadmin/src/lib/website-v3/state.ts`

**Interfaces:**
- Consumes: `validateDraftForPublish`, serialized autosave.
- Produces deterministic save status and actionable field errors.

- [ ] **Step 1: Implement save behavior**

On mutation:

1. update local state immediately;
2. set status to `saving`;
3. enqueue the latest full draft;
4. set status to `saved` only after that revision’s request succeeds;
5. preserve edited local state on failure and show retry.

- [ ] **Step 2: Implement publish behavior**

Before publish:

```ts
const errors = validateDraftForPublish(state);
```

If non-empty, select the first field’s page/tab and focus `[data-field-id="<id>"]`.

Otherwise:

1. await `autosave.flush()`;
2. call `publishWebsiteDraft`;
3. replace local state with the server response;
4. increment preview revision;
5. show the published timestamp.

- [ ] **Step 3: Implement discard confirmation**

Require confirmation when `draft_dirty` is true. After discard, replace state with the server response and wait for preview acknowledgement before showing success.

- [ ] **Step 4: Implement API error mapping**

Map server validation messages to field IDs:

```text
reserved slug → page.slug
requires at least one menu → page.settings.menu_ids
requires at least one service → page.settings.service_ids
default uniqueness → page.is_default
invalid section page → section.page_id
```

Unknown errors remain in a global alert with retry.

- [ ] **Step 5: Run admin validation**

Run:

```bash
cd foodyadmin && npm run lint && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 15: Add Cross-Service Playwright Infrastructure

**Files:**
- Modify: `foodyadmin/package.json`
- Create: `foodyadmin/playwright.config.ts`
- Create: `foodyadmin/tests/website-v3/fixtures.ts`

**Interfaces:**
- Produces scripts `test:e2e:website-v3` and `test:e2e:website-v3:ui`.
- Produces authenticated `websiteV3Test` fixture.

- [ ] **Step 1: Add Playwright**

Add:

```json
"devDependencies": {
  "@playwright/test": "^1.59.1"
}
```

Add scripts:

```json
"test:e2e:website-v3": "playwright test tests/website-v3",
"test:e2e:website-v3:ui": "playwright test tests/website-v3 --ui"
```

- [ ] **Step 2: Configure three web servers**

Use Playwright `webServer` entries:

```ts
[
  { command: "cd ../foodyserver && go run ./cmd/server", port: 8080, reuseExistingServer: true },
  { command: "cd ../foodyweb && npm run dev", port: 3000, reuseExistingServer: true },
  { command: "npm run dev", port: 3003, reuseExistingServer: true },
]
```

Set `baseURL` to `http://localhost:3003`, one worker, trace on first retry, and Chromium projects for desktop and mobile preview assertions. The editor itself remains desktop-only.

- [ ] **Step 3: Implement deterministic setup**

In global setup, run:

```bash
cd ../foodyserver && go run ./cmd/websitev3seed --restaurant-slug website-v3-e2e
```

Parse the final JSON line and write it under `test-results/website-v3-fixture.json`.

- [ ] **Step 4: Implement authenticated fixtures**

Login through the real Foodyadmin login page using fixture credentials. Expose:

```ts
type WebsiteV3Fixtures = {
  restaurantId: number;
  restaurantSlug: string;
  menuIds: number[];
  serviceIds: number[];
  builderPage: Page;
};
```

Navigate to `/${restaurantId}/website-v3` and wait for `Aperçu à jour`.

- [ ] **Step 5: Verify test discovery**

Run:

```bash
cd foodyadmin && npx playwright test tests/website-v3 --list
```

Expected: config loads and discovers the V3 suite files added in later tasks.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 16: Test Page Lifecycle and Commerce Isolation E2E

**Files:**
- Create: `foodyadmin/tests/website-v3/page-lifecycle.spec.ts`
- Create: `foodyadmin/tests/website-v3/commerce-isolation.spec.ts`

**Interfaces:**
- Consumes: deterministic fixture and V3 editor.
- Proves: draft→preview→publish→public round trips for pages, menus, and services.

- [ ] **Step 1: Write the page lifecycle test**

Test:

1. create a content page `Notre histoire`;
2. add a text-and-image section;
3. type unique text;
4. observe the text in desktop preview;
5. switch to mobile preview and observe the same text;
6. reload the admin page and observe persistence;
7. publish;
8. open `/r/{slug}/notre-histoire`;
9. assert the text is public;
10. rename and change slug, publish, assert old URL 404 and new URL works;
11. delete, publish, assert new URL 404.

- [ ] **Step 2: Run lifecycle test and verify failure**

Run:

```bash
cd foodyadmin && npx playwright test tests/website-v3/page-lifecycle.spec.ts
```

Expected before all wiring is complete: failure at the first missing control or preview assertion.

- [ ] **Step 3: Fix only lifecycle wiring defects**

Use the failing `data-field-id` or selector to repair the canonical state path. Do not add test-specific UI branches.

- [ ] **Step 4: Write order isolation test**

Create two order pages, associate one distinct menu to each, choose one default, publish, then assert:

- each canonical slug shows only its selected menu;
- `/order` redirects to the explicit default slug;
- changing the default changes only the alias target;
- direct old canonical URL still renders its own selected menu.

- [ ] **Step 5: Write catering isolation test**

Repeat the same flow with two catering pages and distinct services. Assert `/catering` follows the explicit default.

- [ ] **Step 6: Run both suites**

Run:

```bash
cd foodyadmin && npx playwright test tests/website-v3/page-lifecycle.spec.ts tests/website-v3/commerce-isolation.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 17: Prove Every Field Is Connected

**Files:**
- Create: `foodyadmin/tests/website-v3/field-connectivity.spec.ts`
- Modify: `foodyadmin/src/components/website-v3/field-contracts.ts`

**Interfaces:**
- Consumes: `FIELD_CONTRACTS`.
- Proves every registered field on desktop and mobile preview, reload, publish, and public render.

- [ ] **Step 1: Export a serializable field manifest**

Keep functions out of the contract so the test can import it safely. Each contract must include deterministic test values:

```ts
testValue: string | number | boolean | number[];
```

For upload fields, use checked-in lightweight fixtures under:

```text
foodyadmin/tests/website-v3/assets/
```

- [ ] **Step 2: Add registry completeness assertions**

Fail when:

- a rendered `[data-field-id]` is absent from `FIELD_CONTRACTS`;
- a contract ID has no rendered control in its supported context;
- a contract lacks desktop or mobile preview metadata when the field affects that device;
- duplicate contract IDs exist.

- [ ] **Step 3: Add the connectivity loop**

For each contract:

1. navigate to its site/page/section context;
2. mutate the control using `testValue`;
3. wait for `foody.website-v3.applied` at the current revision;
4. assert the preview selector;
5. reload and assert the control value;
6. publish;
7. visit the canonical public page;
8. assert the public selector.

Run device-specific preview assertions for both `desktop` and `mobile`.

- [ ] **Step 4: Add isolation assertions**

After page-scoped changes, visit sibling pages and assert their previous values remain unchanged. After site-scoped changes, assert all page types inherit the change unless they have an explicit override.

- [ ] **Step 5: Run the field suite**

Run:

```bash
cd foodyadmin && npx playwright test tests/website-v3/field-connectivity.spec.ts
```

Expected: PASS with one reported case per contract ID.

- [ ] **Step 6: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 18: Test Draft Isolation and Recovery

**Files:**
- Create: `foodyadmin/tests/website-v3/draft-recovery.spec.ts`

**Interfaces:**
- Proves unpublished changes stay private and failures preserve recoverable state.

- [ ] **Step 1: Test draft isolation**

Change a published heading without publishing. Assert:

- preview shows the draft value;
- public canonical URL still shows the old value;
- admin reload restores the draft value;
- discard restores the published value in preview.

- [ ] **Step 2: Test serialized autosave**

Rapidly type `A`, `AB`, `ABC`, delay the first save response, and assert after reload that only `ABC` persists. Observe at most one `PUT /website-draft` request in flight.

- [ ] **Step 3: Test save failure**

Intercept one draft save with HTTP 500. Assert:

- local edited value remains visible;
- status becomes error;
- retry sends the latest state;
- successful retry returns status to saved.

- [ ] **Step 4: Test publish validation**

Clear all menus from an order page and click publish. Assert focus moves to:

```text
[data-field-id="page.settings.menu_ids"]
```

and no publish request is sent. Repeat for catering services.

- [ ] **Step 5: Test publish failure**

Intercept publish with HTTP 500. Assert dirty state and public content remain unchanged; retry publishes successfully.

- [ ] **Step 6: Run recovery suite**

Run:

```bash
cd foodyadmin && npx playwright test tests/website-v3/draft-recovery.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Run `git -C foodyadmin diff --check`. Do not commit.

---

### Task 19: Final Cross-Service Verification

**Files:**
- Modify documentation only if validation reveals a changed command or contract.

**Interfaces:**
- Produces verified server, admin, web, and E2E results.

- [ ] **Step 1: Format and validate foodyserver**

Run:

```bash
cd foodyserver && gofmt -w . && go build ./... && go vet ./... && go test ./... -race
```

Expected: all commands exit 0.

- [ ] **Step 2: Validate foodyweb**

Run:

```bash
cd foodyweb && npm run lint && npx tsc --noEmit && npm test
```

Expected: all commands exit 0.

- [ ] **Step 3: Validate foodyadmin**

Run:

```bash
cd foodyadmin && npm run lint && npm run check:i18n && npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the complete V3 E2E suite**

Run:

```bash
cd foodyadmin && npm run test:e2e:website-v3
```

Expected: all lifecycle, commerce, field-connectivity, and recovery tests pass.

- [ ] **Step 5: Inspect worktree scope**

Run:

```bash
git -C foodyserver status --short
git -C foodyweb status --short
git -C foodyadmin status --short
```

Confirm no unrelated dirty files were overwritten and no generated Playwright artifacts are staged.

- [ ] **Step 6: Request code review**

Use `superpowers:requesting-code-review` against the complete diff. Address only findings related to V3 or regressions caused by V3.

- [ ] **Step 7: Final review checkpoint**

Report:

- exact validation commands and exit status;
- any pre-existing unrelated failures;
- public URLs used for `/website-v3`, canonical order/catering pages, `/order`, and `/catering`;
- remaining risks, if any.

Do not claim completion without the verification output, and do not commit or push without explicit user authorization.
