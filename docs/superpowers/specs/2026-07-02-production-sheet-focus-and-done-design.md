# Production Sheet — Crosshair Focus + Mark-Done — Design

**Date:** 2026-07-02
**Service:** foodyadmin (frontend-only)
**Status:** Approved for planning

---

## 1. Problem

The "Plan de production" sheet ([orders/production/page.tsx](../../../src/app/[restaurantId]/orders/production/page.tsx),
rendered by [ProductionMatrix.tsx](../../../src/components/production/ProductionMatrix.tsx))
is a wide **customer × item** matrix. Two pains for the cook working through it:

1. **Losing your place.** With many item columns, it's hard to tell which customer row and
   which item column a given number belongs to. Today rows have only a faint whole-row hover
   tint (from the shared `DataTable`); there is no column highlight.
2. **No sense of progress.** Once a customer's order is prepared, there's no way to mark it
   done. Finished orders stay mixed in with pending ones, so the cook keeps re-scanning rows
   they've already handled.

**Goals:**
- A strong **crosshair** hover aid: hovering a cell lights up its whole row *and* whole column
  so the eye lands on the "who" (customer) and the "what" (item).
- A **mark-done** control per customer: check it off → the row dims + strikes through and sinks
  below the active rows, keeping remaining work at the top and done work out of the way but
  still visible/auditable.

## 2. Scope

- **In scope:** crosshair hover highlight and per-customer mark-done (with dim + strikethrough
  + sink-to-bottom) in the production matrix; per-device, per-day persistence of the done set
  in `localStorage`; new i18n keys.
- **Out of scope (YAGNI for v1):**
  - Any backend change, shared/multi-device state, or order-status changes. Done is a
    per-device, per-day view aid only. (Decision confirmed with user.)
  - **Burn-down totals.** The "À préparer" header totals stay as the **full-day plan** and do
    NOT decrement as orders are marked done. This keeps the box-packing breakdown under each
    total correct. A burn-down toggle is a possible future enhancement, not v1. (Option A,
    confirmed with user.)
  - FLIP move animations — a simple opacity/colors transition is enough.

## 3. Feature 1 — Crosshair hover focus (row + column)

### Behavior
- Hovering any **body cell** highlights:
  - the **entire row** (tint + a subtle edge accent) and emphasizes the **customer name**
    (sticky-left cell) — bolder / brand color;
  - the **entire column** (tint + an inset accent) and emphasizes the **item name header** and
    its **"À préparer" total** cell.
- Highlight clears on mouse-leave of the table body. Hover-only; no persistence.
- **Replaces** today's faint whole-row-only tint with the coordinated crosshair.
- No effect on print (`print:` variants leave the sheet as-is; crosshair is hover state only).

### Implementation
- Add two state values to `ProductionMatrix`: `hoverRow: number | null` (order_id) and
  `hoverCol: number | null` (item_id). This mirrors the existing `overCat` / `overItem`
  drag-state already in the component.
- Set them from `onMouseEnter` on each body cell; clear `hoverRow`/`hoverCol` on the body's
  `onMouseLeave` (single handler on `<tbody>`/`DataTableBody`) to avoid per-cell leave churn.
- Each body cell derives `isRowActive = o.order_id === hoverRow` and
  `isColActive = id === hoverCol` and applies the highlight classes accordingly.
- **Sticky cells must override their hardcoded background** so they light up with the rest of
  the row/column:
  - the sticky-left customer cell hardcodes `bg-white dark:bg-[#111111]` — when its row is
    hovered it must switch to the highlight background;
  - the sticky header cells (item name row + "À préparer" total row) use `HEAD_BG` — when their
    column is hovered they must switch to the highlight background.
- Reuse existing accent tokens: `--brand-500` for the accent line (same token the drag
  drop-target uses: `shadow-[inset_2px_0_0_0_var(--brand-500)]`), and a light brand/neutral
  tint for the band. Keep it visually consistent with the existing orange hover tint, just
  applied to both axes and stronger.

### Performance note
Hover changes re-render the matrix (state change). For typical sheet sizes (tens of customers ×
tens of items) this is fine and matches how the drag state already re-renders. If it ever feels
heavy, a follow-up can push the row/column matching to CSS attribute selectors; not needed for v1.

## 4. Feature 2 — Mark-done (checkbox in the customer cell)

### Behavior
- A **checkbox** sits at the start of the sticky customer cell, before the customer name.
- It calls `stopPropagation()` on click so it does NOT trigger the row's existing
  `onRowClick` (which opens the order-detail drawer). Toggling it flips the order's done state.
- When checked, the row becomes **dimmed (reduced opacity) + strikethrough**, and it **sinks
  below the active rows** under a thin **"Terminé (N)"** divider row. Un-checking restores it
  to its normal position among the active rows.
- The divider row spans all columns (sticky-left label + count).

### Rendering / ordering
- Derive from `sheet.orders` (after the existing search/column-order processing):
  - `activeOrders` = orders whose id is **not** in the done set, in current order;
  - `doneOrders` = orders whose id **is** in the done set, in current order.
- Render: `activeOrders` rows → "Terminé (N)" divider row (only when `doneOrders.length > 0`) →
  `doneOrders` rows.
- Transition: apply `transition-colors`/opacity so the dim is smooth. No FLIP reordering
  animation (out of scope).

### Split-mode interaction
`ProductionMatrix` supports `splitMode: 'none' | 'category' | 'customer'`.
- In the **default flat view** (`'none'`, and `'category'` which splits columns not rows):
  dim + strike **and** sink-to-bottom apply as above.
- In **`'customer'` split mode** rows are already grouped by customer, so sink-to-bottom would
  fight the grouping. There we apply **dim + strike only** (no reordering). The checkbox and
  its persistence work identically in all modes.

## 5. Persistence (local to device, per day)

- New hook `useProductionDone(restaurantId, date)`, modeled on the existing
  [useProductionColumnOrder](../../../src/lib/production-column-order.ts).
- Stores the set of done `order_id`s for that date in `localStorage` under key
  **`foody.production.done.{restaurantId}.{date}`** (serialized as a JSON array of numbers).
- API: returns `{ doneIds: Set<number>, isDone(id), toggle(id), setDone(id, boolean) }`.
- Keying by date means each day naturally starts with a clean sheet; no manual "clear" needed.
- Graceful fallback on private-mode / quota / parse errors (same defensive pattern as the
  column-order hook) — failures degrade to in-memory-only, never throw.

## 6. i18n

New keys added to **all three** locales (en / he / fr) in
[src/lib/i18n.tsx](../../../src/lib/i18n.tsx) — foodyadmin's only CI gate is
`npm run check:i18n`, which fails if a key is missing from any locale.

- `productionDoneDivider` — divider label, e.g. fr "Terminé", en "Done", he "הושלם".
- `productionMarkDone` — checkbox `aria-label`, e.g. fr "Marquer comme prêt".

Exact copy finalized during implementation; French is the default/fallback. No em dash used as
a separator in any label (project convention).

## 7. Files touched

- [ProductionMatrix.tsx](../../../src/components/production/ProductionMatrix.tsx) — crosshair
  hover state + classes on rows/cells/sticky cells/headers; checkbox in the customer cell;
  split into active/done + divider row; consume `useProductionDone`.
- [production-column-order.ts](../../../src/lib/production-column-order.ts) sibling — new
  `production-done.ts` with the `useProductionDone` hook (kept separate, single purpose).
- [orders/production/page.tsx](../../../src/app/[restaurantId]/orders/production/page.tsx) —
  only if the hook needs to be created at the page level and passed down; prefer creating it
  inside `ProductionMatrix` (it already receives `restaurantId` context + the active `date`).
- [src/lib/i18n.tsx](../../../src/lib/i18n.tsx) — new keys for fr/en/he.

No new API client methods, no server, no models, no migrations.

## 8. Validation

- `cd foodyadmin && npm run check:i18n && npm run lint && npx tsc --noEmit`.
- Manual:
  - Hover a cell → its whole row and whole column light up (including the sticky customer cell
    and the sticky item header + total); moving to another cell moves the crosshair; leaving
    the table clears it.
  - Check a customer's box → row dims + strikes through and drops below the "Terminé (N)"
    divider; the divider count is correct; un-checking restores it above the divider.
  - The "À préparer" totals do **not** change when marking done (Option A).
  - Reload the page → done state for the same day persists; switching to another day starts
    clean.
  - Clicking a done/active row (not the checkbox) still opens the order-detail drawer.
  - `'customer'` split mode: checkbox dims/strikes the row without reordering.

## 9. Follow-ups (not v1)

- **Burn-down totals toggle** — optionally show "remaining to prepare" (full total minus done)
  as an alternative to the full-day plan.
- **Shared/backend done state** — if multiple tablets in one kitchen need a single source of
  truth, promote the done flag to the server (migration + endpoint + API client).
- **FLIP animation** — animate the row physically sliding to the bottom.
