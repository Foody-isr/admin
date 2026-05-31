# Courier assignment & delivery confirmation — API contract

> Status: **frontend implemented, backend pending.**
> The admin + web frontends are wired against the endpoints/fields below and
> **degrade gracefully** when the server doesn't yet provide them (assign calls
> are best-effort; missing courier/delivery fields simply render nothing).
> Implement the server side (`Foody-isr/server`, Go) to match this contract.

## Concept

- A **courier** is a staff member whose role is `courier`. Couriers are created
  on the existing **Staff** page using the existing dynamic roles system
  (Roles & Permissions). No new "create courier" flow — the restaurant makes a
  role named/keyed `courier` (or we seed one) and assigns staff to it.
  - The frontend identifies couriers as: `staff.role === 'courier'` OR
    `staff.role_name` (case-insensitive) === `'courier'`.
- A **delivery order** can have **one assigned courier**. Assignment is allowed
  at any status until the order is `delivered`.
- The guest **confirmation page** shows delivery details + the assigned
  courier's name/phone + ETA window + an owner-configured delivery note.

## 1. Order model additions

Add to the `Order` row and to every order payload the server returns
(`GET /orders`, `GET /orders/{id}`, websocket `order.*`, and the public
`GET /public/orders/{id}`):

| Field | Type | Notes |
|-------|------|-------|
| `courier_id` | `int \| null` | FK → users.id (staff member with courier role) |
| `courier_name` | `string` | denormalised for display; empty when unassigned |
| `courier_phone` | `string` | denormalised; shown to the guest on confirmation |

The **public** order response should additionally expose delivery info that is
already captured at checkout (today it lives in `external_metadata`), so the
confirmation page can render it without guessing:

| Field | Type | Notes |
|-------|------|-------|
| `delivery_address` | `string` | |
| `delivery_city` | `string` | |
| `delivery_floor` | `string` | optional |
| `delivery_apt` | `string` | optional |
| `delivery_notes` | `string` | guest's own note |
| `estimated_delivery_start` | `string` (HH:MM or ISO) | optional; ETA window start |
| `estimated_delivery_end` | `string` (HH:MM or ISO) | optional; ETA window end |

(If you prefer, keep these inside `external_metadata` with the snake_case keys
above — the web client reads both `order.<field>` and
`order.external_metadata.<field>`.)

## 2. Assign courier (single)

```
POST /api/v1/orders/{orderId}/assign-courier?restaurant_id={rid}
Auth: staff JWT
Body: { "courier_id": number | null }   // null clears the assignment
200 → { "order": Order }                 // updated order incl. courier_* fields
```

Validation:
- `courier_id` must reference a staff member of this restaurant with the
  courier role; 422 otherwise.
- Reject (409) if the order is already `delivered`/`rejected`.
- Order must be `order_type = 'delivery'` (422 otherwise).

## 3. Assign courier (bulk)

```
POST /api/v1/orders/assign-courier/bulk?restaurant_id={rid}
Auth: staff JWT
Body: { "order_ids": number[], "courier_id": number | null }
200 → { "orders": Order[], "failed": number[] }   // failed = ids that couldn't be assigned
```

Same per-order validation as the single endpoint; skip+report invalid ones in
`failed` rather than failing the whole batch.

## 4. Confirmation config (website editor)

Extend the existing `confirmation` block of `website_config.checkout_config`
(`ConfirmationConfig`) with an optional delivery section. All fields are
localized maps (`{ fr, en, he }`) like the rest of the confirmation config:

```jsonc
"confirmation": {
  "title": { ... }, "subtitle": { ... }, "actions": [...], "faq": [...],
  "delivery": {
    "show_delivery_details": true,   // show address block on confirmation
    "show_courier": true,            // show courier name/phone once assigned
    "show_eta": true,                // show estimated delivery window
    "note": { "fr": "Le livreur vous contactera ~30 min avant l'arrivée.", "en": "...", "he": "..." }
  }
}
```

The server only needs to persist/echo this JSON as part of `website_config`
(it's already a freeform JSON blob); no schema work beyond storage.

## 5. Frontend wiring summary (already implemented)

- **admin** `src/lib/api.ts`: `Role` now includes `'courier'`; `Order` has
  `courier_*`; `assignCourier`, `bulkAssignCourier`, and a `COURIER_ROLE_KEY`
  helper + `isCourier(staff)` predicate.
- **admin** orders page: per-delivery-row selection checkboxes + a bulk
  "Assign courier" bar, and an "Assign courier" control in the order detail
  drawer (delivery orders, until delivered).
- **web** `lib/types.ts` / `services/api.ts`: `OrderResponse` gains
  `courierName`, `courierPhone`, and a `deliveryInfo` object; `fetchOrder`
  reads them from the order (top-level or `external_metadata`).
- **web** confirmation page: a delivery-info card (address), courier card
  (name + tap-to-call phone), ETA window, and the owner's delivery note —
  each gated by the `confirmation.delivery` flags.
- **admin** `ConfirmationEditor`: a "Livraison" section editing the flags +
  note above.
