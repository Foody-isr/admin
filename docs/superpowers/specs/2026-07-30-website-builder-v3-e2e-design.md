# Website Builder V3 — Cross-Service E2E Design

## Summary

Build a new website builder at `/[restaurantId]/website-v3` without replacing or modifying the behavior of `/website` or `/website-v2`.

V3 keeps the validated Focus Canvas UI, but its primary requirement is functional correctness across:

- `foodyadmin` editing;
- `foodyserver` draft storage and publication;
- `foodyweb` live preview and public rendering.

Every visible field must have one canonical storage path, one preview consumer, one public consumer, and an automated verification strategy.

## Success Definition

V3 is complete only when:

1. A restaurant owner can create and edit landing, content, classic-shop, and catering pages.
2. Every field visible in V3 updates the live preview.
3. Preview behavior matches the published page behavior.
4. Page-specific mobile and desktop presentation both work.
5. A classic-shop page can select one or more restaurant menus.
6. A catering page can select one or more catering services.
7. Multiple classic-shop and catering pages render independently by slug.
8. `/order` and `/catering` remain compatible aliases to explicit primary pages.
9. Automated E2E tests exercise Admin → Server → Web for draft preview and publication.
10. `/website` and `/website-v2` remain available for live comparison.

## Scope

### In Scope

- New `/website-v3` builder route.
- Focus Canvas desktop/tablet builder interface.
- Mobile and desktop customer-site previews.
- First-class typed website pages.
- Per-page sections, SEO, appearance, and commerce associations.
- Explicit primary classic-shop and catering pages.
- Universal `foodyweb` page renderer.
- Backward-compatible `/order` and `/catering` aliases.
- Field connectivity inventory.
- Cross-service automated tests.

### Out of Scope

- Using the builder itself on a smartphone.
- Removing `/website` or `/website-v2`.
- New commerce types beyond classic shop and catering.
- New section types unrelated to V3 connectivity.
- Real payment execution in builder E2E tests.
- Real-time multi-user collaboration.

## Page Model

### Page Types

Keep the existing internal values:

| Internal type | V3 label | Public renderer |
|---|---|---|
| `landing` | Accueil | Marketing sections at restaurant root |
| `content` | Page de contenu | Marketing sections |
| `order` | Boutique classique | `OrderExperience` with selected menus |
| `catering` | Boutique traiteur | `CateringExperience` with selected services |

`order` remains the internal value for API compatibility. The V3 interface never exposes the word “order” as the page-type label.

### Canonical Page URL

Every published page has a unique canonical slug:

```text
/r/{restaurantSlug}/{pageSlug}
```

Examples:

```text
/r/maison-noya/dejeuner
/r/maison-noya/shabbat
/r/maison-noya/evenements
```

The unique `landing` page remains available at:

```text
/r/{restaurantSlug}
```

### Reserved Compatibility Aliases

`order` and `catering` are reserved alias paths and cannot be assigned to new V3 page slugs.

Existing published pages using those slugs are migrated to collision-safe canonical slugs:

- `order` → `commande`, `commande-2`, and so on;
- `catering` → `traiteur`, `traiteur-2`, and so on.

The old URLs continue to work:

```text
/r/{restaurantSlug}/order
/r/{restaurantSlug}/catering
```

They redirect while preserving query parameters to the explicitly selected primary page.

### Primary Commerce Page

Add `is_default` to `WebsitePage`.

Rules:

- exactly one published `order` page is primary when order pages exist;
- exactly one published `catering` page is primary when catering pages exist;
- `landing` and `content` pages cannot be primary commerce pages;
- changing the primary page is staged in the draft and takes effect only on publish;
- publishing validates uniqueness transactionally.

Migration: create `foodyserver/migrations/147_website_page_defaults.sql`.

The migration:

1. adds `is_default BOOLEAN NOT NULL DEFAULT FALSE`;
2. assigns the first `order` and `catering` page by `sort_order, id` as primary;
3. adds a partial unique index for `(restaurant_id, type)` where `is_default = TRUE` and type is `order` or `catering`;
4. migrates reserved canonical slugs to collision-safe alternatives;
5. copies legacy `settings.appearance` into `appearance_overrides` only when the canonical field is empty.

## Canonical Field Ownership

### Website Page

```ts
type WebsitePageV3 = {
  id?: number;
  tmp_id?: string;
  type: 'landing' | 'content' | 'order' | 'catering';
  slug: string;
  title: string;
  sort_order: number;
  nav_visible: boolean;
  is_default: boolean;
  seo: {
    title?: string;
    description?: string;
    share_image_url?: string;
  };
  settings:
    | Record<string, never>
    | { menu_ids: number[] }
    | { service_ids: number[] };
  appearance_overrides: {
    bg?: string;
    ink?: string;
    accent?: string;
    headingFont?: string;
    bodyFont?: string;
  };
};
```

The page type determines the legal settings:

- `landing` and `content`: empty settings;
- `order`: `menu_ids`;
- `catering`: `service_ids`.

Do not store a duplicated `commerce` discriminator inside `settings`.

### Appearance

`appearance_overrides` is the only canonical per-page appearance field.

Remove V3 reliance on:

```text
settings.appearance
```

Server publication, public API, V3 editor, preview, and public renderer all read/write `appearance_overrides`.

Existing `settings.appearance` values are copied into `appearance_overrides` during migration only when the canonical field is empty.

### Sections

`WebsiteSection.PageID` is the canonical ownership link.

V3 must round-trip:

- `page_id` for persisted pages;
- `page_tmp_id` for draft-only pages.

The legacy string `page` remains populated for compatibility but is not used by V3 to decide ownership when an ID link exists.

### Site-Wide Configuration

`WebsiteConfig` remains canonical for:

- theme;
- typography;
- branding;
- navbar;
- footer defaults;
- checkout;
- contact and social links;
- order-page information;
- menu layout and category banners.

V3 must not invent parallel `v3` config fields when an existing public consumer already has a canonical field.

## Field Connectivity Contract

Create:

```text
foodyadmin/src/components/website-v3/field-contracts.ts
```

Every visible editable control is registered:

```ts
export interface WebsiteFieldContract {
  id: string;
  scope: 'site' | 'page' | 'section';
  statePath: string;
  supportedPageTypes: WebsitePageType[];
  previewDevices: Array<'mobile' | 'desktop'>;
  previewAssertion: PreviewAssertion;
  publicAssertion: PublicAssertion;
}
```

Each V3 control renders:

```text
data-field-id="{contract.id}"
```

No field is accepted into V3 unless it has:

- a contract entry;
- a defined draft path;
- a preview assertion;
- a published-page assertion;
- mobile and desktop coverage when the field affects both.

Complex controls can use custom assertions. Repeated simple controls use reusable assertion factories for text, color, visibility, image, selection, and layout.

## Foody Server Design

### Model and Draft Changes

Add `IsDefault bool` to:

- `common.WebsitePage`;
- `DraftPagePayload`;
- `pageToPayload`;
- `applyPagePayload`.

Draft validation must reject:

- invalid page types;
- duplicate slugs;
- reserved slugs `order` and `catering`;
- `menu_ids` on non-order pages;
- `service_ids` on non-catering pages;
- both `menu_ids` and `service_ids` on one page;
- menu IDs belonging to another restaurant;
- service IDs belonging to another restaurant;
- more than one default page per commerce type;
- default status on `landing` or `content`.

### Publish Transaction

Publication must:

1. validate the complete draft;
2. upsert pages;
3. resolve `page_tmp_id`;
4. upsert sections with canonical page IDs;
5. apply deletions;
6. enforce one default per commerce type;
7. apply site configuration;
8. clear draft state only after the transaction succeeds.

Any error rolls back all page, section, association, and config changes.

### Public Page API

Extend the existing public page response to include:

- `is_default`;
- `seo`;
- `appearance_overrides`;
- typed `settings`;
- ordered visible sections.

Add a service resolver:

```go
ResolveWebsitePage(restaurantID uint, slug string) (*WebsitePageWithSections, error)
```

Add:

```go
ResolveDefaultWebsitePage(restaurantID uint, pageType string) (*WebsitePageWithSections, error)
```

Both enforce restaurant scoping.

## Foody Web Universal Renderer

### One Renderer

Create one public page resolution path:

```ts
resolveWebsitePage(restaurant, pages, requestedSlug)
```

Create:

```tsx
<WebsitePageRenderer
  page={page}
  restaurant={restaurant}
  menu={menu}
  cateringServices={services}
  previewState={previewState}
/>
```

Renderer behavior:

- `landing`: marketing sections;
- `content`: marketing sections;
- `order`: selected menus and order experience;
- `catering`: selected services and catering experience.

The renderer applies:

- page appearance;
- page sections;
- site navbar;
- site footer;
- mobile/desktop navigation rules;
- page SEO in public mode.

### Routes

`/r/[restaurantId]/[page]` resolves the actual page by slug and uses the universal renderer.

`/r/[restaurantId]/order` resolves the primary order page and redirects to its canonical slug while preserving search parameters.

`/r/[restaurantId]/catering` resolves the primary catering page and redirects likewise.

Existing cart, checkout, item sharing, order type, language, and preview-date query parameters must survive the alias redirect.

### Preview Host

The V3 iframe uses the same renderer.

Preview sequence:

1. iframe loads selected canonical or temporary page path with `preview=1`;
2. iframe emits `foody-editor-ready`;
3. Admin posts the full draft, selected page key, device, and monotonically increasing revision;
4. Web resolves the page from the draft by `id` or `tmp_id`;
5. Web renders the universal renderer;
6. Web responds:

```ts
{
  type: 'foody-preview-applied',
  revision: number,
  pageKey: number | string,
  device: 'mobile' | 'desktop'
}
```

Admin does not show `Enregistré dans l’aperçu` until the matching revision is acknowledged.

Draft-only pages and draft-only sections must preview before publication.

## Foody Admin V3

### Isolation

Create:

```text
foodyadmin/src/app/[restaurantId]/website-v3/
```

Add a separate sidebar entry:

```text
Website Builder V3 · Beta
```

Do not redirect or replace `/website-v2`.

### Focus Canvas

Use the approved layout:

- stable top bar;
- compact page rail;
- contextual inspector;
- graphite canvas;
- direct section selection;
- mobile/desktop preview;
- autosave state;
- publish review.

The builder remains hidden below `1024` CSS pixels.

### Page Creation

Page creation asks:

1. page name;
2. type;
3. slug;
4. commerce associations for order/catering;
5. whether the page is primary when no primary exists.

For an existing type with a primary page, changing the primary is an explicit separate action.

### Type Changes

Changing a page type requires confirmation because settings are normalized:

- content → order: initialize `menu_ids: []`;
- content → catering: initialize `service_ids: []`;
- order/catering → content: remove commerce settings;
- order ↔ catering: remove the previous association list and initialize the new list.

The page’s sections, SEO, appearance, title, slug, and navigation visibility remain.

### Menu and Service Associations

Order page selector:

- loads web-enabled restaurant menus;
- supports one or more selections;
- empty selection is not ambiguous: V3 requires at least one selected menu.

Catering page selector:

- loads active catering services;
- supports one or more selections;
- requires at least one selected service.

Unavailable or deleted associations appear as broken references and block publication until resolved.

### Save and Publication

Use serialized debounced autosave for the full draft.

Publication review validates:

- all field contracts;
- page-type settings;
- default-page uniqueness;
- broken menu/service associations;
- required links;
- preview acknowledgement for both mobile and desktop on every changed page.

Publish remains atomic through `foodyserver`.

## Error Handling

### Preview Mismatch

If the preview does not acknowledge the newest revision:

- show `Aperçu en retard`;
- keep the draft;
- allow reload;
- block publication until the current revision is applied.

### Missing Commerce Data

If selected menus or services no longer exist:

- show the missing IDs by page;
- provide a direct fix action;
- block publication.

### Save Failure

- retain local state;
- serialize retries;
- never report saved before server confirmation;
- block publish until flush succeeds.

### Publish Failure

- retain complete draft;
- leave public site unchanged;
- preserve the error detail;
- allow retry after correction.

### Public Resolution Failure

- unknown slug returns 404;
- missing default alias target returns a branded unavailable page, not another random page;
- invalid cross-restaurant IDs are rejected by the server.

## Mobile and Desktop Requirements

The V3 builder itself is desktop/tablet landscape only.

The customer preview must support:

- mobile viewport;
- desktop viewport;
- page-specific layout inheritance;
- mobile overrides;
- RTL where applicable.

Every field contract declares whether it affects:

- both devices;
- desktop only;
- mobile only.

E2E tests exercise every supported device declared by the field.

## Cross-Service E2E Strategy

### Test Location

Add Playwright to Foody Admin and create:

```text
foodyadmin/e2e/website-builder-v3/
```

The tests control:

- Admin at `http://localhost:3003`;
- API at `http://localhost:8080`;
- Web at `http://localhost:3000`.

### Deterministic Fixture

Create an idempotent Go fixture command:

```text
foodyserver/cmd/websitev3seed/
```

It creates:

- owner `website-v3-owner@foody.test`;
- password `testpass123`;
- restaurant slug `website-v3-e2e`;
- two web-enabled classic menus with distinguishable items;
- three catering services;
- landing, content, two order, and two catering pages;
- deterministic sections and images;
- explicit primary order and catering pages.

The command is local/test-only and exposes no HTTP seeding endpoint.

### E2E Suites

#### Page Lifecycle

- create each page type;
- change title and slug;
- set navigation visibility;
- set primary page;
- reload Admin and verify persistence;
- publish and verify canonical URL.

#### Commerce Isolation

- order page A selects menu A;
- order page B selects menu B;
- public page A contains only A;
- public page B contains only B;
- catering pages show only selected services;
- aliases resolve to explicit primary pages.

#### Field Connectivity

For every `WebsiteFieldContract`:

1. locate `[data-field-id]`;
2. change the value;
3. wait for matching preview revision;
4. assert mobile preview;
5. assert desktop preview;
6. publish;
7. open canonical public URL;
8. assert the same value/effect.

#### Draft Isolation

- change a field;
- confirm preview changes;
- confirm public page remains unchanged;
- publish;
- confirm public page changes.

#### Failure Recovery

- API save failure;
- stale preview revision;
- deleted menu/service association;
- publish validation failure;
- successful retry without lost state.

### Additional Tests

Foody Server:

- table-driven validation tests;
- publish rollback tests;
- default-page uniqueness tests;
- association restaurant-scope tests;
- migration/backfill tests.

Foody Web:

- page resolver unit tests;
- alias query-preservation tests;
- page-type renderer tests;
- menu/service filter tests;
- preview revision protocol tests.

Foody Admin:

- TypeScript contract exhaustiveness;
- Playwright field-contract coverage check;
- full E2E suites.

## Validation Commands

Foody Server:

```bash
gofmt -w .
go build ./...
go vet ./...
go test ./... -race
```

Foody Web:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Foody Admin:

```bash
npm run check:i18n
npm run lint
npm run typecheck
npm run build
npm run test:e2e:website-v3
```

## Delivery Phases

1. Lock page schema and migration with server tests.
2. Build public page resolver and universal renderer with Web tests.
3. Build isolated `/website-v3` using the stable contracts.
4. Add serialized draft preview protocol and revision acknowledgement.
5. Connect every global, page, and section field.
6. Add menu/service associations and default aliases.
7. Add publish review and failure recovery.
8. Build deterministic cross-service E2E fixtures.
9. Complete field-by-field mobile/desktop E2E verification.

No phase replaces `/website` or `/website-v2`.
