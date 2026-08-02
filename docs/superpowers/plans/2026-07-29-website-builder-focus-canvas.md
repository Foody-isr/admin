# Website Builder Focus Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the validated Focus Canvas UI and UX to the now-active `/[restaurantId]/website-v2` builder without rebuilding functionality Claude already delivered.

**Architecture:** Keep `website-v2/page.tsx` as the route-level state owner and progressively extract its shell, rail, inspector, canvas, save state, and publication flow into `src/components/website-builder/`. Reuse the shared `SectionEditors`, `NavbarPanel`, theme panels, checkout editor, and live draft protocol already wired by commits through `4954583`.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.4, Tailwind CSS 3.4, Radix UI, Lucide React, iframe `postMessage`, existing website draft APIs.

## Global Constraints

- Target `/[restaurantId]/website-v2`; application navigation already points there.
- Do not port Focus Canvas back into the legacy `/website` route.
- Leave legacy `/website` intact as an unlinked fallback until a separate parity decision.
- Preserve all current draft, publish, discard, page, section, commerce, theme, navbar, footer, domain, contact, and checkout payload shapes.
- Keep the builder unavailable below Tailwind `lg` (`1024` CSS pixels).
- Keep customer-site mobile and desktop preview modes inside the supported builder.
- Use `#29303A` for the canvas and `#55C8B2` for preview selection.
- Use Foody design tokens for shell controls and plain French restaurant vocabulary.
- Preserve RTL preview behavior.
- Preserve unrelated local modifications in orders, fulfillment, API, and i18n files.
- Do not add a new Foody Admin test framework.
- Do not create commits unless the user explicitly authorizes them.

## Realignment Baseline — 2026-07-30

Claude already completed these capabilities after the original plan:

- `website-v2` is the route linked from the Foody Admin sidebar.
- Typed page CRUD, slug editing, reordering, deletion, and visibility exist.
- Page tabs `Contenu`, `Apparence`, and `Réglages` exist.
- Section content editing uses shared `SectionSettingsPanel`.
- Section addition and visibility toggling exist.
- Draft state streams live into the iframe.
- Page appearance inheritance edits persist and preview.
- Theme, typography, branding, and the real config-based navbar editor exist.
- Footer, domain, contact, landing toggle, menu layout, and checkout editors exist.
- `SectionEditors.tsx` and `NavbarPanel.tsx` are already extracted from the legacy route.

The remaining work is therefore primarily shell design, direct manipulation, save robustness, publication UX, accessibility, and parity verification.

## Required Execution Order

Execute tasks in this order:

```text
1 → 2 → 6 → 3 → 4 → 5 → 7 → 8
```

Task 6 intentionally runs before canvas selection, drag and drop, and the visual section library. The active builder currently sends every mutation immediately and can have overlapping save requests; serializing autosave first prevents richer interactions from increasing that race risk.

## Revised File Map

### New Foody Admin files

- `src/components/website-builder/builder-types.ts`
- `src/components/website-builder/WebsiteBuilderShell.tsx`
- `src/components/website-builder/BuilderTopBar.tsx`
- `src/components/website-builder/WebsitePageRail.tsx`
- `src/components/website-builder/BuilderInspector.tsx`
- `src/components/website-builder/FocusCanvas.tsx`
- `src/components/website-builder/SectionLibraryDialog.tsx`
- `src/components/website-builder/section-catalog.ts`
- `src/components/website-builder/useWebsiteDraftAutosave.ts`
- `src/components/website-builder/BuilderSaveStatus.tsx`
- `src/components/website-builder/publish-checks.ts`
- `src/components/website-builder/PublishReviewDialog.tsx`
- `src/components/website-builder/RestorePublishedDialog.tsx`

### Modified Foody Admin files

- `src/app/[restaurantId]/website-v2/page.tsx`
- `src/app/[restaurantId]/website-v2/layout.tsx`
- `src/components/website/SelectionOverlay.tsx`
- `src/components/website/SectionEditors.tsx`
- `src/lib/i18n.tsx`

### Modified Foody Web files

- `components/PreviewSectionWrapper.tsx`
- `lib/preview-mode.ts`
- `lib/__tests__/preview-mode.test.ts`

---

### Task 1: Freeze the Active-Builder Baseline and Extract Contracts

**Files:**
- Create: `src/components/website-builder/builder-types.ts`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`

**Interfaces:**

```ts
export type BuilderPreviewDevice = 'mobile' | 'desktop';
export type BuilderInspectorTab = 'content' | 'appearance' | 'settings';
export type BuilderSitePanel = 'base' | 'nav' | 'footer' | 'domain' | 'contact';

export type BuilderSaveState =
  | { status: 'saved'; savedAt: string | null }
  | { status: 'saving' }
  | { status: 'pending'; message: string }
  | { status: 'error'; message: string };
```

- [ ] **Step 1: Confirm the real starting revision**

Run:

```bash
cd foodyadmin
git log -1 --oneline
git status --short
```

Expected builder baseline: commit `4954583` or a descendant. Record unrelated dirty files and do not edit them.

- [ ] **Step 2: Run validation before Focus Canvas changes**

Run:

```bash
cd foodyadmin
npm run check:i18n
npm run lint
npm run typecheck
```

Expected: all pass. If unrelated fulfillment changes fail, record the exact output and run targeted type checking only after confirming builder files are not implicated.

- [ ] **Step 3: Record functional parity manually**

Open `/[restaurantId]/website-v2` and verify:

- page selection and page CRUD;
- section edit, add, hide, and delete;
- page appearance;
- order checkout;
- theme, typography, logo, navbar, footer, domain, and contact;
- live draft preview;
- discard and publish.

Capture any regression before redesign work so it is not attributed to Focus Canvas.

- [ ] **Step 4: Add shared UI-only types**

Create `builder-types.ts` with the exact unions above. Replace local `Tab` and `Device` aliases in `website-v2/page.tsx` with:

```ts
type TabByLocale = 'contenu' | 'apparence' | 'reglages';
```

Keep this temporary localized tab type only until Task 3 maps it to `BuilderInspectorTab`.

- [ ] **Step 5: Validate**

Run:

```bash
cd foodyadmin
npm run lint
npm run typecheck
```

Expected: pass with no runtime behavior change.

- [ ] **Step 6: Stop for review**

Review only baseline evidence and type extraction. Do not commit without explicit authorization.

---

### Task 2: Extract and Restyle the Active Shell, Rail, and Inspector

**Files:**
- Create: `src/components/website-builder/WebsiteBuilderShell.tsx`
- Create: `src/components/website-builder/BuilderTopBar.tsx`
- Create: `src/components/website-builder/WebsitePageRail.tsx`
- Create: `src/components/website-builder/BuilderInspector.tsx`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`
- Modify: `src/lib/i18n.tsx`

**Interfaces:**

```ts
export interface WebsiteBuilderShellProps {
  topBar: React.ReactNode;
  pageRail: React.ReactNode;
  inspector: React.ReactNode;
  canvas: React.ReactNode;
}

export interface BuilderTopBarProps {
  restaurantId: number;
  contextLabel: string;
  publicSiteUrl: string | null;
  saveState: BuilderSaveState;
  draftDirty: boolean;
  publishing: boolean;
  onRestore: () => void;
  onPublish: () => void;
}

export interface WebsitePageRailProps {
  pages: DraftPagePayload[];
  activePage: string | null;
  activeSite: BuilderSitePanel | null;
  busy: boolean;
  onSelectPage: (slug: string) => void;
  onSelectSite: (site: BuilderSitePanel) => void;
  onAddPage: (type: string, title: string) => void;
  onMovePage: (slug: string, direction: -1 | 1) => void;
  onDeletePage: (slug: string) => void;
}

export interface BuilderInspectorProps {
  eyebrow: string;
  title: string;
  tabs?: Array<{ id: BuilderInspectorTab; label: string }>;
  activeTab?: BuilderInspectorTab;
  onTabChange?: (tab: BuilderInspectorTab) => void;
  children: React.ReactNode;
}
```

- [ ] **Step 1: Add builder copy to all locales**

Add matching English, Hebrew, and French keys for:

- saved, saving, draft, publish, view site;
- Pages and Tout le site;
- Accueil, Commande, Traiteur, Ajouter une page;
- Thème et typographie, Navigation, Pied de page, Domaine et SEO, Coordonnées et réseaux;
- Contenu, Apparence, Réglages.

Run `npm run check:i18n` immediately after editing translations.

- [ ] **Step 2: Implement the three-zone shell**

Use:

```tsx
<div className="flex h-screen flex-col overflow-hidden bg-[#F8F9FB]">
  {topBar}
  <div className="grid min-h-0 flex-1 grid-cols-[72px_320px_minmax(0,1fr)]">
    {pageRail}
    {inspector}
    {canvas}
  </div>
</div>
```

Do not change domain callbacks in this step.

- [ ] **Step 3: Extract the existing top bar**

Move context, draft state, discard, and publish controls into `BuilderTopBar`. Preserve the current direct callbacks until Tasks 6 and 7.

Replace `Annuler` with the visible label `Restaurer la version publiée`, but keep the existing `onDiscard` behavior behind it until the confirmation dialog lands.

- [ ] **Step 4: Extract the already-functional page rail**

Move existing `PageRow`, `AddPagePanel`, site items, page movement, and delete triggers into `WebsitePageRail`.

Restyle to the validated compact 72-pixel rail:

- icon plus short label;
- dark active item;
- coral inset marker;
- clear divider before `Tout le site`;
- visible keyboard focus;
- `aria-current="page"` for the selected page.

Do not remove page CRUD or movement controls. Put low-frequency page actions in a compact menu attached to each page item.

- [ ] **Step 5: Extract the current editor frame**

Move the repeated heading and page tabs into `BuilderInspector`. Keep existing `PageEditor`, `BaseThemePanel`, `NavbarPanel`, `FooterPanel`, `DomainPanel`, and `ContactPanel` as its children.

Map:

```ts
contenu -> content
apparence -> appearance
reglages -> settings
```

Keep one inspector column only.

- [ ] **Step 6: Remove obsolete inline shell atoms**

Delete local `RailLabel`, `RailItem`, and `DeviceBtn` only after their callers use extracted components.

- [ ] **Step 7: Validate**

Run:

```bash
cd foodyadmin
npm run check:i18n
npm run lint
npm run typecheck
```

Manual checks:

- all pages and site panels remain reachable;
- page CRUD still works;
- tab changes do not change the page;
- top bar remains fixed;
- rail and inspector scroll independently.

- [ ] **Step 8: Stop for review**

Review information hierarchy and parity. Do not commit without explicit authorization.

---

### Task 3: Build Focus Canvas Around the Existing Live Preview

**Files:**
- Create: `src/components/website-builder/FocusCanvas.tsx`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`

**Interfaces:**

```ts
export interface FocusCanvasProps {
  device: BuilderPreviewDevice;
  zoom: number;
  title: string;
  loading: boolean;
  error: string | null;
  onDeviceChange: (device: BuilderPreviewDevice) => void;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
  onReload: () => void;
  children: React.ReactNode;
}
```

- [ ] **Step 1: Preserve `LivePreview` before moving it**

Extract `LivePreview` from `website-v2/page.tsx` into `FocusCanvas.tsx` or a colocated private component without changing:

- `foody-editor-ready` handshake;
- `foody-draft-state`;
- `foody-theme-preview`;
- iframe reload only on page or device change.

- [ ] **Step 2: Add canvas state**

Add:

```ts
const [previewZoom, setPreviewZoom] = useState(0.85);
const [previewError, setPreviewError] = useState<string | null>(null);
const [previewKey, setPreviewKey] = useState(0);
```

Clamp zoom from `0.5` to `1.25` in `0.05` increments.

- [ ] **Step 3: Implement the graphite stage**

Use:

```tsx
className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[#29303A]"
style={{
  backgroundImage: 'radial-gradient(circle, #444D59 1px, transparent 1px)',
  backgroundSize: '16px 16px',
}}
```

Place the iframe on a white frame with a strong neutral shadow.

- [ ] **Step 4: Add device, fit, and zoom controls**

Place:

- mobile/desktop control at bottom-left;
- fit, zoom out, percentage, zoom in at bottom-right;
- preview reload at top-right.

Apply visual zoom to an iframe wrapper, not to iframe viewport width:

```tsx
style={{
  transform: `scale(${zoom})`,
  transformOrigin: 'top center',
}}
```

- [ ] **Step 5: Add loading and recovery**

On iframe load timeout or explicit error, show:

- `L’aperçu ne répond pas`;
- `Recharger l’aperçu`.

Reload by incrementing `previewKey`; do not reload route state or discard draft state.

- [ ] **Step 6: Validate**

Run:

```bash
cd foodyadmin
npm run lint
npm run typecheck
```

Manual checks:

- draft updates continue without iframe reload;
- page/device changes reload correctly;
- theme and navbar changes remain live;
- zoom does not alter mobile/desktop breakpoints;
- checkout and custom pages preview correctly.

- [ ] **Step 7: Stop for review**

Review canvas contrast, scaling, and recovery. Do not commit without explicit authorization.

---

### Task 4: Add Direct Canvas Selection and Section Reordering

**Files:**
- Modify: `foodyweb/lib/preview-mode.ts`
- Modify: `foodyweb/components/PreviewSectionWrapper.tsx`
- Create: `foodyweb/lib/__tests__/preview-mode.test.ts`
- Modify: `src/components/website/SelectionOverlay.tsx`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`
- Modify: `src/components/website/SectionEditors.tsx`

**Interfaces:**

```ts
export type SectionHoverMessage = {
  type: 'foody-section-hover';
  id: number | string | null;
};

export function makeSectionHoverMessage(
  id: number | string | null,
): SectionHoverMessage;

export function postSectionHover(id: number | string | null): void;
```

Extend `LivePreview` callbacks:

```ts
onSectionClick: (id: number | string) => void;
onSectionHover: (id: number | string | null) => void;
onBoundsUpdate: (bounds: SectionBounds[], scrollY: number) => void;
onIframeRectUpdate: (rect: DOMRectLike | null) => void;
```

- [ ] **Step 1: Write protocol tests first**

Create:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSectionHoverMessage } from '../preview-mode';

test('builds section hover messages', () => {
  assert.deepEqual(makeSectionHoverMessage('tmp_1'), {
    type: 'foody-section-hover',
    id: 'tmp_1',
  });
  assert.deepEqual(makeSectionHoverMessage(null), {
    type: 'foody-section-hover',
    id: null,
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd foodyweb
npm test
```

Expected: failure because `makeSectionHoverMessage` is missing.

- [ ] **Step 3: Implement hover messages**

Add `postSectionHover`. Emit from `PreviewSectionWrapper`:

```tsx
onPointerEnter={() => postSectionHover(id)}
onPointerLeave={() => postSectionHover(null)}
```

Keep existing click and bounds messages unchanged.

- [ ] **Step 4: Consume all preview interaction messages in v2**

Port the proven selection/bounds handling from the legacy builder into `website-v2`:

- `foody-section-click`;
- `foody-section-hover`;
- `foody-section-bounds`;
- `foody-scroll`.

Keep the active section key at route level so list selection and canvas selection share one source of truth. Remove `PageEditor`’s private `selectedKey`.

- [ ] **Step 5: Render the mint overlay**

Use `SelectionOverlay` with:

- hover: `1px dashed #55C8B2`;
- selection: `2px solid #55C8B2`;
- no border for inactive sections;
- selected label `{section name} · Modifier`;
- dark toolbar;
- keyboard-accessible move, hide, and delete actions.

Pass `previewZoom` as overlay scale.

- [ ] **Step 6: Add deterministic section movement**

Add route helper:

```ts
function moveSection(
  sectionId: number | string,
  direction: -1 | 1,
): void;
```

It reorders only `pageSections`, rewrites their `sort_order`, merges them back into `draft.state.sections`, and schedules one save.

Expose up/down actions in both the section list and overlay. Add drag and drop only after these accessible controls pass.

- [ ] **Step 7: Add pointer drag and drop**

Use native pointer/drag events on section rows. During dragging:

- show the destination line in the inspector;
- highlight the corresponding destination on canvas;
- commit one reorder when dropped;
- Escape cancels;
- up/down buttons remain available.

- [ ] **Step 8: Validate both services**

Run:

```bash
cd foodyweb
npm test
npm run lint
npm run typecheck
```

Then:

```bash
cd foodyadmin
npm run lint
npm run typecheck
```

Manual checks:

- hover, click, and scrolling align at all zoom levels;
- persisted IDs and `tmp_id` sections both select;
- section selection follows page changes;
- reorder affects only the active page;
- iframe wheel scrolling remains native.

- [ ] **Step 9: Stop for cross-service review**

Review the preview protocol separately from the Admin UI. Do not commit either service without explicit authorization.

---

### Task 5: Replace the Inline Type List with the Visual Section Library

**Files:**
- Create: `src/components/website-builder/section-catalog.ts`
- Create: `src/components/website-builder/SectionLibraryDialog.tsx`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`
- Modify: `src/lib/i18n.tsx`

**Interfaces:**

```ts
export type SectionCatalogGroup =
  | 'hero'
  | 'content'
  | 'commerce'
  | 'social'
  | 'utility';

export interface SectionCatalogItem {
  type: string;
  group: SectionCatalogGroup;
  labelKey: string;
  descriptionKey: string;
  previewTone: 'image' | 'text' | 'cards' | 'commerce';
}

export interface SectionLibraryDialogProps {
  open: boolean;
  availableTypes: readonly string[];
  onAdd: (sectionType: string) => void;
  onOpenChange: (open: boolean) => void;
}
```

- [ ] **Step 1: Define the catalog**

Add every existing section type except site-level footer. Use `SECTION_TYPE_META` and `getDefaultContent` as existing sources of behavior; the new catalog owns only presentation metadata.

- [ ] **Step 2: Build the Radix dialog**

Include:

- autofocus search;
- category filters;
- visual miniature;
- plain-language name;
- one-sentence purpose;
- Enter to add;
- Escape to close and return focus.

- [ ] **Step 3: Replace the current inline picker**

Delete the `adding` inline list inside `PageEditor`. `Ajouter une section` opens `SectionLibraryDialog`.

Insert after the currently selected section:

```ts
const selectedIndex = pageSections.findIndex(
  (section) => (section.id ?? section.tmp_id) === selectedSectionId,
);
const insertionIndex =
  selectedIndex >= 0 ? selectedIndex + 1 : pageSections.length;
```

Recalculate `sort_order` only on the active page.

- [ ] **Step 4: Validate**

Run:

```bash
cd foodyadmin
npm run check:i18n
npm run lint
npm run typecheck
```

Manual checks:

- all current section types remain available;
- search and filters work in French;
- insertion order is correct;
- new `tmp_id` section opens immediately;
- focus returns to the trigger after close.

- [ ] **Step 5: Stop for review**

Review catalog grouping and insertion behavior. Do not commit without explicit authorization.

---

### Task 6: Replace Immediate Saves with a Serialized Autosave State Machine

**Files:**
- Create: `src/components/website-builder/useWebsiteDraftAutosave.ts`
- Create: `src/components/website-builder/BuilderSaveStatus.tsx`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`
- Modify: `src/components/website-builder/BuilderTopBar.tsx`

**Interfaces:**

```ts
export interface WebsiteDraftAutosaveOptions {
  restaurantId: number;
  enabled: boolean;
  debounceMs: number;
  state: DraftStatePayload | null;
  save: (
    restaurantId: number,
    payload: DraftStatePayload,
  ) => Promise<DraftResponse>;
  onServerState: (response: DraftResponse) => void;
}

export interface WebsiteDraftAutosaveResult {
  saveState: BuilderSaveState;
  updateLocalState: (next: DraftStatePayload) => void;
  flush: () => Promise<DraftResponse | null>;
  retry: () => Promise<void>;
  markServerSnapshot: (state: DraftStatePayload) => void;
}
```

- [ ] **Step 1: Preserve optimistic local updates**

Replace the current async `saveState(next)` with `updateLocalState(next)`, which:

- updates `draft.state` immediately;
- marks `draft_dirty: true`;
- queues a debounced save;
- never replaces newer local state with an older response.

- [ ] **Step 2: Serialize requests**

The hook must keep at most one save request in flight. If state changes during a request:

1. allow the request to finish;
2. keep the newest local state;
3. immediately save the newest serialized payload;
4. apply only response metadata, not stale response state.

This prevents rapid controls from racing and overwriting each other.

- [ ] **Step 3: Implement explicit save states**

Transitions:

```text
saved -> saving -> saved
saved -> saving -> error
error -> saving -> saved
error -> pending while offline
pending -> saving when online
```

Use a `400` millisecond debounce.

- [ ] **Step 4: Implement flush and retry**

`flush()` saves the newest local state before publish. If it fails, reject and prevent publication.

`retry()` resends the newest local state. Reconnect automatically on the browser `online` event.

- [ ] **Step 5: Render truthful save status**

Use:

- `Enregistrement…`;
- `Enregistré à l’instant`;
- `Hors connexion — modifications en attente`;
- `Enregistrement impossible — Réessayer`.

Use `role="status"` for normal changes and `role="alert"` for failure.

- [ ] **Step 6: Validate race and failure behavior**

Run:

```bash
cd foodyadmin
npm run lint
npm run typecheck
```

Manual network checks:

- rapid theme sliders do not lose values;
- rapid section edits produce serialized saves;
- page switch preserves pending state;
- offline edit remains local;
- reconnect retries;
- publish flushes the latest state;
- initial hydration does not trigger a save.

- [ ] **Step 7: Stop for review**

Review network behavior before publication changes. Do not commit without explicit authorization.

---

### Task 7: Add Publish Review and Explicit Restore

**Files:**
- Create: `src/components/website-builder/publish-checks.ts`
- Create: `src/components/website-builder/PublishReviewDialog.tsx`
- Create: `src/components/website-builder/RestorePublishedDialog.tsx`
- Modify: `src/components/website-builder/BuilderTopBar.tsx`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`
- Modify: `src/lib/i18n.tsx`

**Interfaces:**

```ts
export type PublishIssueSeverity = 'error' | 'suggestion';

export interface PublishIssue {
  id: string;
  severity: PublishIssueSeverity;
  pageSlug: string;
  sectionId?: number | string;
  inspectorTab: BuilderInspectorTab;
  label: string;
}

export interface PublishSummary {
  changedPageLabels: string[];
  changedSectionCount: number;
  issues: PublishIssue[];
}
```

- [ ] **Step 1: Implement deterministic checks**

Blocking errors:

- external-link or scroll-to-section button has no target;
- enabled navbar custom CTA has no link;
- visible CTA text has no CTA link.

Suggestions:

- gallery image URL has no alt text;
- custom page title is empty;
- visible hero has no headline;
- text-and-image has neither title nor body;
- scrolling text is empty;
- external URL uses HTTP instead of HTTPS.

- [ ] **Step 2: Build review dialog**

Show:

- affected pages;
- changed section count;
- blocking errors before suggestions;
- final action `Publier {count} changements`.

Disable final publish while blocking errors exist.

- [ ] **Step 3: Wire issue navigation**

Clicking an issue closes the dialog, selects `pageSlug`, selects `sectionId` when present, and opens `inspectorTab`.

- [ ] **Step 4: Flush before publish**

Final publish:

1. calls `autosave.flush()`;
2. aborts on save failure;
3. calls `publishWebsiteDraft`;
4. hydrates the published response;
5. shows success with site URL and time.

- [ ] **Step 5: Add restore confirmation**

`Restaurer la version publiée` opens a Radix Alert Dialog explaining:

- all unpublished changes will be removed;
- the public site does not change;
- confirmation is destructive.

Only confirmation calls `discardWebsiteDraft`.

- [ ] **Step 6: Validate**

Run:

```bash
cd foodyadmin
npm run check:i18n
npm run lint
npm run typecheck
```

Manual checks:

- suggestions allow publish;
- errors block and navigate;
- save failure prevents publish;
- publish failure preserves draft and live site;
- restore requires confirmation;
- success URL opens correctly.

- [ ] **Step 7: Stop for review**

Review severity, recovery, and destructive copy. Do not commit without explicit authorization.

---

### Task 8: Complete Progressive Disclosure, Accessibility, Parity, and Regression

**Files:**
- Modify: `src/components/website/SectionEditors.tsx`
- Modify: `src/components/website-builder/BuilderInspector.tsx`
- Modify: `src/app/[restaurantId]/website-v2/layout.tsx`
- Modify: `src/app/[restaurantId]/website-v2/page.tsx`
- Modify: `src/lib/i18n.tsx`

- [ ] **Step 1: Group advanced section controls**

Keep visible by default:

- title and text;
- image;
- primary layout;
- primary CTA content.

Place under `Options avancées`:

- animation;
- fine spacing;
- typography overrides;
- device visibility;
- low-frequency background controls.

Do not change stored keys or values.

- [ ] **Step 2: Confirm the desktop gate**

Keep `DesktopOnly` at `lg`. Pass website-specific copy:

```tsx
<DesktopOnly
  title={t('websiteBuilderLargeScreenTitle')}
  message={t('websiteBuilderLargeScreenMessage')}
>
  {children}
</DesktopOnly>
```

Do not load editor UI below `1024` CSS pixels.

- [ ] **Step 3: Complete keyboard behavior**

Verify:

- rail buttons and page menus;
- inspector tabs;
- section list selection;
- up/down reorder;
- dialog focus trap and focus return;
- Escape behavior;
- publish error focus.

- [ ] **Step 4: Respect reduced motion**

Use `motion-safe:transition` and `motion-reduce:transition-none`. Do not animate iframe scale or section movement with reduced motion.

- [ ] **Step 5: Perform explicit legacy parity audit**

Compare `website-v2` to `/website` for:

- per-page SEO;
- category banner controls;
- hero cover controls;
- order-page information;
- any remaining configuration referenced by `WebsiteConfig`.

For each gap, either:

- port the control using the existing shared component; or
- record it as a named limitation and keep legacy `/website` available.

Do not delete or redirect the legacy route in this task.

- [ ] **Step 6: Run complete validation**

Run:

```bash
cd foodyadmin
npm run check:i18n
npm run lint
npm run typecheck
npm run build
```

Then:

```bash
cd foodyweb
npm test
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 7: Run visual matrix**

| Viewport | Expected |
|---|---|
| `1440 × 900` | Full shell and comfortable canvas |
| `1280 × 800` | Full shell and scrolling inspector |
| `1024 × 768` | Supported landscape-tablet shell |
| `900 × 768` | Unsupported-screen message only |

Verify home, order, catering, custom page, footer, theme, navbar, checkout, domain, contact, empty page, long French labels, and Hebrew RTL preview.

- [ ] **Step 8: Run failure matrix**

Verify save failure, offline edit, preview reload, publish failure, restore, deleted section, deleted page, new `tmp_id` section, reload with dirty draft, and successful publish followed by a new edit.

- [ ] **Step 9: Stop for final review**

Present validation evidence and the parity audit. Do not commit, push, redirect, or delete legacy code without explicit authorization.

---

## Revised Completion Criteria

- Focus Canvas is implemented in active `/website-v2`.
- No completed Claude functionality is rebuilt or lost.
- Page rail, inspector, and canvas match the validated layout.
- Canvas and section list share selection state.
- Section reorder has pointer and keyboard paths.
- Autosave is serialized, truthful, and recoverable.
- Publish review and restore confirmation protect live state.
- Builder remains unavailable below `1024` CSS pixels.
- Admin and Web validation commands pass.
- Legacy `/website` remains available until parity is explicitly accepted.
