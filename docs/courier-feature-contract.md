# Courier / delivery feature — cross-repo contract

Assigning a delivery **courier** to an order, and surfacing courier + ETA info
to the customer on the confirmation page. Spans all three repos. This documents
the contract between them as implemented.

## Who is a courier?
A courier is a **staff member** (a `User` with a `UserRestaurantRole` for the
restaurant). A default RBAC role template **"Courier"** is seeded
(`server/internal/rbac/permissions.go`) with `orders.view`. Existing Courier roles
may still carry historical grants; delivery route planning rejects courier accounts
even when `orders.manage` remains assigned.
Owners create couriers through the existing Roles & Permissions / Staff UI.

The admin app treats a staff member as a courier when their role is the legacy
`courier` enum **or** their RBAC `role_name` is `"Courier"` (`isCourier()` in
`admin/src/lib/api.ts`). The server does **not** require a specific role to
assign — any staff member of the restaurant is accepted.

## Order fields (server → admin & web)
Added to the `orders` table (migration `091_order_courier.sql`) and the `Order`
model:

| Column                | JSON                  | Notes                              |
|-----------------------|-----------------------|------------------------------------|
| `courier_id`          | `courier_id`          | FK → staff `User`, nullable        |
| `courier_name`        | `courier_name`        | denormalised at assignment time    |
| `courier_phone`       | `courier_phone`       | denormalised at assignment time    |
| `courier_assigned_at` | `courier_assigned_at` | set when assigned                  |

## Endpoints (staff, authed, restaurant-scoped)
- `POST /api/v1/orders/{id}/assign-courier` — body `{ "courier_id": <id|null> }`
  (`null`/`0` unassigns). Returns `{ "order": Order }`.
- `POST /api/v1/orders/bulk-assign-courier` — body
  `{ "order_ids": [..], "courier_id": <id|null> }`. Returns `{ "orders": [Order] }`.

Rules: delivery orders only; not allowed once `delivered`; courier must be staff
of the restaurant. Broadcasts `order.updated` over WebSocket.

## Confirmation delivery config (admin → server → web)
Stored under `WebsiteConfig.checkout_config` → `confirmation.delivery`
(`restaurants.ConfirmationDelivery`), edited in the admin **ConfirmationEditor**
"Livraison" section:

```jsonc
{ "confirmation": { "delivery": {
  "show_courier": false,   // reveal courier name + phone to the customer
  "show_eta": false,       // pass through eta_start/eta_end from external_metadata
  "note": ""               // free-text note shown on the confirmation page
}}}
```

## Public order GET (server → web)
`GET /api/v1/public/orders/{id}?restaurant_id=` applies
`ApplyPublicDeliveryDisclosure`:
- Courier name/phone are **stripped** unless `show_courier` is true (privacy:
  opt-in).
- When anything is disclosed, a convenience block is attached:
  `external_metadata.delivery = { courier_name?, courier_phone?, note?,
  eta_start?, eta_end? }`.

The web `fetchOrder` maps this to `OrderResponse.delivery`; the
`ConfirmationDeliveryCard` renders courier name, a tap-to-call phone, an ETA
window, and the note — each gated on presence, so the card stays hidden until
the owner opts in and a courier is assigned.

## Notes / future work
- The delivery note is a single string (not yet per-locale).
- ETA is **passed through** from `external_metadata` (e.g. a dispatch
  integration); the server does not compute it.
- The courier-only screen uses `GET /api/v1/delivery/routes/mine/all` for every
  unfinished assigned route. It does not request or expose the Available pool.
- `POST /api/v1/delivery/routes/{id}/my-navigation-check` checks the caller owns
  the route and returns `{ checks: [{ stop_id, verified, reason }] }`. It compares
  precise country-scoped geocoding with the saved point (100 m tolerance), without
  replacing coordinates. Manual corrections are trusted only while a private
  address/point fingerprint still matches. The public customer contract is unchanged.
- `stop_service_minutes` is additive on routes, plan requests and settings updates.
  It is an integer from 0 to 60, default 3. Arrival precedes the stop's own handover;
  later arrivals and total duration include each configured handover.

## Owner and superadmin courier mode

`/[restaurantId]/orders/courier-mode` lets the active restaurant’s owner and platform superadmins select a
current Courier staff member of that restaurant. The shared courier screen and
its requests pass optional `courier_id` to `mine/all`, `my-navigation-check`,
`start`, `arrived` and `delivered`. The API validates actual ownership through the scoped restaurant’s owner_id (or the explicit superadmin claim), active staff membership,
Courier role (legacy or RBAC), and route ownership in the explicit restaurant.
Normal courier requests omit the selector and retain their existing scope.

Switching remounts the shared view to clear old route, stop, search and dialog
state; responses from the old selection cannot populate the new view. The
original account/token stays intact. Actions are real delivery operations, while
location reporting is disabled for a selected courier so the selecting account’s device
never replaces that courier's GPS. The workspace is execution-only for every
viewer: it exposes no route settings, address correction, stop reordering or
reoptimization. An authorized dispatcher must return to Deliveries to change
the plan. Legacy courier planning endpoints return 403
`courier_itinerary_read_only`; dispatcher route writes reject courier accounts
and explicit `courier_id` selection. Start, arrival and delivery remain available. Deploy the matching API before Admin; no migration is required.

Help impact: `delivery/courier-workspace#superadmin-courier-selection` and
`delivery/dispatch-and-routes#superadmin-courier-mode` are updated in FR/HE/EN.
Synthetic coverage lives in `tests/redesign/courier-workflow.spec.ts` and API
`internal/delivery/courier_context_test.go`.

Owner selection requires the matching API and Admin update; deploy the API first. A global owner role in another restaurant never grants this selection. Managers and couriers retain their existing own-route scope.
