# Website V3 Navigation States

## Objective

Make Website Builder V3 navigation predictable in the editor and public site:

- desktop preview always renders the desktop layout;
- navigation can be solid, always transparent, or transparent with a colored hover state;
- background and text colors remain legible in transparent and colored states;
- the Navigation inspector lists every editable page and controls whether it appears in the navbar.

## User Experience

The Navigation group exposes three styles:

1. **Pleine** — the bar uses the configured background and text colors.
2. **Toujours transparente** — the bar remains transparent and uses the transparent-state text color.
3. **Transparente puis colorée au survol** — the bar starts transparent over the first hero and switches to the configured background and solid-state text color while hovered.

For the third style, the existing `navbar_color` field represents the hover background, `navbar_overlay_text_color` represents the resting text color, and `navbar_text_color` represents the hover text color. This preserves existing stored configurations without adding a database field.

The inspector includes a **Pages dans la navigation** list. Each non-technical page shows its title, public path, type, and a switch bound to `nav_visible`. Page ordering continues to follow the page rail, so there is only one ordering control.

## Rendering

`ContentPage` detects whether its first visible section is a hero banner and passes that information to `SiteNavbar`. Overlay navigation is only positioned over a real hero. Pages without a hero use a readable solid fallback.

The desktop preview iframe uses a fixed 1280-pixel layout viewport and scales the rendered frame to fit the available canvas. Its responsive breakpoints therefore match a desktop browser even when the builder's right column is narrow. Mobile preview behavior remains unchanged, and the builder itself remains unavailable on mobile.

Technical footer-only legacy pages are removed from the editable page rail when their slug or title identifies the `_site` artifact. Their footer sections remain attached to the global site inspector.

## Compatibility

- Existing `overlay` configurations keep their current stored values.
- Existing `navbar_color` values become the explicit hover background for overlay mode.
- Public pages continue to derive navbar links from published V3 pages with `nav_visible !== false`.
- No API contract or database migration is required.

## Validation

Automated coverage will verify:

- the desktop preview viewport remains 1280 pixels and reveals inline links;
- overlay navigation is transparent at rest and changes background/text on hover;
- always-transparent navigation does not become solid on hover;
- page visibility switches update preview navigation immediately and persist through publication;
- technical `_site` pages are excluded from the rail without deleting the global footer;
- existing Website V3 unit, TypeScript, lint, and desktop E2E suites remain green.
