Staff → employee → Edit contact details explicitly saves restaurant-owned name,
phone and home address without changing login credentials or another restaurant.
Couriers also have a default final destination and a Same as home address choice.
New plans (including empty courier placeholders) snapshot that default unless an
explicit endpoint overrides it; existing routes with deliveries keep their settings.
Upcoming courier reminders use updated contact details; completed orders retain
history. Deploy the API staff-profile schema (migration 272 audit) before this UI.
Synthetic regression: `npx playwright test -c playwright.redesign.config.ts
staff-profile.spec.ts delivery-planner.spec.ts team-square.spec.ts`.

Articles and Cartes share the same anchored availability editor: opening never
writes, and Apply confirms unlimited, unavailable, predefined remaining stock or
automatic rules. Articles loads fresh tenant stock and shows the current series
when applicable; outside series, all size counters save atomically with revision
checks. Deploy the matching API restock extension before this Admin version.

The carte Availability badge opens a compact anchored editor. Choose unlimited,
unavailable, predefined remaining stock or the existing automatic rules, then Apply.
Opening, changing choices and cancelling never write stock. Quantities can be
counted, measured in base g/ml or entered per size; committed orders are preserved.
Errors retain input and allow an explicit stock reload. The row ellipsis opens the
same editor. Stock preparation and carte publication remain separate workflows.
Website V3 → Order journey can draft and publish the optional entry sign-in
invitation. Settings → Usage and quotas is read-only restaurant-scoped Google and
Geoapify consumption, including independent units, 80% warnings and UTC renewal.
Deploy API migration 268 and the remaining-stock route before this Admin version.


Orders → Deliveries → WhatsApp reminders reviews the approved current route message
for every pending customer across all routes on the selected date. Previewing can
happen early; manual sending opens on J−1 in the restaurant timezone. One explicit
confirmation sends eligible customers separately; per-customer actions use the same
review and dispatch ledger. Already submitted/uncertain reminders are not replayed,
and route changes stop queued sends until review is refreshed. Automatic sending
remains configured in Order workflow with its own stage template/timing; choose
Day before for J−1. Requires the matching API reminder preview/claim update first.
Browser regressions use synthetic API fixtures:
`npx playwright test -c playwright.redesign.config.ts delivery-whatsapp.spec.ts`.

# Foody Admin

Carte editing uses private drafts with explicit Save draft, Preview and Publish.
The selected series scopes a rotating carte and its prepared sale allowances.
Unsaved navigation offers save/discard/continue; operational availability switches
marked immediate are journaled independently. Stock history is a read-only restaurant
journal with item, series-date and movement filters, also accessible from a product.
Prepare or adjust series allowances in the carte draft, then publish them. Product prices and recipes
remain shared library edits. Requires API migration 267 and its draft/stock routes;
deploy the API before this Admin revision.


Delivery planning limits scheduled deliveries to the selected route date and
displays total duration with separate driving, waiting and handover times in the
dispatcher and courier views. Unknown historic breakdowns are omitted until
recalculation. Requires API migration `256_delivery_duration_breakdown.sql`;
date rejection is enforced by the API and localized in French, Hebrew and English.

In Website V3 → Liste des articles → Disposition et couleurs, **Appliquer le
style Wolt** restores flat compact rows, landscape photos on the right,
descriptions, category headings and a local black/gray/cyan palette. It replaces
conflicting legacy card settings in one draft update and can be applied again.
**Utiliser les couleurs du site** restores the assigned shared color style.
The preset never edits shared styles or fulfillment/ordering preferences.
It requires the Web renderer advertising `order_wolt_preset: 1`.
Visual regression with public Crispy Delivery catalogue/photos and in-memory
draft/publication writes: `FOODY_CRISPY_MENU=1 npx playwright test -c
playwright.website-editor.config.ts order-list-styles.spec.ts`.

Self-service web portal for restaurant owners and managers. Used to manage day-to-day restaurant operations from any browser: view orders, manage the menu, track analytics, invite staff, and handle billing. **Not for end customers** — access is restricted to users with the `owner` or `manager` role.

## Environments

| Environment | Domain | API | Source |
|-------------|--------|-----|--------|
| **Production** | `admin.foody-pos.co.il` | `api.foody-pos.co.il` | Manually promoted Vercel deployment from `develop` |
| **Development** | `dev-admin.foody-pos.co.il` | `dev-api.foody-pos.co.il` | `develop` |
| **Local** | `localhost:3003` | `localhost:8080` | any branch |

## WhatsApp accounts

WhatsApp settings (`/[restaurantId]/settings/whatsapp`) support either Foody-managed
onboarding or **My own Twilio account**. The personal mode accepts an Account SID,
API Key SID and secret (or an Auth Token), an already registered WhatsApp Sender
SID, Meta WABA/Phone Number IDs, the international number, and Utility Content
SIDs for notifications. Configure the detailed confirmation/courier reminder pair
or the legacy confirmation/status pair. Twilio
bills the restaurant's account directly for WhatsApp; phone verification codes
retain their existing billing. No Meta access token is needed for this Twilio flow.

The API verifies the account, online sender, number/WABA match and approved Utility
templates without sending a test message. Secrets are write-only, cleared from
the form after submission, and never restored from the API. Personal connections
can be edited to rotate credentials and update templates; switching billing modes
requires disconnecting first. Deploy the API and migration 237 before this UI.

Personal-connection errors identify the failing verification and template field in
French, Hebrew or English. Pending WhatsApp templates must reach Approved in
Twilio before saving. Recognized failed checks keep the form editable and clear
the secret; lost or unrecognized responses still require checking the saved
connection before retrying. Provider error text is never displayed.

The detailed templates have separate fields and copyable French, Hebrew and English
examples. Confirmation is automatic when configured; order dialogs also expose
a read-only Twilio preview and a confirmed send, alongside the existing editable
manual WhatsApp message. Delivery reminders require an assigned courier and saved
delivery date/window. Only the saved order supplies recipient and variables.
An accepted or uncertain attempt is never submitted twice.

The four-variable reminder announces tomorrow's delivery. Its read-only preview
can be prepared early; manual sending is limited to the day before, using the
restaurant's timezone. Its variables are customer
full name, time window, courier full name and phone, and restaurant name. Existing
five-variable reminder templates retain their original mapping and date handling.

Deploy the API and migration 239 before these new controls. Template contracts
and French texts are documented in the matching server's
`docs/WHATSAPP_ORDER_MESSAGES.md`. Regression checks:
`npx playwright test -c playwright.whatsapp.config.ts`.

## Direct Meta coexistence pilot

Settings → WhatsApp also includes a direct Meta coexistence pilot for an existing
WhatsApp Business app number. Deploy API migrations 240–241 first and configure its
distinct v4 Login configuration and signed webhook; the Admin obtains public SDK
settings from the scoped API and needs no new public environment variable. This
flow verifies connection and synchronization.
The SDK authorization code is exchanged immediately, even if Meta's separate
session-completion message is missing or delayed. The API resolves the expected
coexisting number only within the authorization's explicitly granted accounts.
Native Meta Utility templates can
then be submitted, checked for approval and explicitly selected for automatic
confirmation and optional status/receipt notifications. Courier reminders retain
the reviewed order action. A Meta failure never triggers a Twilio send. The order
dialog displays delivery/read evidence separately from acceptance and can refresh
the same dispatch without resending. The matching server's `docs/WHATSAPP_COEXISTENCE.md` documents
setup and real-phone acceptance. Isolated checks use
`npx tsx --test src/lib/whatsapp-coexistence.test.ts` and the WhatsApp Playwright suite.

The WhatsApp workspace puts the connected number and one row per customer message
first. Each row explains its actual trigger; configuration and message previews
open in a drawer. Template choices remain a local draft until the explicit
activation/save action. Creation has a separate review drawer and protects edited
text on dismissal. The template library exposes approval states, while technical
connection details, alternate Twilio connections and phone verification are
collapsed. Existing Twilio-only installations still open their connection settings
directly. This presentation does not change sending rules, provider selection or
the mandatory confirmation/reminder pair.

Accepting an order leaves the order open and never automatically opens the manual
WhatsApp composer. Its explicit Actions → Send confirmation action remains available;
server-side automatic notifications retain their configured triggers.
Order details → **Customer messages** (also under Actions) opens a read-only drawer
of tracked attempts with current provider status and evidence timestamps. It refreshes
while open, supports older pages and is available with `orders.view` or `orders.manage`.
It includes native Meta dispatches and ledger-backed Twilio sends, excludes prepared
previews, and does not claim to track app/deep-link sends or older unrecorded Twilio
notifications. Twilio acceptance is distinguished from delivery/read evidence.
The drawer links to Settings → Communications → WhatsApp; workflow-stage triggers
and customer-notification switches live at `/[restaurantId]/settings/orders/workflow`.
Deploy the matching history API before this UI; no migration is required.

## Selection controls

Admin selections follow the Square reference: white option rows with separators,
a trailing filled radio for one choice, and a trailing checkbox for multiple
choices. Use `ChoiceRow` from `components/ds/Selection` with a shared native radio
`name` for exclusive groups. Existing labelled rows use `selection-row`; compact
table selection keeps its column placement and shares the same checkbox styling.
Use `Switch` from `components/ui/switch` for explicit localized yes/no segments,
or `BooleanInput` when retaining native input events and form submission. Clicking
the active segment is a no-op; Space still toggles the accessible switch. Native
and Radix controls preserve disabled, indeterminate, focus, dark and RTL states.
Long searchable pickers retain their search and keyboard behavior.

The dev-only `/design-system` page includes interactive examples. Browser checks:
`npx playwright test -c playwright.redesign.config.ts tests/redesign/selection-controls.spec.ts`.

## Quick Start

```bash
cd foodyadmin
npm install
npm run dev   # runs on http://localhost:3003
```

### Local `.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
```

For testing against the dev server:

```bash
NEXT_PUBLIC_API_URL=https://dev-api.foody-pos.co.il
```

## Purpose in the Foody Ecosystem

Foody is a multi-tenant restaurant POS & QR ordering platform. The admin portal sits between the Foody superadmin backoffice and the customer-facing apps:

```
foodybackoffice  (Foody internal team — superadmins)
       ↓ manages restaurants + billing
  foodyserver (API)
       ↓ serves
  foodyadmin  ← You are here (restaurant owners & managers)
  foodyweb (QR guests) + foodypos (POS tablets)
```

Restaurant owners and managers use this portal to:
- **Monitor** live order activity and today's KPIs without needing the Flutter POS tablet
- **Manage** the full menu (categories, items, modifiers, images, availability)
- **Update** restaurant settings (order approval, service mode, tips, scheduling)
- **Track** sales analytics and top-selling items
- **Invite** and manage staff members
- **Handle** subscription billing — enter/update payment method, view payment history, change plan

## Pages & Features

### Login (`/login`)

- Email + password login using existing `foodyserver` auth
- Only `owner` and `manager` roles are accepted — any other role (superadmin, cashier, chef, waiter) is rejected at login with a clear error message
- Multi-restaurant owners (with multiple `restaurant_ids` in their JWT) are redirected to the restaurant picker after login
- Single-restaurant owners go directly to their dashboard

### Restaurant Picker (`/select-restaurant`)

- Shown only for users with access to more than one restaurant
- Lists all accessible restaurants by name
- Clicking a restaurant navigates to `/[restaurantId]/dashboard`

### Dashboard (`/[restaurantId]/dashboard`)

Home prioritizes the selected service or order-date period. A compact contextual notice highlights the next action, such as a payment that needs attention, with a direct shortcut. Order totals appear once in the performance summary. Date presets and the order/fulfillment date basis retain their per-user and restaurant persistence.

In série mode, the main chart shows when the selected service's orders were placed. Upcoming and same-day services hide comparisons with completed services; historical service charts align comparison days relative to the service date. In order-date mode, today's hourly volume remains independent of the selected performance period. The right rail provides permitted shortcuts and the five most recent orders for the selection. Production links carry the selected single-service date, and payment attention retains the date basis, including preorders awaiting acceptance.

The revenue-scope control explains which orders contribute to performance and links to the restaurant settings. Empty and unavailable data remain distinct; missing comparisons produce no N/A badges or fabricated growth.

To preview the service dashboard with synthetic preorders, run `node tests/redesign/dashboard-preview-server.mjs`, then `NEXT_PUBLIC_API_URL=http://127.0.0.1:18080 npx next dev --port 3103`. Open `http://localhost:3103/1/dashboard`. If sign-in is required, the local fixture accepts `demo@foody.test` / `demo-local`. This API keeps all data in memory and never proxies a real service. Dashboard browser checks run with `npx playwright test -c playwright.redesign.config.ts tests/redesign/dashboard-service.spec.ts`.

### Orders (`/[restaurantId]/orders`)

Orders awaiting weight confirmation keep the primary action visible but disabled
as **Weights to confirm** until weighing and capture have completed. The weighing
and cancellation actions stay available; closing and status overrides cannot
bypass this hold. The API also blocks advancement and automatic kitchen dispatch.

Full order list with:
- Status filter tabs (all / pending / active / completed)
- Per-order: order ID, type (dine-in / pickup / delivery), customer name, amount, status badge
- Status update buttons on each order (accept, send to kitchen, mark ready, mark served/delivered)
- Real-time: page re-fetches automatically to stay current

Internal orders (`/[restaurantId]/orders/new`) can select **Article library**
beside the carte tabs. It lists the restaurant's active items independently of
menu membership, POS channels and rotating-series composition, including when
there is no POS carte. Search, customization, stock checks and checkout use the
same item data and ticket. Switching sources preserves the cart and does not
publish library items on customer channels. Browser regressions:
`npx playwright test -c playwright.redesign.config.ts internal-order-library.spec.ts`.

The list and order detail routes share a persistent workspace. Opening or closing
an order, including browser Back/Forward, preserves the selected date/série,
filters, search, page and scroll position. Search runs while typing or on submit;
older responses and live events cannot replace the current filtered results.
Failed list requests show a retry action. Regression checks use synthetic data:
`npx playwright test -c playwright.redesign.config.ts orders-square.spec.ts orders-detail-square.spec.ts`.

### Verifone refunds and VOID

The order payment section includes **Refund or void payment** for an owner or
manager with `payments.manage`. It supports a single verified Verifone ILS online
sale or confirmed capture. Choose the full remaining amount or a partial amount,
enter a reason and review the exact amount before confirming once. A full VOID
is available only for a compatible provider settlement state, not simply an
order placed today. Uncaptured holds use the existing cancellation/release flow.
For a captured ABS sale still authorised/unsettled, only the full VOID action
and **Available to void** are offered, with an explanation that refund is not
available before settlement. **Available to refund** and partial/total refunds
appear only after verified settlement (or matched partially-refunded history).
Ambiguous states offer neither action. A rejected request is explicitly labelled
as rejected by Verifone, not as refunded or necessarily an issuer decline.
Mixed/table/session, external-terminal and catering payments are outside this
first Admin control. The API rejects unsupported allocations.

History displays confirmation, refusal or verification-required states. An
uncertain operation disables new money actions and **Check with Verifone** only
reconciles the recorded request; it never resends a financial POST. A lost result
without a recoverable provider ID needs Central/support verification. Food
preparation, stock, items and fulfillment are unchanged. Invoice4U credit or
cancellation documents require a separate check. Deploy API migration 265 before
this UI; FoodyPOS buttons are not part of this version. Browser tests use only
synthetic in-memory fixtures:
`npx playwright test -c playwright.redesign.config.ts payment-adjustments.spec.ts`.

### Deliveries (`/[restaurantId]/orders/deliveries`)

Routes marked `needs_recalculation` hide obsolete distances, durations and arrival
estimates, with an explicit recalculation notice. Draft unassignment remains
available. The matching API omits legacy stops whose orders were removed and
cleans them during recalculation; permanent order deletion removes its stops
transactionally. Deploy that API before this Admin update.

The dispatcher uses the shared monochrome workspace components, an explicit route
date, and In progress/History tabs. Delivered and skipped stops leave the active
list and map; completed routes remain available by date in History. Mobile users
can switch between list and map and open stop details. Only unfinished deliveries
return to planning when a draft route is unassigned.

Deploy the matching API completion synchronization first. It also reads historic
route stops against their orders so old delivered orders do not reappear as work.
Browser regressions use synthetic data only:
`npx playwright test -c playwright.redesign.config.ts delivery-planner.spec.ts`.

### Menu (`/[restaurantId]/menu`)

Full menu management:
- Categories list — all categories expanded by default
- Per category: item count, edit name, delete category (with confirmation)
- "Add Item" button on each category header
- Per item: name, description, price, active/inactive toggle, edit, delete
- Item images shown as thumbnails if `image_url` is set (uploaded from POS or future image upload)
- Add/edit modifiers (add-ons, removals, price deltas) on the item detail page (`/menu/[itemId]`)

### Analytics (`/[restaurantId]/analytics`)

- **Revenue today** and **Orders today** — same KPIs as dashboard
- **Top Selling Items** table — ranked list with quantity sold and revenue per item

### Item editor (`/[restaurantId]/menu/items/new`, `/items/[itemId]`)

Creation and editing use one continuous form: identity and photo, pricing and variants, personalizations or combo composition, customer facts, availability, recipe/cost, and assistant context. The full-page editor uses Cash Sans, inset field labels and a centered two-column layout. Status, internal categories and menu groups have separate cards alongside the form; on mobile they follow it. Translations open beside the item name. The fixed header shows unsaved changes and keeps Save/Cancel reachable, with the title appearing in the header after scrolling.

Existing `?tab=recipe`, `?tab=availability` and legacy links scroll to the corresponding section. New articles expose **Save and configure** for stock and recipe settings that need a saved item. Form fields, variants, recipe instructions and availability commit with Save; existing explicit image, modifier and ingredient operations retain their immediate persistence.

Regular articles also expose **Customization at checkout** for Foody POS:
automatic first-variant selection and skipping optional customization. Both
preferences follow the item’s explicit Save and new-item draft recovery. Legacy
items keep first-variant selection on and skip-customization off. Automatic
progression between sections after single-choice selections is a separate restaurant
setting under **Settings → Device management → Modes → Checkout → Fast order entry**. Reopening an item
keeps its editor open. These settings do not change guest web checkout or combo
composition. Deploy the matching API and POS support before enabling them.
Isolated browser checks: `npx playwright test -c playwright.redesign.config.ts tests/redesign/item-checkout.spec.ts`.

### Staff (`/[restaurantId]/staff`) and permissions (`/[restaurantId]/roles`)

The team workspaces follow the connected Square reference: an Employees title,
Export/Add employee actions, search and job filter, then Name/Job/Status columns.
Opening a member shows their contact details, role, invitation and PIN setup.
Role changes, invitation resend and removal keep their existing permission checks;
the owner cannot be reassigned or removed. CSV exports contain the filtered team.

Permissions use a passcode banner, searchable Name/Access/Team members rows and
explicitly saved full-page forms. Access lists the actual Foody permission domains.
System role names/descriptions remain locked and localized; changes to their
permissions do not overwrite their canonical identity. Unsaved changes require
explicit discard. Passcodes show setup status only; members choose their own PIN
through their setup invitation. Links open the matching member in the same restaurant.

French, English, Hebrew/RTL, dark mode and mobile layouts share scoped team styles.
Browser regressions use synthetic fixtures only:
`npx playwright test -c playwright.redesign.config.ts tests/redesign/team-square.spec.ts`.

### Settings (`/[restaurantId]/settings`)

Payments & VAT → Card hold for by-weight items exposes the scoped 0–100% margin
(20% default) to `settings.edit`. Only changed fields are sent; explicit zero,
partial saves, failed drafts, reset and read-only users retain their semantics.
The example adds a margin only to weighted items, not fixed items or delivery.
Deploy the matching settings API first; an omitted legacy field stays unavailable.
Synthetic checks: `npx playwright test -c playwright.redesign.config.ts payment-settings.spec.ts`.

**Restaurant → General** includes **Country**, saved explicitly as the restaurant's
ISO 3166-1 alpha-2 `country_code`. The country scopes delivery address suggestions
and geocoding without changing currency, language, timezone or delivery zones.
Legacy restaurants retain Israel until explicitly updated. Deploy server migration
242 first. Browser regression: `npx playwright test -c playwright.redesign.config.ts
restaurant-country.spec.ts`.

Two sections, saved separately:

**Restaurant Info:**
- Name, address, phone, description
- Delivery and pickup toggles

**Operational Settings:**
- `require_order_approval` — manual review before kitchen (vs auto-accept)
- `service_mode` — table / counter / drive-thru
- `scheduling_enabled` — allow customers to schedule future orders
- `tips_enabled` — show tips prompt at checkout
- `rush_mode` — disable optional features under high load

### Website (`/[restaurantId]/website-v3`)

**Foody online** opens the restaurant website editor directly, without a submenu or beta badge. It manages pages, sections, appearance and checkout settings with a live iframe preview. Draft autosaves remain separate from publication; the existing guest website and stored website data are unaffected by removal of the old admin editors.

The legacy `/[restaurantId]/website` and `/[restaurantId]/website-v2` implementations have been removed. Their URLs redirect to Website V3, preserving the restaurant and query parameters. Components shared with V3 and QR customization remain in use.

Draft endpoints: `GET`/`PUT /restaurants/:id/website-draft`, `POST /restaurants/:id/website-publish`, and `POST /restaurants/:id/website-discard`. Website configuration endpoints also remain available to their other consumers.

The **Text** appearance panel exposes section spacing, automatic or
S/M/L/XL minimum height (240/400/560/720 px), and content width (automatic,
640/960/1200 px, or full width). Width is independent of stacked/split layout;
the background still fills the section. Automatic values preserve historical
geometry, and long content expands the section on mobile. Autosave, undo/redo,
preview and publication share `settings.padding`, `height` and `width`.
Deploy API → Web (`text_section_dimensions: 1`) → Admin. Isolated regression:
`FOODY_WEB_DIR=../foodyweb npx playwright test -c playwright.website-editor.config.ts text-section-dimensions.spec.ts`.

The **Text and image** appearance panel exposes **Text background** and
**Image background**, independently of the shared color style. Each accepts a
hex color or transparency and can reset to the inherited section presentation.
Existing sections keep their appearance until edited. A media background shows
behind transparent pixels or around contain framing; it does not recolor opaque
image pixels. Autosave, iframe preview and publication use `settings.text_bg_color`
and `settings.image_bg_color`. Deploy the API, then the web renderer advertising
`text_image_backgrounds: 1`, then this editor.
Isolated browser regression: `FOODY_WEB_DIR=../foodyweb npx playwright test -c
playwright.website-editor.config.ts text-image-backgrounds.spec.ts`.

The editor uses contextual panels for shared elements and sections; the former Content / Appearance / Settings tab strip and unused page rail are removed. Footer content, layout and styling remain together in its accordions. Existing draft reconciliation and components shared with QR customization are retained. Publishing or discarding returns the sidebar to the section outline, including when the server replaces temporary IDs. The former generic `PageInspector`, theme and typography panels are removed. Page identity, primary/homepage flags, menu associations, SEO and social settings live in **Page settings**; catering copy and imagery have a dedicated outline entry. **Site design** owns fonts and colors, and contextual order blocks own menu typography and spacing. Historical saved appearance and uploaded fonts are preserved. In **Page settings**, menu rows keep their labels and checkboxes aligned horizontally. Enable a menu’s **Web** channel in **Items and menus → Menus**, then select it for the order page; **POS** controls the till independently. The historical menu-layout restoration action has been removed; current layout, color and typography controls remain available.

**Stories** lives in **Settings → Communications** at `/[restaurantId]/settings/stories`, with read access for `settings.view` and editing for `settings.edit`. Existing `/[restaurantId]/reels` bookmarks redirect there. The website editor links to this single owner of Instagram settings.

The **Video** section supports MP4/WebM uploads up to 50 MB, replacement and
removal, alongside the existing URL field. It reuses the restaurant-scoped cover
video upload endpoint and preserves normal playback with sound and controls.
Draft autosave, iframe preview and publication share `content.video_url`.
Its content and appearance panels also expose full page width, section spacing,
player controls, autoplay, looping and muting. Autoplay starts muted; the sound
preference becomes editable again when autoplay is disabled. Existing videos
retain manual playback and controls until edited. For a seamless video, select
full page width, no spacing, controls off and autoplay on.
The section height selector offers XS/S/M/L, matching the main banner's
250/300/400/550 px presets. Uploaded video fills the frame without distortion;
Original preserves natural proportions and is the default for existing videos.
Height is shared by the live preview and publication, including hosted players.
Deploy the API, then the renderer advertising `video_playback: 1` and
`video_height: 1`, then this editor.
Isolated browser regression: `npx playwright test -c playwright.website-editor.config.ts video-upload.spec.ts`.

The **Footer** panel offers **Add footer** when none exists. It creates a shared
`_site` section through draft autosave and undo/redo. Existing hidden or legacy
footers retain their identity and content; retired theme sections are ignored.
The footer visibility switch is independent of **Footer branding** and preserves
page-level visibility overrides. The inspector targets the footer selected by
the public renderer. Run the isolated browser regression with
`npx playwright test -c playwright.website-editor.config.ts`; it uses the sibling
`foodyweb` checkout and an in-memory API on ports 3000, 3003 and 18081.

The order page's **Item list** selects one global color style for its list,
category bar, pills and item cards. In **Site design → Colors**, each of the six
styles has optional menu colors in three collapsed groups. Unset roles remain
automatic; resetting a role restores live inheritance. Item prices have their
own color and portions follow it. Editing a style does not select it as the site
default; **Use by default** is a separate action. Shape, spacing and images remain
in the item-list panels, whose color shortcuts open the assigned global style.

**Item list → Layout → Compact list** applies a menu with lateral 3:2 photos,
descriptions, row separators and underlined sticky categories. Existing color
assignments, desktop column counts and ordering preferences are preserved.
Cards expose item spacing, row padding and price placement; Images exposes
physical left/right placement and bounded sizes. Descriptions has typography and
line-count controls. All settings use page-local `website_order` data for autosave,
preview and publication. The public renderer must advertise `order_list_styles: 1`
before this editor is deployed. The isolated regression runs with
`FOODY_MENU_APPEARANCE=1 npx playwright test -c playwright.website-editor.config.ts order-list-styles.spec.ts`.

**Header → Layout → Restaurant** adds a cover, a logo in a white frame,
the restaurant name and a hamburger using the existing navigation links.
**Information and ordering → Layout** offers two exclusive presentations:
**Modern** (service blocks) and **Classic** (status, delivery minimum and social
links). Both use the same global style selector. The selected layout is saved
in `header.restaurant.info_layout` and does not change ordering permissions.
A batch date stays read-only in Modern; Classic stays available even when the
restaurant allows choices. Older saved headers keep their previous presentation
until a layout is selected. The order page delegates its banner to this layout
to avoid duplicate covers. Delivery/pickup availability and batch calendars remain
owned by restaurant settings throughout menu, cart and checkout.
For standard headers, **Pickup, delivery and scheduling → Color style** assigns
the bar independently of header/navigation colors. **Same as header** preserves
inheritance. This reuses `header.restaurant.info_color_style`, including order-page
presentation overrides, draft autosave, preview and publication. The global
color editor reports the bar's assignment separately from the header.
Deploy the API support for `nav_layout.header.layout = "restaurant"` and its
optional `restaurant` settings before deploying the editor.

For a local Mamie menu color check, run
`FOODY_MENU_STYLES=1 node tests/redesign/website-editor-server.mjs`, then run
the admin with `NEXT_PUBLIC_API_URL=http://127.0.0.1:18081`
and `NEXT_PUBLIC_WEB_URL=http://localhost:3000`, and the guest web with
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18081`. Open `/1/website-v3` in the
admin and `/r/atelier-foody/order?lang=fr` in the guest web. The fixture contains
public menu photos, copy and appearance only; draft/publication writes stay in
the local server's memory. It does not proxy production requests. The existing
`FOODY_MENU_APPEARANCE=1` fixture exercises the legacy presentation.
Use `FOODY_RESTAURANT_HEADER=1` to include the Restaurant layout with a synthetic
delivery-only batch calendar. Saved entry prompts cannot restore mode or time
choices. Test an old pickup/scheduling URL through cart and checkout as well.
Use `FOODY_HEADER_CHOICES=1` for a shared Restaurant header with pickup, delivery
and scheduling, to verify the single bar, style changes and independent order
header edits against the home page.
Use `FOODY_HEADER_CHOICES=batch` to keep mode selection with an imposed batch
date, or `FOODY_HEADER_CHOICES=scheduled-pickup` to allow only time selection.

### Billing (`/[restaurantId]/billing`)

Self-service subscription management:

**Subscription status card:**
- Current plan (Starter / Premium / Enterprise) and status badge (Free Trial / Active / Past Due / Deactivated / Cancelled)
- Trial end date, next billing date, or grace period deadline — shown based on current status
- Saved payment method (card brand + last four digits)
- "Set up billing" or "Update payment method" button — redirects to PayPlus hosted payment page

**Plan selector:**
- Cards for Starter (₪299/mo), Premium (₪799/mo), Enterprise (custom)
- "Switch to X" button for Starter/Premium when not the current plan
- "Contact Sales" link for Enterprise
- Plan changes take effect immediately via the API

**Payment history:**
- Chronological log of all subscription events: `payment_succeeded`, `payment_failed`, `activated`, `deactivated`, etc.
- Each event shows the amount and date

## Onboarding Flow

Onboarding a new restaurant is a two-phase process: Foody does the setup, then the restaurant configures itself.

---

### Phase 1 — Foody side (superadmin in `foodybackoffice`)

**Who:** A Foody employee with the `superadmin` role.
**Where:** `backoffice.foody-pos.co.il/dashboard/onboard`

**Steps:**

1. **Open the Onboard page** — navigate to `/dashboard/onboard` in the backoffice.

2. **Fill in restaurant info:**
   - **Name** — restaurant's display name (e.g. "Joe's Pizza")
   - **Slug** — URL identifier, auto-generated from the name (e.g. `joes-pizza`). This becomes the QR ordering URL: `app.foody-pos.co.il/joes-pizza`. Must be unique across the platform.
   - **Address** — physical address
   - **Phone** — restaurant contact number
   - **Timezone** — defaults to `Asia/Jerusalem` for Israeli restaurants

3. **Set up the owner account** — two modes:
   - **Create New Owner** (most common): fill in the owner's full name, email, phone, and a temporary password. Foody sets this — share the credentials with the restaurant.
   - **Link Existing User**: if the owner already has a Foody account (e.g. they own another restaurant), select them from the dropdown. No new account is created.

4. **Select a plan** — choose Starter / Premium / Enterprise. This sets the initial feature flags for the restaurant. The plan can be changed later from the restaurant detail page in the backoffice.

5. **Submit** — one API call (`POST /api/v1/admin/restaurants/onboard`) atomically creates:
   - The `Restaurant` record in the database
   - The `User` account for the owner (if new owner mode)
   - A `UserRestaurantRole` linking the owner to the restaurant with role `owner`
   - A `Subscription` with `status: trial` and `trial_ends_at: now + 30 days`
   - Default feature flags based on the selected plan

6. **Share credentials with the restaurant** — send the owner their:
   - Login URL: `admin.foody-pos.co.il`
   - Email and temporary password
   - Restaurant slug (so they know their QR URL)

---

### Phase 2 — Restaurant side (owner in `foodyadmin`)

**Who:** The restaurant owner.
**Where:** `admin.foody-pos.co.il`

**Steps:**

1. **Log in** at `admin.foody-pos.co.il` using the email and password provided by Foody.
   - Owners with one restaurant go directly to their dashboard.
   - Owners with multiple restaurants see a restaurant picker first.

2. **Build the menu** — go to Menu, add categories and items. At minimum: category name → item name + price. Items are immediately live in the QR ordering app and POS once created.

3. **Configure settings** — go to Settings and review:
   - `Require order approval` — should orders go to a manual review queue, or auto-accept?
   - `Service mode` — table / counter / drive-thru (affects what guests see at checkout)
   - `Tips enabled` — show a tip prompt at checkout?
   - `Scheduling enabled` — allow guests to place future-dated orders?

4. **Invite staff** — go to Staff and invite managers, cashiers, waiters, and chefs. Each staff member gets their own login for the POS tablet and (for managers) this admin portal.

5. **Set up billing** *(before the 30-day trial ends)* — go to Billing and click **"Set up billing"**. This redirects to a PayPlus-hosted payment page to enter a credit/debit card. After the card is saved:
   - The subscription automatically moves to `active`
   - PayPlus handles monthly charging on the same date each month
   - The owner can update their card at any time from the Billing page

6. **Share the QR code** — the restaurant's QR ordering URL is `app.foody-pos.co.il/[slug]`. Customers scan this to order from their phones.

---

### What happens if billing isn't set up?

```
Day 0    → Trial starts (full access, 30 days)
Day 30   → Trial expires → status becomes past_due → 7-day grace period starts
Day 37   → Grace period expires → restaurant deactivated
           (POS, QR app, and admin portal all return 402 errors)
```

Once deactivated, a Foody superadmin must manually re-activate from the backoffice (Billing tab on the restaurant detail page) — or the owner can contact support.

---

### Summary table

| Step | Who | Where | What happens |
|------|-----|-------|--------------|
| Fill onboard form | Foody superadmin | `backoffice.../onboard` | Creates restaurant + owner account + trial subscription |
| Share credentials | Foody superadmin | Email / Slack | Owner receives login URL, email, password |
| Log in | Restaurant owner | `admin.foody-pos.co.il` | Owner accesses their dashboard |
| Build menu | Restaurant owner | Admin → Menu | Items go live in QR app + POS immediately |
| Configure settings | Restaurant owner | Admin → Settings | Order flow, tips, service mode |
| Invite staff | Restaurant owner | Admin → Staff | Staff can log in to POS |
| Set up billing | Restaurant owner | Admin → Billing | Enters card, subscription activates |
| Go live | — | `app.foody-pos.co.il/[slug]` | Customers can order via QR |

---

## Subscription Lifecycle (from the restaurant's perspective)

```
Onboard → trial (30 days)
              ↓ (owner sets up card in billing page)
           active  ←── monthly charge succeeds automatically
              ↓  (charge fails)
           past_due  (7-day grace period — set up billing to recover)
              ↓  (grace expires, no card update)
         deactivated  (restaurant loses API access → 402 on all calls)
```

- During **trial**: full access, billing setup is optional but encouraged
- During **past_due**: full access for 7 days — a warning is shown in the billing page
- Once **deactivated**: the POS, QR web app, and this admin portal all stop working — contact Foody support or set up billing to re-activate
- Superadmins can manually activate/deactivate from the backoffice (`backoffice.foody-pos.co.il`)

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Icons | Heroicons v2 |
| State | `useState` + `useEffect` (no external state lib) |
| API calls | Centralized in `src/lib/api.ts` |
| Auth | JWT stored in `localStorage`, roles must be `owner` or `manager` |

## Project Structure

```
src/
  app/
    login/page.tsx              # Login page (owner/manager only)
    select-restaurant/page.tsx  # Restaurant picker for multi-restaurant owners
    [restaurantId]/
      layout.tsx                # Sidebar + restaurant context
      dashboard/page.tsx        # Today's KPIs + top sellers + recent orders
      orders/page.tsx           # Orders list with status filters and update actions
      menu/
        page.tsx                # Category + item management
        [itemId]/page.tsx       # Item detail + modifiers
      analytics/page.tsx        # Revenue, order count, top sellers
      staff/page.tsx            # Staff list, invite, role change, remove
      settings/page.tsx         # Restaurant info + operational settings
      billing/page.tsx          # Subscription status, plan selector, payment history
  lib/
    api.ts                      # All API functions + TypeScript types
    auth-context.tsx            # Auth state, token storage, role guard
  components/
    Sidebar.tsx                 # Nav sidebar with restaurant name + links (includes Website nav item)
    [restaurantId]/
      website-v3/page.tsx       # Website V3 draft editor and live preview
```

## Authentication

- Login at `/login` with email + password
- JWT returned by `POST /api/v1/auth/login`
- Role must be `owner` or `manager` — any other role is rejected at login
- Token stored in `localStorage` under `foody_restaurant_token`
- All API calls send `Authorization: Bearer <token>` and `X-Restaurant-ID: <id>` header
- Multi-restaurant support: `restaurant_ids` array in JWT payload drives the restaurant picker

## API Reference (used by this app)

All calls go to `NEXT_PUBLIC_API_URL/api/v1/...` with `Authorization: Bearer <token>` and `X-Restaurant-ID: <id>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Login |
| `GET` | `/restaurants/:id` | Restaurant info |
| `PUT` | `/restaurants/:id` | Update restaurant info |
| `GET` | `/restaurants/:id/settings` | Restaurant operational settings |
| `PUT` | `/restaurants/:id/settings` | Update operational settings |
| `GET` | `/menu?restaurant_id=:id` | Full menu with categories + items |
| `POST` | `/restaurants/:id/categories` | Create category |
| `PUT` | `/restaurants/:id/categories/:cid` | Update category |
| `DELETE` | `/restaurants/:id/categories/:cid` | Delete category |
| `POST` | `/restaurants/:id/items` | Create item |
| `PUT` | `/restaurants/:id/items/:iid` | Update item |
| `DELETE` | `/restaurants/:id/items/:iid` | Delete item |
| `GET` | `/orders?restaurant_id=:id` | List orders |
| `PUT` | `/orders/:id/status` | Update order status |
| `GET` | `/analytics/today?restaurant_id=:id` | Today's stats (`{ summary, top_items }`) |
| `GET` | `/analytics/top-sellers?restaurant_id=:id` | Top selling items |
| `GET` | `/restaurants/:id/staff` | List staff |
| `POST` | `/restaurants/:id/staff/invite` | Invite staff member |
| `PUT` | `/restaurants/:id/staff/:uid/role` | Change staff role |
| `DELETE` | `/restaurants/:id/staff/:uid` | Remove staff |
| `GET` | `/restaurants/:id/subscription` | Subscription detail + event history |
| `POST` | `/restaurants/:id/subscription/setup-billing` | Generate PayPlus payment page URL |
| `POST` | `/restaurants/:id/subscription/change-plan` | Self-service plan change |
| `GET` | `/restaurants/:id/website-config` | Get website customization config |
| `PUT` | `/restaurants/:id/website-config` | Update website customization config |

## Validation & Pre-push

WhatsApp settings exposes **Satisfaction after an order** with a manual,
Sunday/time or 1–168-hour post-fulfillment policy. The restaurant owns its text
and submits the native template to Meta. Selecting a policy does not enable
Meta notifications. Automatic sends apply only to orders fulfilled after saving
the schedule and use the restaurant timezone; manual and automatic sends share
one order claim. The completed order's Actions menu offers a reviewed manual
send. Disable the satisfaction policy to stop it and detach its template.

The template library offers confirmed deletion of one unused language variant.
Used templates must first be detached from their notifications and saved.
Status and receipt are optional; confirmation and courier reminder remain
required for global Meta activation. Custom text uses the supported notification
triggers rather than creating arbitrary order events. Deploy API migration 244
and the matching endpoints before releasing this Admin.

```bash
cd foodyadmin
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript type check
npm run build         # Full production build (catches all errors)
```

Run `npm run build` before marking a PR ready to merge. Iterative feature-branch pushes may use targeted checks.

## Deployment (Vercel)

Vercel's Git integration deploys `develop` to the development environment. Production is a manual promotion of a verified `develop` deployment; no second PR to `main` and no GitHub Actions rebuild are required.

`vercel.json` disables automatic Git deployments for `main`, so an approved
history synchronization does not publish another production build. Other
branches retain their preview/development deployments.

| Setting | Value |
|---------|-------|
| Root Directory | `foodyadmin` |
| Framework | Next.js |
| Build Command | `npm run build` |
| Install Command | `npm install` |

**Environment variable to set in Vercel:**

```
NEXT_PUBLIC_API_URL=https://api.foody-pos.co.il
```

**Custom domain:** `admin.foody-pos.co.il`

DNS: `CNAME admin.foody-pos.co.il → cname.vercel-dns.com`

## Security Notes

- JWT is stored in `localStorage` — acceptable for an internal/owner-facing tool on trusted devices
- Role check (`owner` or `manager`) is enforced both at login (frontend) and on every API endpoint in `foodyserver`
- Restaurant scoping (`X-Restaurant-ID` header + JWT claims) is enforced server-side — users cannot access other restaurants' data even if they manually change the URL
- Never store secrets in this app — it only needs `NEXT_PUBLIC_API_URL`
- Always use HTTPS in production (enforced by Vercel)

### Companion data workspace

Open Cuisine → Companion → **Companion data** (`/[restaurantId]/kitchen/data`).
Access requires owner status or `kitchen.data_manage`. The four workflows are
historical imports, isolated simulation, current opening inventory and reset.
Each operation has a separate review and explicit confirmation. Recovery backups
remain downloadable; restoration is refused if subsequent activity changed the
kitchen. All writes use the restaurant from the active route.

The workspace accepts daily Aviv PDFs and dated CSV/XLSX files, reuses library
matches, skips existing days by default, and never deducts imported historical
sales from current stock. Historical imports do not reconstruct actual food cost.
Simulations stay separate from real forecasts and inventory. Resetting is a user
operation and is never part of installation or deployment.

## Victa Portable hardware

A Victa Portable is a single physical `payment_terminal` with a `printer`
capability. Hardware type filters include matching capabilities, so the same
record is visible under payment terminals and printers. Native printers display
an integrated connection instead of network connection settings. Receipt profile
configuration remains attached to the owning POS device. The matching API and
FoodyPOS versions provide enrollment, native discovery, and local dispatch.


Order-page headers inherit `nav_layout.header` until their first presentation
edit. The header inspector then writes `appearance_overrides.order_header` (version 1),
containing only layout, scroll, color style, background, restaurant information
presentation and `logo_size`. Logo content, navigation and fulfillment remain
shared. Presentation edits on the order page never update the site's header.
Returning to the site header stores `null`; undo restores the override.
The first override materializes a legacy shared header in the same draft update.
Deploy API support before releasing the editor. Global color editing now reports
the actual uses on the previewed page, including header/navigation and restaurant
information, without applying a style just by selecting its editor tile.

The order inspector's **Fiche article** controls the item-detail layout, bounded
width and corner presets, image ratio and fit. **Retrouver l’ancienne fiche**
sets a compact, rounded cover presentation without changing colors or ordering
rules. Its color style follows the menu by default. **Modifier les styles de
couleurs** opens the shared style's item-detail roles, grouped into content,
options and action bar (`custom_palette.color_styles.styles[].item_detail`).
Resetting a role restores its automatic color; changing it affects every sheet
using that style. Opening these global controls keeps the item preview visible.

Website typography is available under **Design du site → Polices**, including the
existing font library and `.woff2`, `.woff`, `.ttf`, and `.otf` imports. Imported
families retain their variants. In **Liste des articles**, **Menu des catégories**
and **Style des titres de catégories** expose the inherited font, weight and size
(50–400%), navigation title spacing (0–80px), and category spacing (0–160px).
Font/size controls appear when **Style du site** is selected; explicit title and
paragraph presets keep their preset typography. Sparse historical menus inherit
`typography.roles` instead of replacing them with new text presets. Page changes
merge with the site's roles and font sources, without changing global defaults.

**Liste des articles** exposes **Fixer le menu des catégories en haut (sticky)**
above the collapsed category settings. It defaults to enabled when unset, preserves
explicit disabled values, and updates the same `website_order.sticky_categories`
value for autosave, preview and publication. Browser regression:
`npx playwright test -c playwright.website-editor.config.ts category-menu.spec.ts`.

Website V3 accepts every valid hex color without contrast restrictions or warnings.
Authored title, paragraph and outline colors are preserved during normalization,
saving and rendering. Menu and item-detail inheritance passes those colors through
without correcting them against a new background. Defaults are generated only
for unset values; changing the header layout does not change its color style.


## Animated website text

The **Scrolling text** panel opens directly on a stable text input; the canvas wraps the complete phrase while editing. **Animated text** adds a fixed prefix and up to 20 rotating phrases (one per line), separate text/phrase colors, typography, speed, spacing and alignment. Preview plays the animation; editing keeps the first phrase still.

The storefront advertises `animated_text: true` in its V3 capabilities. Deploy the API, then Foody Web, then the admin; the editor rejects an older renderer before creating or publishing an unsupported section.

## Per-component website animations

Every section inspector exposes **Animations**, including featured items and
text element editing. Effects are optional and stored in `settings.motion`.
The Lovely preset chooses fade for banners, zoom for featured items/gallery/
animated text, and opposing reveals + image wobble + desktop scroll movement
for text/image blocks. Users can independently choose entry style, duration,
delay, replay, image/button hover, scroll direction/amplitude and mobile behavior.
Animated text offers letter rotation, fade, slide or no rotation and an optional
fixed width. Testimonials can rotate automatically with configurable timings.
All controls use the same draft/preview/publication state; no site is automatically
restyled. Deploy API then the web renderer advertising `component_animations: 1`
before this editor.

For an isolated browser check, run `FOODY_COMPONENT_MOTION=1 node
tests/redesign/website-editor-server.mjs` with the local web/admin environment
variables described above. The fixture includes entry effects, image wobble,
parallax, variable-width text and two rotating reviews; all writes stay in memory.

## Unified order intake

`/[restaurantId]/settings/orders` is the single **Orders & availability** editor
under Ordering & delivery. It starts with Immediate orders, Preorders only,
or Both, followed by slot/weekly-lot organization, services and the relevant
calendar. The old `/orders/availability`, `/orders/preorders`, `/settings/opening-hours`
and `/settings/scheduled-orders` routes redirect here; the separate Hours entry
has been removed. Strict weekly lots
hide classic pickup/delivery hours; slots retain receiving hours. Hidden values
are kept, and policy/services/calendar edits share one save. Table service remains
independent in its own section on the same page. The live lot status uses the server calendar
and the restaurant timezone; pause controls remain available on the same page.

Week start/workdays and catering-only mode are retained under Restaurant → General.
They use the existing restaurant endpoint and only changed fields are saved.
Strict weekly lots are governed by order opening, cutoff and fulfillment days/windows;
classic pickup/delivery opening hours are retained without constraining this mode.

Requires the API's `preorders_only` contract (migration 226). Existing scheduled
restaurants are shown as Both until the operator explicitly selects Preorders
only. Browser regressions: `npx playwright test -c playwright.redesign.config.ts
tests/redesign/order-preorders.spec.ts tests/redesign/order-availability.spec.ts`.


## Floor-plan editor

The floor-plan editor follows the Square layout: a fine square grid, floating
shape/width/height tools, four resize handles, a rotation handle, section table
palettes and Undo/Redo. Width and height use grid units (new tables start at
8 × 8); storage stays in canonical canvas percentages. Pointer gestures work
with mouse, pen and touch. Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z travel history; focus
the rotation handle and use Left/Right for 15-degree turns.

Layouts are saved explicitly. Removing a marker leaves the restaurant table
available in the palette. Table/section creation keeps unsaved placement edits.
Legacy placements keep their former visible dimensions; `geometry_version: 2`
round-trips authored size and angle. Deploy API migration 227 and the matching
FoodyPOS before releasing this editor. It refuses writes to an API without
`layout_geometry_version: 2`, preventing silent resizing by an older server.

Run isolated browser checks with `npx playwright test -c playwright.floor-plan.config.ts`.
All API calls in this suite use synthetic in-memory fixtures.

## Full service and kitchen stations

Settings now separates the restaurant policy from device checkout profiles:

- Service settings → **Services** (`/settings/services`): ordered course names,
  immediate-send library categories and fired/held paper-ticket policy.
- Service settings → **Menu behavior** (`/settings/menu-behavior`): return home
  or remain in the current menu group after adding an item.
- Fulfillment methods → **POS** (`/settings/fulfillment`): enabled existing order
  types, default and staff prompt at order start or Pay/Send.
- Device management → **Modes** (`/settings/modes`): reusable full-service
  profiles assigned to registered devices. Checkout sections control entry tile
  size/progression, covers/seats, coursing and cart sorting; Open checks controls
  Send & Stay. Unsaved changes persist across sections of the same profile.
- Device management → **Kitchen displays** (`/settings/kitchen-displays`):
  registered tablets, phones, computers or displays with
Prep/Expo role, completion scope, columns, text size, timers, held courses and
routing by source, dining option and library category.

Editors require explicit Save and protect unsaved changes on close/link navigation
and reload. The legacy `/settings/full-service` route redirects to restaurant
checkout defaults. A device can belong to only one checkout mode; forgotten and
foreign devices cannot be assigned. Item opening/variant defaults remain in the
item editor rather than a global force-open switch.

Deploy the matching API with migrations 228–230 and 232 before using these settings.
Admin and POS consume the same persisted policy; kitchen progress remains separate
from payments, table occupancy and inventory. Comp/void reasons are configuration
only until the corresponding operational actions are implemented. Additive
mode/fulfillment/menu/printing policies reuse `full_service` JSONB and need no new
migration. POS reloads settings explicitly; changing Admin does not push a live
mode update. Fired/held printing currently adds held context to fired tickets;
standalone held-only printing remains unsupported. Custom dining labels are now
implemented in the newer follow-up below.

Isolated checks: `npx playwright test -c playwright.redesign.config.ts pos-settings.spec.ts item-checkout.spec.ts`.

## Delivery address autocomplete

The Website V3 delivery checkout editor discovers server-side Geoapify availability
via `/api/v1/public/address-autocomplete/config?restaurant_id=...`. Configure
`GEOAPIFY_API_KEY` on the API, then enable **Address autocomplete** and publish the
website draft. The key is never sent to the admin or its preview iframe. Enabling
the toggle makes the delivery address field enabled, required and unconditional.
The API refuses a published autocomplete form that hides its address field.

The public fulfillment dialog, checkout and customer correction form use the same
provider. Staff customer/order/courier address editors retain their existing
manual correction tools. Provider setup and deployment remain explicit operations;
no account, subscription or deployment is created by this change.

## Geoapify delivery maps and road itineraries

Deploy the API with migration 238 before this client. Delivery, courier and zone
maps load restaurant-scoped map configuration and use the API's credential-free
Geoapify tile proxy. Light mode uses Positron; dark mode uses Dark Matter. The
provider key stays on the API. No new Admin environment variable is needed.
Road geometry is rendered per stop so completed deliveries disappear from the
operational map. Approximate historic/unconfigured routes are labelled and keep
dashed straight-line paths until recalculated. Quota, infeasible plans and provider
outages have localized feedback; a failed map background leaves stops/actions usable.
Waze/Google Maps navigation links remain available.

Checks: `npx tsx --test src/lib/__tests__/delivery-planning.test.ts` and
`npx playwright test -c playwright.redesign.config.ts delivery-planner.spec.ts delivery-zones.spec.ts`.
The browser fixtures use synthetic road geometry and tiles; no provider credentials
or customer data are used.

### Website image framing

Website V3 image controls include non-destructive pan, 50–300% zoom, and fill/entire-image modes. Desktop and mobile frames are stored independently; the mobile control can explicitly inherit desktop framing. Header backgrounds/logos, section images/backgrounds/galleries, catering/chain imagery and per-item website photos use the same control. Framing affects website presentation without replacing catalogue assets.

Order mode settings accept an independent `website_order.modal_cover_url` and `modal_cover_framing`, shared by fulfillment and scheduling windows. An empty URL inherits the restaurant cover; the cover toggle hides it. Optional frame objects live beside their media in the existing draft JSON, including `background.framing`/`logo.framing` in headers and `image_framing` in section content. Item overrides use `item_image_frames` keyed by item ID.

The isolated image suite runs with `FOODY_WEB_DIR=/path/to/foodyweb npx playwright test -c playwright.image-framing.config.ts`; its API writes are in memory only.

### Preparation timing and suggested service hours

Orders and availability exposes continuous elapsed preparation, saved service
hours, or a custom daily production start. For service/custom hours, owners can
require one uninterrupted service or allow work to accumulate across services.
This requires API migration `242_preparation_clock.sql`; the save is rejected if
the API does not confirm the changed fields. Unrelated saves preserve the policy.

Suggested 09:00–22:00 values are not treated as saved delivery hours. Owners can
explicitly apply the suggestions or copy saved pickup hours for missing delivery
days, then save. Neither action replaces already configured delivery days.

The preparation example is a read-only live preview from the API's actual slot
resolver. It sends the displayed delay, clock, split policy, booking horizon,
slot duration, custom windows and service hours. Saved and unsaved values are
identified separately; stale responses are discarded, errors remain visible,
and an unavailable service never borrows another service's hours. Deploy the
API's `preparation-preview` endpoint before Admin.

## Delivery calendars by zone

Settings → Ordering & delivery → Delivery zones supports multiple cities and,
for restaurants with country France, multiple department codes. Each zone can
inherit the restaurant calendar, offer customer-selected weekly windows, assign
the next window automatically, or reserve the next delivery day for staff to
confirm its time after ordering. Days and windows are saved with the zone.
An optional pickup suggestion respects the restaurant's enabled pickup service.

The order detail displays pending delivery confirmation and an explicit window
editor. It validates allowed route times server-side, retains the delivery address
and fee, and asks for a reason when changing the promised day. The confirmed
window is visible in customer tracking; no message is sent by this editor.
Deploy server migration 249 and matching Web before enabling these settings.
Browser regression: `FOODY_PREVIEW_PRODUCTION=1 npx playwright test -c
playwright.redesign.config.ts delivery-zones.spec.ts --grep 'delivery route calendar admin'`.
Fixtures are synthetic and never call a live geocoder or payment provider.

The broader delivery-zone browser suite currently has one unrelated navigation
assertion at `tests/redesign/delivery-zones.spec.ts:46`: it expects a Settings link
after opening the dashboard with order-only permissions. The unchanged sidebar
uses grouped navigation. All three new calendar scenarios and the other 26
delivery-zone scenarios pass.

## Notes for selected modifiers and options

Each row in a modifier set and each reusable option can enable a customer note,
with a label, placeholder and optional requirement. Modifier sets save these
settings with the main Save action; reusable options save them on blur/toggle,
like their other row settings. New legacy modifiers expose the same controls.
The guest field appears only for that selected choice, independently of the
article's general notes switch. Deploy API migration 245 and the matching Web
renderer before enabling these settings.


## Restaurant calendar

`/[restaurantId]/calendar` is the restaurant's private agenda, available with
`settings.view` or `settings.edit`. Editing requires `settings.edit`. Week, day,
month and agenda views show manual catering events, other events and full-day
closures. Desktop opens on the week; mobile opens on the agenda. The Square-style
toolbar keeps date navigation together, with full-width tables and a centered
event editor. Clicking a week cell or day hour prefills the date, event type and
optional time; overlapping timed events occupy separate lanes.
Confirmed events from the catering module appear as read-only references when
the user also has catering permission; creating an agenda entry does not create
a commercial catering booking or quote.

Dates and optional event times use the restaurant timezone. Closure end dates
are inclusive and apply only to the selected pickup, delivery or dine-in services.
The API blocks new fulfillment on those dates, including scheduling, weekly
batches and immediate-stock orders. Orders for dates after reopening remain
possible. Existing orders and catering events are retained; the closure editor
shows their counts. Private event titles, locations and notes are never exposed
to guests. Only closure dates and affected services reach the public API.

Deploy the API with migration `246_restaurant_calendar.sql`, then Web and Admin.
Checks: `npx tsx --test src/lib/__tests__/restaurant-calendar.test.ts` and
`npx playwright test -c playwright.redesign.config.ts tests/redesign/restaurant-calendar.spec.ts`.

## Courier actions, stop duration and destination preflight

The courier workspace opens on a map with numbered destinations and an adjustable
mobile timeline; desktop shows the timeline beside the map. A route selector
includes current and future assignments. Only the viewed route mounts its map,
while GPS reporting continues for the first active route across selections.
Search filters addresses, contacts, order numbers and notes without changing the
saved sequence; selecting a pin clears the filter and reveals its stop. The
panel handle supports dragging, arrow keys and Home/End.

Tap-to-call is available before departure. The fixed dock offers Adjust/Start for
a draft, then navigation and delivery confirmation for the next unfinished stop,
identified above the actions. Another stop can be completed from its selected
row. Completion requires an active route but no separate Arrived action. A current
run must finish before another can start. Account, restaurant, language and theme
controls are in the floating menu. FR/HE/EN, RTL, safe areas and dark mode share the
existing Foody tokens. Incomplete routes hide stale timing and distance totals.

Planning and pre-departure route settings accept `stop_service_minutes` (integer
0–60, default 3). It is stored per route and included in optimizer handovers,
subsequent arrivals and the final duration. Existing clients may omit the field.
Deploy the matching API and migration 247 before this client.

The courier preflights each changed set of destinations through an owner-scoped
API call. Missing, imprecise or mismatched coordinates are warned before departure.
Provider outages are visible and retryable without disabling call/completion.
Waze receives a checked GPS point, avoiding language-dependent text matching.
Unverified text searches require an explicit warning; the correction editor accepts
local/Hebrew addresses or a manually checked point. This checks Foody's destination,
not Waze's private address index, and never silently changes a saved destination.

Isolated synthetic checks: `npx playwright test -c playwright.courier.config.ts` and
`npx tsx --test src/lib/__tests__/delivery-links.test.ts src/lib/__tests__/delivery-planning.test.ts`.

## Delivery maps and usage

Settings → Ordering & delivery → Maps and routes exposes this restaurant's Google usage,
platform availability and a protected provider choice. Google resumes after the
monthly quota reset unless Geoapify was pinned manually. The planner's legend
selects individual routes, including several routes for the same courier. Routes
are numbered from 1 within the displayed list; the ribbon and map legend share
that number, courier name and route color. Internal route IDs no longer appear in
map labels; route actions continue to use the persisted IDs.
The delivery planner and delivery-zone page expose Maps and routes as an outlined
header action, and the settings sidebar offers it directly beside Delivery zones.
Pricing contact actions open contact-Foody information without initiating payment.

The workspace separates Usage, Services and choice, and Foody pricing. Usage has
Google and Geoapify tabs. Geoapify displays restaurant-scoped credit estimates,
the declared shared Free-plan allowance (3,000 credits/day, 5 requests/second),
the tracking start and UTC counter periods. Earlier history and account use outside
the current API environment are not included; unavailable tracking never appears
as zero usage. The comparison describes the implemented features and explicitly
distinguishes estimated traffic from live traffic.

The API supplies the planned Maps Plus offer: 149 ILS excluding VAT per
establishment/month, 500 weighted Foody optimization credits and defined Google
volumes. Its contact dialog takes no payment, creates no entitlement and leaves
all current provider caps intact. Public pricing mirrors the canonical API JSON.

Deploy API migrations 249 (application DB) and 250 (dedicated Google budget DB)
before enabling the production rollout. Credentials stay on the API. The API's
`docs/GOOGLE_DELIVERY.md` describes activation, billing units and quota protection.
Browser checks: `npx playwright test -c playwright.redesign.config.ts tests/redesign/delivery-planner.spec.ts tests/redesign/delivery-maps-settings.spec.ts`.

## Temporary IP test access

Restaurant Settings → Temporary test access allows up to 32 public IPv4/IPv6
addresses with a required expiry within seven days. Activation pauses public
ordering indefinitely; expiration/revocation does not reopen it. The guest Web
rechecks authorization on checkout and the API enforces it on every order.
Payment and fulfillment rules still apply, with real production side effects.

**Allow my current IP** detects the browser's address directly on the guest Web
host and immediately saves it for the selected restaurant. Existing IPs and a
future chosen deadline are preserved; a missing/expired deadline defaults to one
hour. Detection failures leave saved settings unchanged. Staff credentials are
never sent to the guest host. This requires the Web `/api/ordering-test-ip` route.

Deploy API migration 251 before Web and Admin. API and guest Web require the same
server-only `ORDERING_TEST_PROXY_SECRET` (32+ random characters) per environment.
Never use a `NEXT_PUBLIC_` variable for this secret. The signed visitor IP comes
only from Vercel’s platform-owned header; arbitrary local forwarded headers do
not enable access. See the API README for the security and deployment contract.

Focused browser checks: `npx playwright test -c playwright.test-access.config.ts`
(Web uses an isolated synthetic API; Admin requires `npm run build` first).

Vercel staged production artifacts carry both server-only Web keys:
`ORDERING_TEST_PROXY_SECRET` for the production API and
`ORDERING_TEST_PROXY_SECRET_DEV` for `dev-api.foody-pos.co.il`. Each API uses its
own environment’s key as `ORDERING_TEST_PROXY_SECRET`. Preview deployments need
only the development key; never copy the production key into Preview.

## Staff POS discounts

Menu → POS discounts (`/[restaurantId]/menu/pos-discounts`) manages fixed/variable
amounts and percentages shared with the POS Library. These staff reductions are
independent of Marketing coupon codes and require `menu.edit` to change.
Deploy API migration `253_pos_check_discounts.sql` before this page. Archiving
a definition preserves frozen selections on existing unpaid checks.

POS fulfillment methods also determine the choices in **Item details → Options**.
The existing settings page now describes this scope and order details show a
recorded per-item override. Manage by location now edits up to ten stable named
methods mapped to dine-in/pickup/delivery, including a distinct Retrait preset.
Drag or accessible up/down controls set the shared choice order; the first active
method is the new-sale default. The edit drawer and explicit Save preserve staged
changes/cancellation. Existing checks retain frozen names after rename/archive. Deploy the matching API
with migrations `254_item_dining_option.sql` and `255_custom_pos_dining_methods.sql`,
`item_dining: true`/`custom_dining: true` capabilities and the settings response
`pos_custom_dining_supported: true` before the POS/Admin client. Catalogue-aware
KDS/printer filters, progress tracking and reports remain separate work. An override changes preparation context only; it
does not create another delivery, charge, or order lifecycle.
## WhatsApp messages in the order workflow

In Settings → Restaurant → Order workflow, each stage can select its own approved
Meta template and message type (status, confirmation, receipt, delivery reminder,
or satisfaction on completion). The event checkboxes advance into that stage;
its notification then sends once per order/stage. Selection and preview are inline;
the template library remains in Settings → Communications → WhatsApp.

Delivery reminders can send at stage entry or at a chosen restaurant-local time
the day before the saved delivery date. Explicit stage timing is honored regardless
of the delivery date; the dedicated manual reminder's J-1 rule does not override
the workflow. Staff choose wording appropriate to their selected trigger. Saved
courier name/phone and the delivery window are still required template variables.
Rescheduling the delivery moves a pending reminder. Disabling, deleting or changing
the stage rule cancels pending work; it never sends retroactively for old orders.
A stage-specific confirmation replaces the automatic global confirmation trigger.
Satisfaction retains its shared once-per-order protection across manual and automatic sends.

Workflow changes save explicitly and participate in lost-response recovery. Older
workflows retain the global status template / legacy Twilio text until an explicit
per-stage model is selected. Native template bodies and variable contracts remain
validated by the API; no provider credentials reach the browser. Deploy API migration
255 and its scheduler before this Admin version. POS reads this additive stage
contract and continues to use the same canonical lifecycle statuses.

Order details → Customer messages shows stage notifications blocked before sending
separately from provider delivery/read evidence, with required-data guidance and
a scoped link to the workflow. The latest blocked snapshot refreshes without
resending; older APIs can omit this additive snapshot during a rolling release.

## Digital receipt editor

Open **Website V3 → Parcours de commande → Écran → Reçu** to edit the receipt
title and thank-you message in French, English or Hebrew, spacing, visible
restaurant/customer information and print/share/navigation actions. The preview
uses a synthetic order and follows the selected text language. Fonts and button
shape inherit Site design; the colour picker inherits the menu by default or
selects another shared style for the receipt. Content is shared across order
pages, with screen colour assignments stored per page. Guest receipt links retain
the originating published order page; generic links use the restaurant's default
order page.

Edits use the existing autosaved draft and become public only after publication.
Deploy the receipt API contract and Foody Web advertising `receipt_editor: 1`
before this editor. Run the isolated regression with
`npx playwright test -c playwright.website-editor.config.ts receipt-editor.spec.ts`.

## Documentation support

The navigation Help entry opens the support drawer and public guides on
`foody-pos.co.il`. Documentation chat calls the current API’s
`/api/v1/public/support/chat` without JWTs, cookies, referrers or restaurant records.
The API owns the immutable public corpus, AI credential and Redis quota.
`NEXT_PUBLIC_HELP_BASE_URL` configures article links only; it is not the AI backend.
Deploy the API before this client. Canonical dev/prod host selection supports
promotion of the same artifact; arbitrary preview domains retain existing CORS limits.

Run the normal service validation plus the documentation contract below. Follow
`../foodylanding/docs/help/MAINTENANCE.md` for feature/procedure changes.

## Documentation release contract

`docs/help/contract.json` records the reviewed source hashes and feature mappings.
`node scripts/check-help-contract.mjs --documentation-root ../foodylanding --base origin/develop`
checks local preparation. Remote CI uses a pinned immutable Landing commit and
checks all French, Hebrew and English procedures. New source and behavior changes
require an updated inventory/guide release or an exact reviewed no-user-impact
explanation. See Landing’s `docs/help/MAINTENANCE.md` for the complete workflow.

## Photo and PDF attachments in native Meta automations

Create a model in Settings → Communications → WhatsApp and select Photo or PDF
document under Message attachment. Upload a private JPEG/PNG (5 MiB max) or PDF
(10 MiB max), or select Receipt for this order for a dynamic Foody PDF. After Meta
approval, choose the model and its attachment in the message drawer or directly
on an order-workflow stage, then save that page. A text-only model needs a new
media-header version; each message supports one attachment. These controls apply
to direct Meta routing, not Twilio.

Requires API migration 263 first. Files are accessed through authenticated scoped
API requests and temporary blob previews, without public storage URLs. The PDF
is an informational order summary from saved items/totals, not a fiscal invoice.
Order history retains attachment filenames with attempts and provider statuses.
Regression: `npx playwright test -c playwright.whatsapp.config.ts` and
`npx playwright test -c playwright.workflow-whatsapp.config.ts`.
### Delivery endpoint and customer-window planning

Deploy the matching API and migration 262 first. Allocation now accepts each
courier's departure/final addresses, with server-backed address suggestions, and
a customer window beside handover duration. New plans propose 90 minutes;
`1:30`, `1h30` and `90` all mean 90 minutes. Route settings share these controls
for admins and the assigned courier before departure. Endpoint changes reset a
manual sequence and optimize towards the saved final destination.

WhatsApp route links and delivery reminders use arrival plus the configured
range. Original scheduled windows remain operational constraints. Historic
unconfigured routes retain their previous reminder slot. An unavailable current
range blocks the manual reminder until recalculation and review. Start route
confirms departure for every unfinished assigned delivery together, including
accepted and preparing orders; held kitchen/weight-settlement gates remain.

## Internal combo exceptions

In New order or Edit order → combo composition, each step exposes **Choose
another item** to users with `orders.manage`. Remove a unit first if the step is
full, then search the restaurant library and select a replacement and its size.
**Exception · included** marks a zero-upcharge choice on this order only. Step
quantities, per-item/size limits, pinned portions and availability still apply.
Inactive, sold-out, weight-priced items and other combos are excluded. Other
normal selections retain their configured supplements. The saved combo is not
modified; saved-order editing preserves its original base price even if the
catalog price changes. Drafts and subsequent composition edits retain the marker.
Requires the matching API and migration 264 before this UI. Guest and POS pickers
retain their standard choices. Copy and public help cover French, Hebrew and
English. Synthetic browser checks:
`npx playwright test -c playwright.redesign.config.ts internal-combo-substitutions.spec.ts internal-order-library.spec.ts`.

Staff invitation activation now requests a POS PIN only for the current restaurant’s
orders.manage or payments.manage permissions, including custom roles. Courier and
kitchen-only activation uses password and profile only. Existing unused email links
remain valid; failures preserve credentials and the invite for retry. Used, expired
or ambiguous legacy links have explicit recovery via the existing staff resend
action. No migration/environment change; deploy API before Admin.

## Explicit delivery time constraints

Deploy the API with migration `273_delivery_order_window_constraints.sql` before
this client. New plans leave **Respect order time windows** disabled: optimize
stop order first, then derive customer arrival ranges from the route. Enable it
only when the saved order times have actually been agreed with customers. The
choice is visible in the route summary, saved as `respect_order_windows`, and
editable before departure. Changing it recalculates the sequence, including an
old manual sequence. Existing routes retain their order until **Recalculate**;
order dates and stored scheduling fields remain intact. Review reminder previews
again after recalculation; sending remains an explicit, separate operation.

Regression: `npx playwright test -c playwright.redesign.config.ts delivery-planner.spec.ts`.

The matching API also returns an optional, bounded `routing_error`. Dispatch and
courier views distinguish a provider quota or outage from an invalid address.
Known Google positions remain visible on a Google basemap when only the road
calculation fails; unresolved positions show a temporary service warning. Partial
paths and arrival estimates stay hidden, and an incomplete reassignment is rejected
before changing orders. Check Settings → Usage and quotas, then refresh and
recalculate when the service is available. No allowance or production data change
is part of this UI fix. The same planner browser suite covers this recovery state.

## Undo an accidental route departure

Orders → Deliveries offers **Undo departure** on an active route whose stops are
all pending. Confirmation explains that out-for-delivery orders return to
preparation, the route returns to draft and the courier remains assigned. Managers
can then unassign and allocate to the correct courier. Existing sent messages
remain recorded. The API rechecks all progress and ownership transactionally;
conflicts reload the route and show localized recovery. The action is absent once
any arrival, delivery or skipped stop is visible, and is never offered in courier
mode. Deploy the matching API first; no environment change is required.
