# Foody Admin

Self-service web portal for restaurant owners and managers. Used to manage day-to-day restaurant operations from any browser: view orders, manage the menu, track analytics, invite staff, and handle billing. **Not for end customers** — access is restricted to users with the `owner` or `manager` role.

## Environments

| Environment | Domain | API | Source |
|-------------|--------|-----|--------|
| **Production** | `admin.foody-pos.co.il` | `api.foody-pos.co.il` | Manually promoted Vercel deployment from `develop` |
| **Development** | `dev-admin.foody-pos.co.il` | `dev-api.foody-pos.co.il` | `develop` |
| **Local** | `localhost:3003` | `localhost:8080` | any branch |

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

Full order list with:
- Status filter tabs (all / pending / active / completed)
- Per-order: order ID, type (dine-in / pickup / delivery), customer name, amount, status badge
- Status update buttons on each order (accept, send to kitchen, mark ready, mark served/delivered)
- Real-time: page re-fetches automatically to stay current

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

### Staff (`/[restaurantId]/staff`)

- Table of all staff members: name, email, role badge
- **Invite** button — opens modal to create a new staff account (name, email, phone, password, role)
- **Change role** dropdown per staff member (owner-only action)
- **Remove** button with confirm dialog (owner-only)

### Settings (`/[restaurantId]/settings`)

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

Website V3 is the restaurant website editor used by the application navigation. It manages pages, sections, appearance and checkout settings with a live iframe preview. Draft autosaves remain separate from publication; the existing guest website and stored website data are unaffected by removal of the old admin editors.

The legacy `/[restaurantId]/website` and `/[restaurantId]/website-v2` implementations have been removed. Their URLs redirect to Website V3, preserving the restaurant and query parameters. Components shared with V3 and QR customization remain in use.

Draft endpoints: `GET`/`PUT /restaurants/:id/website-draft`, `POST /restaurants/:id/website-publish`, and `POST /restaurants/:id/website-discard`. Website configuration endpoints also remain available to their other consumers.

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
