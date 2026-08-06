# Website Builder Focus Canvas — Design

## Summary

Redesign the existing Foody website builder as a desktop-first **Focus Canvas** workspace:

- familiar Foody navigation and controls;
- a graphite canvas that makes the customer website the visual focus;
- direct section selection in the live preview;
- progressive disclosure of advanced options;
- a safer, clearer draft-to-publish flow.

The target user is a restaurant owner or manager who is not necessarily technical. The default workflow must remain understandable without training, while experienced users can access deeper customization without changing tools.

## Goals

1. Make the primary workflow obvious: choose a page, select a section, edit it, publish.
2. Reduce the number of competing navigation levels.
3. Preserve creative flexibility through progressive advanced controls.
4. Make draft, autosave, and publication states unambiguous.
5. Keep the live customer website visible during editing.
6. Preserve all current builder capabilities and API contracts.

## Non-Goals

- No mobile website builder in this phase.
- No redesign of the generated customer website.
- No new website section types.
- No change to the draft or publication API contract unless implementation reveals a blocking gap.
- No third builder route. Apply Focus Canvas to the active `/website-v2` builder.
- Keep `/website` as a temporary unlinked fallback until a separate parity review authorizes redirecting or removing it.
- No real-time multi-user collaboration.

## Chosen Direction

### Product model: Progressive Workshop

The builder combines:

- a compact page rail;
- one contextual inspector;
- a large live preview canvas;
- direct manipulation where it improves speed;
- advanced options hidden behind explicit disclosure.

A beginner can complete the essential workflow using only the controls visible by default. Advanced features increase precision but are never required.

### Visual model: Focus Canvas

The shell remains recognizably Foody. Navigation and inspector panels use the existing light admin language. The preview sits on a graphite dotted canvas, creating a distinct creative workspace without disconnecting the user from the backoffice.

Suggested interface tokens:

| Token | Value | Purpose |
|---|---:|---|
| Shell background | `#F8F9FB` | Top bar and navigation surfaces |
| Inspector surface | `#FFFFFF` | Editing controls |
| Canvas | `#29303A` | Visual focus around the website |
| Canvas grid | `#444D59` | Subtle spatial reference |
| Foody coral | `#E06C5A` | Publish and primary actions |
| Selection mint | `#55C8B2` | Selected website element |
| Primary text | `#252D38` | Labels and headings |
| Muted text | `#7A8593` | Secondary information |

Use the existing admin typography rather than introducing another font dependency. The distinctive visual signature is the graphite canvas with mint selection outlines, not decorative typography.

## Information Architecture

### Top Bar

Always contains:

- back to admin;
- `Site web / {current page}` context;
- undo and redo;
- autosave status;
- `Voir le site`;
- `Publier`.

The bar remains stable when switching pages or editing modes. Draft state must not move between unrelated controls.

### Page Rail

The compact rail contains:

- Accueil;
- Commande;
- Traiteur when enabled;
- custom pages;
- Add page;
- a separated `Tout le site` entry.

Page-specific editing and site-wide editing must never appear in the same list without a visible boundary.

`Tout le site` contains:

- theme and typography;
- navigation;
- footer;
- domain and SEO;
- contact information and social links.

### Inspector

The inspector has three stable tabs:

1. `Contenu`
2. `Apparence`
3. `Réglages`

Its content changes with the selected page or section. It is the only persistent editing panel; additional controls must use accordions or a temporary modal instead of adding another permanent sidebar.

Essential controls appear first. Rare or technical controls live under `Options avancées`, with a count when useful.

### Canvas

The canvas:

- centers the live iframe preview;
- supports mobile and desktop preview widths;
- provides zoom and fit controls;
- displays selection outlines and compact contextual actions;
- keeps enough neutral space around the website to distinguish the site from the admin UI.

The preview device toggle controls the customer website viewport only. It does not imply support for using the builder itself on a phone.

## Core Interaction Model

### Selecting

A section can be selected from:

- the section list in the inspector;
- the live iframe preview.

Both entry points update one shared selection state. Selection in the iframe opens the corresponding inspector controls and scrolls the selected section row into view when necessary.

Hover in the iframe uses a dashed mint outline and a short section label. Selection uses a solid mint outline and a compact `Modifier` label.

### Editing

After selection:

- the inspector opens the essential fields for that section;
- edits update the preview optimistically;
- the existing debounced draft save persists the state;
- a discreet status confirms saving or completion.

Text remains edited in the inspector in the first implementation. Direct content-editable text inside the iframe is excluded until selection, focus, localization, and accessibility behavior can be proven reliable.

### Adding Sections

`Ajouter une section` opens a visual library with:

- search;
- categories based on actual section families;
- thumbnail;
- plain-language section name;
- one-sentence purpose;
- preview before insertion when useful.

New sections are inserted after the current selection, or at the end when nothing is selected.

### Reordering

Sections support drag and drop in the inspector. The canvas shows the destination position during dragging.

Keyboard and pointer alternatives remain available through `Déplacer vers le haut` and `Déplacer vers le bas` actions. Drag and drop is an acceleration, not the only way to reorder.

### Advanced Controls

Advanced controls use grouped accordions:

- layout;
- spacing;
- animation;
- responsive visibility;
- page-specific overrides.

Inherited values are explicit:

- `Utilise le thème du site`;
- `Modifié pour cette page`;
- `Réinitialiser selon le thème du site`.

Avoid internal vocabulary such as override, payload, or section type identifiers in user-facing copy.

## Draft and Publication Flow

### Autosave

Every edit updates the draft, not the live site.

Top-bar states:

- `Enregistrement…`
- `Enregistré à l’instant`
- `Hors connexion — modifications en attente`
- `Enregistrement impossible — Réessayer`

Autosave feedback stays quiet when successful and becomes prominent only when user action is required.

### Publish Review

`Publier` opens a review step showing:

- number of changes;
- affected pages and sections;
- required-content checks;
- broken link and commerce-target checks;
- desktop and mobile preview confirmation;
- accessibility suggestions.

Critical errors block publication and link directly to the relevant control. Suggestions do not block publication.

The final action names its effect, for example `Publier 3 changements`.

### Publish Success

After successful publication, show:

- `Le site est à jour`;
- published URL;
- `Ouvrir le site`;
- publication time;
- version identifier when available;
- `Continuer à modifier`.

### Restore Published Version

Replace the ambiguous `Annuler` action with `Restaurer la version publiée`.

This action:

- explains that all unpublished changes will be removed;
- lists the affected pages;
- requires confirmation;
- remains visually secondary to publishing.

## Error Handling

### Autosave Failure

- Keep the optimistic changes locally.
- Display an actionable connection status.
- Retry automatically when connectivity returns.
- Do not imply that changes are safely stored on the server until confirmed.

### Publish Failure

- Keep the current live site unchanged.
- Preserve the complete draft.
- Show the server-provided useful error when safe.
- Provide `Réessayer` and a path back to the affected control.

### Preview Failure

- Keep the inspector usable.
- Show `L’aperçu ne répond pas` inside the canvas.
- Provide `Recharger l’aperçu`.
- Do not discard draft state when reloading the iframe.

### Stale or Conflicting Draft

If another session publishes while this editor contains changes:

- pause autosave;
- explain that the live version changed elsewhere;
- reload the published base;
- offer to reapply local changes where technically safe.

Do not silently overwrite a newer published version.

## Responsive Scope

The builder is available on:

- desktop;
- landscape tablet at `1024` CSS pixels or wider, where the rail, inspector, and canvas remain usable.

Below `1024` CSS pixels, do not load the full editor. Show:

- a clear `Édition disponible sur un écran plus grand` message;
- the reason;
- a link to view the public website;
- a normal path back to the Foody admin.

The customer-site preview still offers mobile and desktop viewport modes inside the supported builder.

## Accessibility

- All controls have visible keyboard focus.
- Section selection is mirrored in the inspector and exposed with selected state.
- Reordering has button and keyboard alternatives.
- Color is never the only indicator for draft, save, warning, or error state.
- Canvas controls meet minimum pointer target sizes.
- Motion respects reduced-motion preferences.
- Publish checks distinguish blocking errors from suggestions in text and iconography.
- French copy uses user-facing restaurant vocabulary and consistent action names.

## Implementation Architecture

Implement the redesign incrementally in the active `/[restaurantId]/website-v2` route. The application navigation already points to this route, and it already owns page CRUD, section editing, live draft preview, global theme, navbar, footer, domain, contact, and checkout controls. Do not migrate this work back into the legacy `/website` route.

The active route file is still too large to remain the long-term UI boundary. Reuse the shared `SectionEditors` and `NavbarPanel` extractions already completed, then extract focused builder-shell components while preserving existing business logic:

- `WebsiteBuilderShell`
- `BuilderTopBar`
- `WebsitePageRail`
- `BuilderInspector`
- `FocusCanvas`
- `SectionList`
- `SectionLibrary`
- `AdvancedSettings`
- `PublishReviewDialog`
- `UnsupportedMobileBuilder`

State ownership remains at the route level initially:

- current page;
- selected section;
- preview device and zoom;
- draft state;
- save state;
- publish state.

Extract state hooks only where they create a clear boundary, such as:

- draft autosave;
- iframe preview messaging;
- section selection synchronization.

This avoids rewriting stable API logic while reducing the active builder route into independently understandable UI units. The legacy route remains untouched during the Focus Canvas implementation.

## Data Flow

1. Load restaurant, website draft, pages, sections, and theme data.
2. Select the first valid page or restore the last local editor context.
3. Send optimistic visual changes to the iframe through the existing preview message protocol.
4. Persist the complete draft through the existing debounced draft endpoint.
5. Keep selection synchronized between iframe messages, overlay, section list, and inspector.
6. Run publish checks against the current draft.
7. Publish atomically through the existing publish endpoint.
8. Refresh draft and published metadata after success.

Commerce connections, per-page appearance inheritance, navbar settings, checkout settings, and custom pages must retain their current storage behavior.

## Testing and Verification

### Functional

- Switching pages preserves the correct section and inspector context.
- Canvas selection and section-list selection remain synchronized.
- All existing section editors remain reachable.
- Add, hide, delete, and reorder operations persist correctly.
- Theme inheritance and page-specific appearance changes remain correct.
- Autosave never publishes.
- Restore removes only unpublished changes after confirmation.
- Publish success and failure preserve the expected draft/live state.

### Visual

Verify at:

- `1440 × 900`;
- `1280 × 800`;
- `1024 × 768` landscape tablet;
- a narrow viewport that must show the unsupported-mobile state.

Check:

- inspector scrolling;
- canvas fit and zoom;
- long French labels;
- empty pages;
- large page and section counts;
- RTL preview behavior for Hebrew customer sites.

### Accessibility

- Complete the primary edit-and-publish workflow with keyboard only.
- Verify focus return after section-library and publish dialogs.
- Verify selected, busy, warning, and error states with a screen reader.
- Verify reduced-motion behavior.

### Regression

Run the existing Foody Admin validation:

```bash
npm run lint
npx tsc --noEmit
```

Add targeted component tests where the current test infrastructure supports them. Do not introduce a new test framework solely for this redesign.

## Delivery Sequence

1. Establish a clean baseline for the active `website-v2` builder.
2. Extract and restyle its existing shell, page rail, and contextual inspector.
3. Introduce the Focus Canvas stage, zoom, and preview failure recovery.
4. Add iframe hover/click selection and section reorder feedback.
5. Replace the existing inline add-section list with the visual section library.
6. Replace immediate overlapping saves with the explicit autosave state machine.
7. Add publish review and explicit restore flow.
8. Complete parity, accessibility, visual, and regression verification.

Each step must leave the existing builder usable and preserve the draft/publish contract.

## Success Criteria

- A new restaurant owner can identify how to edit the homepage without guidance.
- The first section edit requires no navigation outside the current screen.
- Advanced options do not compete with essential content controls.
- The user always knows whether changes are saved, unpublished, or live.
- A failed save or publish never loses the draft or changes the live website.
- Existing website builder capabilities remain available after the redesign.
