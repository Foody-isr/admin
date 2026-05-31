# Courier / delivery feature — cross-repo contract

Assigning a delivery **courier** to an order, and surfacing courier + ETA info
to the customer on the confirmation page. Spans all three repos. This documents
the contract between them as implemented.

## Who is a courier?
A courier is a **staff member** (a `User` with a `UserRestaurantRole` for the
restaurant). A default RBAC role template **"Courier"** is seeded
(`server/internal/rbac/permissions.go`) with `orders.view` + `orders.manage`.
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
- A dedicated courier-only screen (couriers see just their assigned orders) is
  not included here.
