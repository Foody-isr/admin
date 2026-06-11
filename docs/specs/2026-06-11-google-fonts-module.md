# Google Fonts module — website builder font library

**Date**: 2026-06-11 · **Status**: approved (design validated in session)

## Goal

Let each restaurant search the full Google Fonts catalog (~1,900 families) from the
website builder's Typography panel and add/remove fonts to its own library. Added
fonts become selectable everywhere the curated fonts are today (per-section menu
overrides, hero name font) and load correctly on the public site.

## Decisions

- **Scope**: per-restaurant. Extra fonts are stored in the restaurant's
  `WebsiteConfig.typography` opaque JSONB blob (`extraFonts` key) — zero Go changes,
  rides the existing draft/publish flow.
- **Catalog source**: build-time script (`scripts/fetch-google-fonts-catalog.mjs`)
  fetches `https://fonts.google.com/metadata/fonts` (no API key) and writes a trimmed
  `src/lib/google-fonts-catalog.json` (family, category, weights, Hebrew flag,
  popularity). Lazy-loaded only when the browser modal opens. Refresh with
  `npm run fonts:catalog`.
- **No live Google dependency** at runtime for search; previews load per-row via the
  css2 endpoint with `&text=` subsetting (tiny, keyless).

## Storage shape

```jsonc
// WebsiteConfig.typography (camelCase, opaque to the server)
{
  "sizeScale": 1.1,
  "roles": { "itemName": { "font": "Lobster" } },
  "extraFonts": [
    { "family": "Lobster", "category": "display", "weights": [400], "supportsHebrew": false }
  ]
}
```

## Components

- **foodyadmin**
  - `scripts/fetch-google-fonts-catalog.mjs` → `src/lib/google-fonts-catalog.json`.
  - `ExtraFont` type + `extraFonts` on `TypographyOverrides` (`lib/api.ts`).
  - `website-fonts.ts`: merge curated + extra fonts for pickers; weighted dynamic
    loading for non-curated families.
  - `FontLibraryBrowser.tsx`: modal with search box, category chips, "Compatible
    hébreu" toggle, rows rendered in their own face (IntersectionObserver-lazy),
    add/remove per row. Sorted by popularity.
  - `TypographyPanel.tsx`: "Bibliothèque de polices" block (chip list of added fonts
    with remove ✕, "Parcourir Google Fonts" button); "Mes polices" optgroup in the
    per-section selects; `normalizeTypography` preserves `extraFonts`.
  - Hero name font picker (`website/page.tsx`) includes extra fonts.
- **foodyweb**
  - `TypographyOverrides.extraFonts` in `lib/themes/typography.ts`.
  - `applyTheme.ts` / `curatedFonts.ts`: load extra families with their stored
    weights instead of the bare-400 fallback.

## Removal semantics

Removing a font from the library removes it from pickers. A still-referenced family
keeps loading on the public site (graceful); the select shows the orphan value until
the owner picks something else. No hard breakage.

## Out of scope

Custom font upload (separate initiative), global/superadmin library, per-section
page-block fonts in foodyweb sections (`components/sections/typography.ts` keeps its
400-weight fallback for unknown families).
