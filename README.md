# Foody Admin

Self-service web portal for restaurant owners and managers. Used to manage day-to-day restaurant operations from any browser: view orders, manage the menu, track analytics, invite staff, and handle billing. **Not for end customers** — access is restricted to users with the `owner` or `manager` role.

## Environments

| Environment | Domain | API | Branch |
|-------------|--------|-----|--------|
| **Production** | `admin.foody-pos.co.il` | `api.foody-pos.co.il` | `main` |
| **Development** | `dev-admin.foody-pos.co.il` | `dev-api.foody-pos.co.il` | `develop` |
| **Local** | `localhost:3003` | `localhost:8080` | any |

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

Today's snapshot at a glance:
- **Revenue today** and **Orders today** — KPI cards
- **Top Sellers** — top 5 selling items by revenue today
- **Recent Orders** — last 10 orders with status badge, type, and amount

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
    Sidebar.tsx                 # Nav sidebar with restaurant name + links
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

## Validation & Pre-push

```bash
cd foodyadmin
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript type check
npm run build         # Full production build (catches all errors)
```

Always run `npm run build` locally before pushing — CI runs the same command on Vercel.

## Deployment (Vercel)

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
