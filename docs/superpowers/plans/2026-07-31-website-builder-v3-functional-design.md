# Website Builder V3 — Functional and UX Design

**Date:** 2026-07-31  
**Scope:** `foodyadmin`, `foodyweb`, and the existing `foodyserver` Website V3 contract

## Goal

Make `/website-v3` a complete desktop website builder where every visible field is editable, every edit appears immediately in the iframe preview, and published pages render identically to the preview.

The mobile admin builder remains unavailable. Public pages must remain responsive on desktop and mobile.

## Product Principles

1. Page design is local to each page.
2. Only the logo, navigation definition, and footer definition are site-wide.
3. Navigation and footer can be overridden per page.
4. Existing V2 data must remain editable without destructive migration.
5. The editor must expose structured controls rather than raw JSON.
6. Preview tests must assert visible output, not only diagnostic `data-*` attributes.

## Builder Information Architecture

### Site-level entries

The left rail exposes separate site entries before the page list:

- **Identité**: main logo, alternate logo, favicon, logo sizes.
- **Navigation**: links, CTA, composition, colors, transparent/hover behavior.
- **Pied de page**: content, contact details, social links, appearance.

There is no global page theme. Themes, palettes, typography, and page-area colors belong to each page.

### Page-level tabs

Every selected page keeps the existing tabs:

- **Contenu**: page title and its ordered component list.
- **Apparence**: page theme, palette, typography, and area-specific colors.
- **Réglages**: URL, page type, navigation/footer mode, commerce associations, SEO.

### Collapsible page rail

The page rail can switch between:

- Expanded width: approximately `315px`.
- Compact width: approximately `72px`.

Compact mode keeps recognizable icons, selected state, tooltips, and the create-page action. The preference is stored locally per browser and never blocks the builder if storage is unavailable.

## Site Chrome

### Global logo

The restaurant logo remains a shared asset. The builder exposes:

- Main logo upload, preview, replacement, and removal.
- Alternate logo for contrasting navigation backgrounds.
- Favicon upload, preview, replacement, and removal.
- Navbar and hero logo sizes.

### Navigation

The global navigation editor owns:

- Ordered links sourced from pages with navigation enabled.
- Desktop link visibility.
- Hamburger behavior.
- CTA label, target, colors, shape, size, and variant.
- Solid, transparent, and transparent-to-solid-on-hover states.
- Background and text colors for every state.
- Logo position and alternate logo behavior.

Each page has a navigation mode:

- `inherit`: use the global navigation.
- `full`: show the complete global navigation.
- `compact`: show logo and hamburger only.
- `hidden`: render no navigation.

### Footer

The global footer editor owns:

- Logo/name visibility.
- Description, address, phone, and hours visibility.
- Copyright text.
- Social links.
- Footer layout and colors.

Each page has a footer mode:

- `inherit`: use the global footer.
- `full`: show the complete global footer.
- `compact`: show copyright and social links only.
- `hidden`: render no footer.

Page modes are stored as page-local overrides while the shared content stays site-wide.

## Page Appearance

Every page can have an independent appearance regardless of its type.

### Theme selection

The theme picker uses visual cards with:

- Theme name and description.
- The catalog color swatches.
- A clear selected state.
- A custom palette option.

### Local palette and typography

Page appearance supports:

- Page background.
- Main surface and card background.
- Brand/accent color.
- Primary and secondary text colors.
- Heading and body font pairings.
- Advanced role typography where supported by commerce pages.

### Area-specific colors

Relevant controls depend on page type.

Landing/content pages expose section-level appearance through each component.

Order pages expose:

- Navigation area.
- Restaurant hero.
- Restaurant metadata.
- Category bar.
- Product gallery background.
- Product card background, text, price, and accents.
- Search and product-detail surfaces.

Catering pages expose:

- Navigation area.
- Restaurant hero.
- Metadata.
- Service gallery background.
- Service cards, buttons, labels, and accents.

## Content Page Component Library

Landing and content pages can contain any number of components.

The **Ajouter un composant** action opens a searchable, grouped component library:

### Essential

- Hero banner
- Text and image
- Gallery
- Scrolling text
- Promo banner

### Commerce

- Popular products / menu highlights
- Feature cards
- Action buttons

### Trust and social

- Testimonials
- About blocks
- Social links/feed

### Specialized

- Picnic basket

Components can be inserted, selected, edited, hidden, reordered, duplicated where supported, and deleted. Adding a component must be available from the page inspector and the canvas. Between-section insertion controls should make placement explicit instead of always appending silently.

Order and catering pages continue to render their associated commerce experience. Their page sections remain compatible with the public renderer, but the initial component-library rollout focuses on landing/content pages.

## Structured Component Editors

### Hero banner

The Hero editor exposes:

- Headline and subheadline.
- CTA text.
- CTA target through an internal-page selector plus custom URL/anchor support.
- Foreground image upload, current thumbnail, replacement, and removal.
- Background image upload, current thumbnail, replacement, and removal.
- Image focal point.
- Layout, height, text position, overlay color/opacity, image fit, and image position.
- Independent title, subtitle, and CTA typography/colors.

The preview may show a disabled CTA while its target is empty, but the published renderer only emits a navigable button when the target is valid.

### Feature cards

The editor exposes:

- Optional section title.
- Add/remove/reorder card.
- Image upload and current thumbnail per card.
- Card title, subtitle, and target.
- Internal-page selector plus external URL support.
- Card layout and appearance controls.

### Gallery

The editor exposes:

- Multiple image upload.
- Current thumbnails.
- Alt text.
- Remove and reorder actions.
- Grid/masonry layout.
- Columns, gap, corner radius, and background controls where supported.

### Other structured components

No supported section may fall back to the generic “structure composée” read-only message. Every component offered by the library must have a structured editor before it is considered available in V3.

## Public Page Addresses

### Unique canonical slugs

Every persisted page keeps a unique canonical slug. Validation runs against all draft and published pages and provides:

- Immediate duplicate detection.
- Reserved-route detection.
- A suggested available slug.
- A direct link to the conflicting page when the conflict is inside the current draft.

### `/order` and `/catering`

`/order` and `/catering` remain stable aliases, not canonical page slugs.

- The default order page is reachable through `/order`.
- The default catering page is reachable through `/catering`.
- Additional order/catering pages use their own canonical slugs.
- The editor labels the canonical field **Adresse spécifique** for commerce pages.
- A default commerce page prominently displays its fixed **Adresse publique principale**.
- Entering `order` or `catering` no longer produces an unexplained generic error. The UI explains the alias and offers to mark the compatible page as principal.

Legacy pages currently stored with reserved slugs are reconciled to an available canonical slug while preserving their sections and assigning a default alias when possible.

## Preview and Publishing Contract

1. Every field update mutates the canonical draft state.
2. The complete draft snapshot is sent to the iframe.
3. The iframe renders the same components and configuration mapping as the public page.
4. Internal links inside preview select the corresponding builder page without leaving the builder.
5. External links are not followed accidentally in edit mode.
6. Autosave completion and iframe acknowledgement are separate visible states.
7. Publish remains disabled until the current preview revision is acknowledged and all field errors are resolved.

## Compatibility

- Existing V2 section content and settings remain valid.
- Existing image URLs are displayed in the correct foreground/background uploader.
- Existing Feature Cards and Gallery arrays remain editable in place.
- Existing custom palettes, section colors, and typography are preserved.
- No applied migration is modified.
- New page-local options use backward-compatible optional values.

## Testing Requirements

### Unit tests

- Component editor state mutations preserve sibling fields.
- Reserved aliases and duplicate slugs produce actionable results.
- Navigation/footer page modes normalize safely.
- Page appearance overrides map to the public renderer.
- Legacy sections keep their structured content.

### Admin E2E

- Hero CTA text and target visibly update the preview.
- Existing Hero background and foreground images appear in the correct uploader.
- Image upload updates preview, survives reload, and survives publish.
- Feature Cards can be added, edited, reordered, and published.
- Gallery images can be uploaded, reordered, removed, and published.
- Multiple components can be inserted into one content page.
- Visual theme cards update each page independently.
- Navigation/footer modes affect only the selected page.
- Duplicate and reserved addresses show actionable guidance.
- `/order` and `/catering` resolve to the selected default page.
- Rail collapse/expand preserves selection and survives reload.

### Public rendering

- Desktop and mobile public pages match the published draft.
- Order and catering pages use only their selected menus/services.
- Content pages keep their independent theme and typography.
- Navigation and footer modes render correctly per page.
- Existing restaurants with legacy V2 content render without 404 or startup failure.

## Delivery Sequence

1. Add failing regression tests for the reported bugs.
2. Restore structured media and component editors.
3. Add the component library and insertion UX.
4. Move themes and typography to page appearance.
5. Add page-local navigation/footer modes.
6. Replace reserved-slug errors with the alias workflow.
7. Add the collapsible page rail.
8. Run focused tests, complete Website V3 E2E, and cross-service validation.

