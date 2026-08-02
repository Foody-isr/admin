# Website V3 Homepage and Component States

## Objective

Complete the Website V3 appearance model without making the builder harder to use:

- distinguish the site's entry page from the canonical order and catering pages;
- keep global navigation, restaurant-name, CTA, and footer defaults while allowing sparse page overrides;
- style the order category bar differently before and after it becomes sticky;
- expose the missing footer and Menu Highlights appearance controls;
- keep iframe preview and published rendering on the same code path.

Mobile Website Builder remains unavailable. Public mobile rendering continues to consume the published settings.

## Page Identity and Public Routes

`WebsitePage.is_homepage` is a new persisted boolean. It is independent from `is_default`:

- `is_homepage` selects the single page opened from `/r/:restaurant`;
- `is_default` continues to select the page behind `/order` or `/catering` for its commerce type.

Exactly one non-deleted page must be the homepage in every published V3 state. Selecting a new homepage clears the previous selection in the editor and publication transaction. The homepage cannot be deleted until another page is selected.

The root route resolves the selected page's public address:

- a landing homepage renders directly at `/r/:restaurant`;
- a default order homepage redirects to `/r/:restaurant/order`;
- a default catering homepage redirects to `/r/:restaurant/catering`;
- a content or non-default commerce homepage redirects to its published slug.

For existing restaurants without `is_homepage`, recovery chooses the first available candidate in this order: published landing page, default order page, default catering page, then the first published page by sort order. This recovery must not change `is_default`.

The builder labels the two concepts explicitly:

- **Page d’entrée du site** for `is_homepage`;
- **Page commande principale** or **Page traiteur principale** for `is_default`.

## Global Defaults and Page Overrides

Global values remain the default for every page. A page override is sparse: an absent field means inherit, while an explicit value wins.

### Restaurant Name

The global `hide_navbar_name` remains under site navigation settings. Each page adds a three-state control:

- **Hériter du site**: omit `appearance_overrides.hide_navbar_name`;
- **Afficher**: store `false`;
- **Masquer**: store `true`.

The page appearance merger applies this value before `SiteNavbar` resolves its final settings.

### Navigation CTA

The existing `navbar_cta` content fields remain compatible: `enabled`, `text`, `link`, `shape`, and `size`. CTA appearance gains two explicit surface states:

- `transparent`: presentation while an overlay navbar is transparent;
- `solid`: presentation while the navbar is colored, hovered, focused, or used without an overlay hero.

Each state supports `variant` (`filled`, `outline`, or `ghost`), `bg`, `text_color`, and `border_color`. Existing top-level `bg`, `text_color`, and `variant` values feed the solid state when the new object is absent. Transparent state keeps the current frosted fallback when unset.

The site inspector edits global defaults. A page may set `appearance_overrides.navbar_cta`; its sparse state fields merge over the global CTA. The public navbar selects the correct state from the same `transparentNow` value already used for its background and text.

## Footer Editing

The footer remains one global `_site` section. Its controls are reorganized instead of duplicated.

### Site Content

**Identité du site → Contenu → Pied de page** edits:

- custom copyright text;
- logo visibility;
- restaurant description visibility;
- address, phone, and opening-hours visibility;
- social links.

### Site Appearance

**Identité du site → Apparence → Pied de page** edits:

- layout: columns, centered, or minimal;
- background preset and custom background color;
- primary text color;
- muted text color;
- accent/social-button color;
- divider color.

These values remain in the footer section's `layout` and `settings`. Existing `color_style`, `custom_bg`, and `custom_text` remain valid; new optional settings are `custom_muted`, `custom_accent`, and `custom_divider`.

Each page keeps its existing footer mode control: inherit, full, compact, or hidden. Page mode changes composition only; colors and content remain global.

## Order Category Bar States

Order pages expose two color groups in page appearance:

1. **Position normale** — the category bar in its original document position;
2. **Position sticky** — the category bar after it pins to the viewport header.

Both groups support background, text, active category, and divider colors. They are stored in the page's existing `section_colors` object:

```json
{
  "categoryBar": {
    "bg": "#ffffff",
    "text": "#111827",
    "accent": "#315fce",
    "divider": "#e5e7eb"
  },
  "categoryBarSticky": {
    "bg": "#111827",
    "text": "#ffffff",
    "accent": "#d6ff3f",
    "divider": "#111827"
  }
}
```

`categoryBarSticky` is optional and inherits each missing field from `categoryBar`. `categoryBar` continues to inherit from the theme when absent, preserving existing sites.

The current stuck-state detection remains the source of truth. `GroupTabs` changes CSS variables according to that state rather than maintaining a second visual implementation.

## Menu Highlights Appearance

Each `menu_highlights` section exposes appearance settings alongside its content editor:

- section background and section text;
- card background;
- card primary text;
- card muted text;
- price color;
- action/accent color.

The section stores optional values in its own `settings`: `custom_bg`, `custom_text`, `card_bg`, `card_text`, `card_muted`, `price_color`, and `accent_color`. Empty values inherit the active page theme. The renderer applies section-scoped CSS variables so multiple Menu Highlights sections can use different palettes on the same page.

## Builder Organization

- Site content contains footer copy and visibility.
- Site appearance contains footer styling.
- Site settings retain global logos, navigation defaults, global restaurant-name visibility, and global CTA configuration.
- Page settings contain homepage selection, canonical commerce selection, navigation composition, restaurant-name override, and footer mode.
- Order page appearance contains normal and sticky category-bar palettes.
- Menu Highlights appearance contains its section-specific palette.

Advanced page fields stay hidden while the corresponding control is set to inherit. This keeps the common path short while preserving explicit overrides.

## Preview and Publication Flow

The admin draft payload round-trips `is_homepage` and every new sparse appearance field. Preview messages continue to send the full draft state to Foody Web. The iframe and public site both use the same page appearance merger, navbar renderer, category tabs, footer renderer, and Menu Highlights renderer.

Publication performs page upserts before validating the final homepage count, so a newly-created page can become homepage in the same transaction. Any validation failure rolls back page, section, config, and homepage changes together and leaves the draft dirty.

## Validation and Recovery

The server rejects publication when:

- zero or multiple non-deleted pages are marked as homepage after legacy recovery;
- a homepage page ID belongs to another restaurant;
- a deleted page remains selected as homepage;
- existing page, section, slug, or commerce invariants fail.

The admin surfaces homepage errors on the selected page's settings tab. It prevents deleting the current homepage and explains that another page must be selected first.

Unknown appearance keys remain preserved by the JSON round trip. Invalid enum values inherit safe defaults in the public renderer rather than breaking a page.

## Testing

### Foody Server

- draft validation accepts exactly one homepage and rejects zero or multiple homepages;
- selecting a new homepage persists atomically;
- legacy publication recovers a landing, default order, default catering, or first page in that order;
- homepage recovery does not modify commerce `is_default` values;
- cross-restaurant and deleted-page references remain rejected.

### Foody Admin

- homepage selection clears the previous page and uses distinct labels from commerce defaults;
- restaurant-name controls produce inherit, show, and hide payloads;
- footer content and appearance fields update the `_site` footer section;
- normal and sticky category palettes serialize independently with inheritance;
- global and page CTA state controls serialize without dropping existing CTA content;
- Menu Highlights appearance fields update only the selected section;
- every field updates the iframe draft immediately.

### Foody Web

- the root renders a landing homepage and redirects to canonical or slug routes for other homepage types;
- legacy restaurants receive the documented deterministic fallback;
- restaurant-name visibility resolves global default plus page override;
- CTA appearance switches with transparent and solid navbar states;
- category colors switch only when the bar becomes sticky;
- footer settings render in all layouts and page footer modes still work;
- separate Menu Highlights sections retain separate palettes.

### End-to-End

On development, publish and verify one landing homepage and one order homepage. For the order case, `/r/:restaurant` must redirect to `/order`. Confirm all appearance changes first in the iframe and then on the published desktop and public mobile site.

## Compatibility

- No existing public route is removed.
- `is_default` semantics do not change.
- Existing CTA, footer, category-bar, and Menu Highlights settings remain valid.
- Missing new fields preserve the current visual output.
- Existing dirty drafts are recovered without manual database edits.
