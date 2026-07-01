# Send Receipt to Customer — Design

**Date:** 2026-07-01
**Service:** foodyadmin (frontend-only)
**Status:** Approved for planning

---

## 1. Problem

In the order detail drawer, staff can currently **print** the customer receipt or the
kitchen ticket ("Imprimer le ticket" → *Reçu client* / *Ticket cuisine*). To get that
receipt to the customer, staff have to print-to-PDF, download it, then manually attach it
to WhatsApp or email. That round-trip is slow and clumsy.

**Goal:** let staff send the customer their receipt directly from the drawer, in one tap,
via WhatsApp or email.

This is **Feature A** of a two-part effort. Feature B (surfacing the real Summit fiscal
invoice) is a separate spec and is explicitly out of scope here.

## 2. Scope

- **In scope:** WhatsApp + email + copy-link share actions in the foodyadmin order drawer,
  using the customer's phone/email already on the order and the existing hosted receipt page.
- **Out of scope:** any backend change; server-side (automated Twilio/SES) sending;
  PDF generation; fiscal invoices (Summit/PayPlus); the customer-facing foodyweb receipt page
  itself (already exists and is reused as-is).

## 3. Approach

**Device deep-links, staff sends.** Buttons open WhatsApp / the mail client on the staff
member's own device, pre-filled; staff taps send. Zero backend, zero per-message cost, works
for every restaurant regardless of payment/Twilio configuration. This mirrors the existing
payment-link WhatsApp button already in the drawer.

### Why no backend change is needed
- The order payload returned by `GET /orders` and `GET /orders/:id` serializes the full
  `common.Order` struct, which already includes:
  - `receipt_token` (`Order.ReceiptToken`, generated at order creation in
    `foodyserver/internal/orders/service.go`),
  - `customer_email` (`Order.CustomerEmail`),
  - `customer_phone` (`Order.CustomerPhone`).
- The hosted, tokenized, public receipt page already exists:
  `foodyweb /receipt/[token]` backed by `GET /api/v1/public/receipts/:token`.
- foodyadmin already exposes `NEXT_PUBLIC_WEB_URL` (default `https://app.foody-pos.co.il`),
  used today by the website builder.

So the receipt URL is simply:
```
{NEXT_PUBLIC_WEB_URL}/receipt/{order.receipt_token}
```

## 4. UX

A new dropdown button **"Envoyer au client"** in the drawer footer, next to the existing
"Imprimer le ticket". It mirrors the existing `PrintTicketMenu` component so it looks native.

```
[ Modifier ]  [ Imprimer le ticket ▾ ]  [ Envoyer au client ▾ ]
                                         ├ Envoyer par WhatsApp
                                         ├ Envoyer par email
                                         └ Copier le lien
```

Actions:
- **Envoyer par WhatsApp** — opens `https://wa.me/{phone}?text=...` pre-filled. Shown only
  when `customer_phone` has digits (same gating as the payment-link button).
- **Envoyer par email** — opens `mailto:{customer_email}?subject=...&body=...`. If we have
  the customer email it is pre-filled in *To*; otherwise *To* is blank for staff to type.
  Always shown.
- **Copier le lien** — copies the receipt URL to the clipboard; brief "Copié" confirmation.

### Message content (short summary + link)

Localized via the existing `t()` infra (fr default, en, he). French copy:

- **WhatsApp / email body:**
  `Bonjour {name}, voici le reçu de votre commande #{id} d'un montant de ₪{total}. {url}`
- **Email subject:** `Reçu de votre commande #{id}`

`{name}` falls back gracefully to an empty greeting if the order has no customer name.
No em dash used as a separator in any UI label (project convention).

## 5. Reuse (no duplication)

- Phone normalization: `(order.customer_phone || '').replace(/\D/g, '')` — identical to the
  existing `payLinkWhatsApp` in `OrderDetailDrawer.tsx`.
- Dropdown/menu markup and open/close behavior: modeled on the existing `PrintTicketMenu`.
- Icons from the current lucide set already imported in the drawer
  (`MessageCircleIcon`, `LinkIcon`, plus a mail icon).
- Receipt URL construction centralized in one small helper so WhatsApp / email / copy all
  share it.

## 6. Edge cases

- **No phone** → WhatsApp option hidden.
- **No `receipt_token`** (only very old orders predating tokenization) → link cannot be
  built; the send actions degrade to summary text only (no URL) and copy-link is disabled
  with a hint. Nearly all orders have a token.
- **No `customer_email`** → email action still offered; `mailto` opens with an empty *To*.
- **Long text** → message is deliberately short (one line + URL) to stay clean on WhatsApp.

## 7. Files touched

- `foodyadmin/src/components/orders/OrderDetailDrawer.tsx` — add the "Envoyer au client"
  dropdown next to `PrintTicketMenu`; build the receipt URL + prefilled links; wire actions.
- Admin i18n/translation source(s) — add the new label + message keys for fr/en/he.
- (Possibly) a tiny local helper for the receipt URL + message builders, colocated with the
  drawer, to keep the component thin.

No new API client methods, no server, no models.

## 8. Validation

- `cd foodyadmin && npm run lint && npx tsc --noEmit`.
- Manual: open a web order in the drawer →
  - WhatsApp opens pre-filled with the summary + a link that resolves to the receipt page;
  - email opens pre-filled (To populated when the order has an email);
  - copy-link copies the correct URL;
  - an order with no phone hides the WhatsApp option.

## 9. Follow-up (separate spec)

**Feature B — Summit invoice.** Summit already auto-generates the real fiscal invoice at
payment; Foody stores its `document_id` in `Order.ExternalMeta`. A later spec will add
retrieval of that document (via Summit's document API) and a view/download/send action,
for Summit restaurants only. PayPlus issues no fiscal invoice in the current setup, so it is
not covered by Feature B.
